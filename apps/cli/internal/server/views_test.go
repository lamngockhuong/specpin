package server

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGetViewsDefaultsWhenAbsent(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/views", "", authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("get views default: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"hidden"`) || !strings.Contains(body, `"version"`) {
		t.Errorf("default views body missing fields: %s", body)
	}
}

func TestPutValidViewsPersists(t *testing.T) {
	srv, dir := newTestServer(t)
	body := `{"version":"1.0","hidden":["tag:auth","url:/admin/**"]}`
	rec := do(t, srv, http.MethodPut, "/views", body, authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("put valid views: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	raw, err := os.ReadFile(filepath.Join(dir, "views.json"))
	if err != nil {
		t.Fatalf("views.json not written: %v", err)
	}
	// Pretty-printed for clean Git diffs.
	if !strings.Contains(string(raw), "\n  \"hidden\"") {
		t.Errorf("expected pretty-printed views.json, got:\n%s", raw)
	}
	// And it now reads back via GET.
	rec = do(t, srv, http.MethodGet, "/views", "", authHeader())
	if !strings.Contains(rec.Body.String(), "tag:auth") {
		t.Errorf("GET after PUT missing content: %s", rec.Body.String())
	}
}

func TestPutInvalidViewsRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	body := `{"version":"1.0"}` // missing required "hidden"
	rec := do(t, srv, http.MethodPut, "/views", body, authHeader())
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid views: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "schema_invalid") {
		t.Errorf("expected schema_invalid error, got %s", rec.Body.String())
	}
}

func TestViewsRequiresToken(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/views", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("views without token: want 401, got %d", rec.Code)
	}
}
