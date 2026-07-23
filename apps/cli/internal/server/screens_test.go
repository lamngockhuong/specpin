package server

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGetScreensDefaultsWhenAbsent(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/screens", "", authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("get screens default: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"screens"`) || !strings.Contains(body, `"transitions"`) || !strings.Contains(body, `"version"`) {
		t.Errorf("default screens body missing fields: %s", body)
	}
}

func TestPutValidScreensPersists(t *testing.T) {
	srv, dir := newTestServer(t)
	body := `{"version":"1.0","screens":[{"id":"home","name":{"en":"Home"},"urlGlob":"/"}],"transitions":[]}`
	rec := do(t, srv, http.MethodPut, "/screens", body, authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("put valid screens: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	raw, err := os.ReadFile(filepath.Join(dir, "screens.json"))
	if err != nil {
		t.Fatalf("screens.json not written: %v", err)
	}
	// Pretty-printed for clean Git diffs.
	if !strings.Contains(string(raw), "\n  \"screens\"") {
		t.Errorf("expected pretty-printed screens.json, got:\n%s", raw)
	}
	// And it now reads back via GET.
	rec = do(t, srv, http.MethodGet, "/screens", "", authHeader())
	if !strings.Contains(rec.Body.String(), "\"home\"") {
		t.Errorf("GET after PUT missing content: %s", rec.Body.String())
	}
}

func TestPutInvalidScreensRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	body := `{"screens":[],"transitions":[]}` // missing required "version"
	rec := do(t, srv, http.MethodPut, "/screens", body, authHeader())
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid screens: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "schema_invalid") {
		t.Errorf("expected schema_invalid error, got %s", rec.Body.String())
	}
}

func TestScreensRequiresToken(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/screens", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("screens without token: want 401, got %d", rec.Code)
	}
}

// The empty default returned for an absent screens.json must itself validate,
// so a future schema bound can never make GET hand back a body the same
// sidecar would reject on PUT.
func TestDefaultScreensBodyValidates(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/screens", "", authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("get screens default: want 200, got %d", rec.Code)
	}
	if errs := srv.validator.ValidateScreens(rec.Body.Bytes()); errs != nil {
		t.Errorf("default screens body should validate, got: %v", errs)
	}
}
