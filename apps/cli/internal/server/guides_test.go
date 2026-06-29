package server

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGetGuidesDefaultsWhenAbsent(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/guides", "", authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("get guides default: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"guides"`) || !strings.Contains(body, `"version"`) {
		t.Errorf("default guides body missing fields: %s", body)
	}
}

func TestPutValidGuidesPersists(t *testing.T) {
	srv, dir := newTestServer(t)
	body := `{"version":"1.0","guides":[{"id":"onboarding","name":"Onboarding tour","steps":["login-submit-btn"]}]}`
	rec := do(t, srv, http.MethodPut, "/guides", body, authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("put valid guides: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	raw, err := os.ReadFile(filepath.Join(dir, "guides.json"))
	if err != nil {
		t.Fatalf("guides.json not written: %v", err)
	}
	// Pretty-printed for clean Git diffs.
	if !strings.Contains(string(raw), "\n  \"guides\"") {
		t.Errorf("expected pretty-printed guides.json, got:\n%s", raw)
	}
	// And it now reads back via GET.
	rec = do(t, srv, http.MethodGet, "/guides", "", authHeader())
	if !strings.Contains(rec.Body.String(), "Onboarding tour") {
		t.Errorf("GET after PUT missing content: %s", rec.Body.String())
	}
}

func TestPutInvalidGuidesRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	body := `{"guides":[]}` // missing required "version"
	rec := do(t, srv, http.MethodPut, "/guides", body, authHeader())
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid guides: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "schema_invalid") {
		t.Errorf("expected schema_invalid error, got %s", rec.Body.String())
	}
}

func TestGuidesRequiresToken(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/guides", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("guides without token: want 401, got %d", rec.Code)
	}
}

// The empty default returned for an absent guides.json must itself validate, so
// a future schema bound can never make GET hand back a body the same sidecar
// would reject on PUT.
func TestDefaultGuidesBodyValidates(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/guides", "", authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("get guides default: want 200, got %d", rec.Code)
	}
	if errs := srv.validator.ValidateGuides(rec.Body.Bytes()); errs != nil {
		t.Errorf("default guides body should validate, got: %v", errs)
	}
}
