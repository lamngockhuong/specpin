package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

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
