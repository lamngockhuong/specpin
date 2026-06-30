package server

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"specpin/internal/schema"
	"specpin/internal/store"
)

const token = "test-token-123"

const validSpec = `{
  "id": "login-btn",
  "title": { "en": "Login" },
  "description": { "en": "submits the form" },
  "fingerprint": {
    "cssSelector": "button",
    "xpath": "/button",
    "domPath": ["button"],
    "tagName": "button",
    "attributes": {},
    "positionHint": { "index": 0, "siblingCount": 1 }
  }
}`

func newTestServer(t *testing.T) (*Server, string) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), ".specs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	v, err := schema.NewValidator()
	if err != nil {
		t.Fatalf("validator: %v", err)
	}
	srv := New(store.New(dir), v, NewHub(), token, "Test", "0.0.0-test")
	return srv, dir
}

func do(t *testing.T, srv *Server, method, path, body string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var rdr *strings.Reader
	if body != "" {
		rdr = strings.NewReader(body)
	} else {
		rdr = strings.NewReader("")
	}
	req := httptest.NewRequest(method, path, rdr)
	for k, val := range headers {
		req.Header.Set(k, val)
	}
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func authHeader() map[string]string {
	return map[string]string{"Authorization": "Bearer " + token}
}

func TestHealthRequiresToken(t *testing.T) {
	srv, _ := newTestServer(t)

	rec := do(t, srv, http.MethodGet, "/health", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("no token: want 401, got %d", rec.Code)
	}

	rec = do(t, srv, http.MethodGet, "/health", "", map[string]string{"Authorization": "Bearer wrong"})
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("wrong token: want 401, got %d", rec.Code)
	}

	rec = do(t, srv, http.MethodGet, "/health", "", authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("valid token: want 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"ok":true`) {
		t.Errorf("health body: %s", rec.Body.String())
	}
}

func TestNonExtensionOriginRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	h := authHeader()
	h["Origin"] = "https://evil.example.com"
	rec := do(t, srv, http.MethodGet, "/health", "", h)
	if rec.Code != http.StatusForbidden {
		t.Errorf("web origin: want 403, got %d", rec.Code)
	}
}

func TestExtensionOriginAllowed(t *testing.T) {
	srv, _ := newTestServer(t)
	h := authHeader()
	h["Origin"] = "chrome-extension://abcdefg"
	rec := do(t, srv, http.MethodGet, "/health", "", h)
	if rec.Code != http.StatusOK {
		t.Errorf("extension origin: want 200, got %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "chrome-extension://abcdefg" {
		t.Errorf("missing CORS allow-origin echo")
	}
}

func TestPostSchemaInvalidRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	body := `{"file":"a.spec.json","spec":{"id":"x"}}` // missing required fields
	rec := do(t, srv, http.MethodPost, "/specs", body, authHeader())
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid spec: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "schema_invalid") {
		t.Errorf("expected schema_invalid error, got %s", rec.Body.String())
	}
}

func TestPostValidSpecPersists(t *testing.T) {
	srv, dir := newTestServer(t)
	body := `{"file":"login.spec.json","spec":` + validSpec + `}`
	rec := do(t, srv, http.MethodPost, "/specs", body, authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("valid spec: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	raw, err := os.ReadFile(filepath.Join(dir, "login.spec.json"))
	if err != nil {
		t.Fatalf("spec file not written: %v", err)
	}
	if !strings.Contains(string(raw), "\n  \"specs\"") {
		t.Errorf("expected pretty-printed file, got:\n%s", raw)
	}
}

func TestPostTraversalRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	body := `{"file":"../evil.spec.json","spec":` + validSpec + `}`
	rec := do(t, srv, http.MethodPost, "/specs", body, authHeader())
	if rec.Code != http.StatusBadRequest {
		t.Errorf("traversal via POST: want 400, got %d", rec.Code)
	}
}

// seedManifest writes a minimal manifest.json so GET /specs can Load() and emit
// an ETag (the bare temp dir from newTestServer has no manifest).
func seedManifest(t *testing.T, dir string) {
	t.Helper()
	m := `{"version":"1.0","project":"Test","domains":[],"specFiles":[]}`
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), []byte(m), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestGetSpecsEmitsETag(t *testing.T) {
	srv, dir := newTestServer(t)
	seedManifest(t, dir)
	rec := do(t, srv, http.MethodGet, "/specs", "", authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /specs: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if etag := rec.Header().Get("ETag"); etag == "" {
		t.Error("GET /specs should set an ETag header")
	}
}

// A stale If-Match (the bundle changed since the caller read the ETag) yields 409
// version_mismatch; the current ETag succeeds; no header proceeds unconditionally.
func TestPutStaleIfMatchReturns409(t *testing.T) {
	srv, dir := newTestServer(t)
	seedManifest(t, dir)

	if rec := do(t, srv, http.MethodPost, "/specs", `{"file":"a.spec.json","spec":`+validSpec+`}`, authHeader()); rec.Code != http.StatusOK {
		t.Fatalf("seed POST: %d (%s)", rec.Code, rec.Body.String())
	}
	etag := do(t, srv, http.MethodGet, "/specs", "", authHeader()).Header().Get("ETag")
	if etag == "" {
		t.Fatal("no ETag after seed")
	}

	// Current ETag: PUT succeeds and changes the bundle (so the tag goes stale).
	updated := strings.Replace(validSpec, `"submits the form"`, `"v2"`, 1)
	withMatch := authHeader()
	withMatch["If-Match"] = etag
	if rec := do(t, srv, http.MethodPut, "/specs/login-btn", updated, withMatch); rec.Code != http.StatusOK {
		t.Fatalf("PUT with current ETag: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}

	// Re-using the now-stale ETag is rejected with 409.
	rec := do(t, srv, http.MethodPut, "/specs/login-btn", updated, withMatch)
	if rec.Code != http.StatusConflict {
		t.Fatalf("stale If-Match: want 409, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "version_mismatch") {
		t.Errorf("expected version_mismatch code, got %s", rec.Body.String())
	}

	// No If-Match still proceeds (backward compatible).
	if rec := do(t, srv, http.MethodPut, "/specs/login-btn", updated, authHeader()); rec.Code != http.StatusOK {
		t.Fatalf("PUT without If-Match: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// /events emits a periodic heartbeat comment so an idle-timeout reverse proxy
// keeps the stream open. The interval is dialed down for the test.
func TestEventsHeartbeat(t *testing.T) {
	srv, _ := newTestServer(t)
	prev := sseHeartbeatInterval
	sseHeartbeatInterval = 15 * time.Millisecond
	t.Cleanup(func() { sseHeartbeatInterval = prev })

	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL+"/events", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("connect /events: %v", err)
	}
	defer res.Body.Close()
	if ct := res.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("want text/event-stream, got %q", ct)
	}

	buf := make([]byte, 64)
	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) {
		n, err := res.Body.Read(buf)
		if n > 0 && strings.Contains(string(buf[:n]), ": ping") {
			return // heartbeat observed
		}
		if err == io.EOF {
			break
		}
	}
	t.Error("no heartbeat (: ping) observed on /events within the window")
}
