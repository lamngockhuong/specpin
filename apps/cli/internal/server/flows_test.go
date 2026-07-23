package server

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGetFlowsDefaultsWhenAbsent(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/flows", "", authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("get flows default: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"flows"`) || !strings.Contains(body, `"version"`) {
		t.Errorf("default flows body missing fields: %s", body)
	}
}

func TestPutValidFlowsPersists(t *testing.T) {
	srv, dir := newTestServer(t)
	body := `{"version":"1.0","flows":[{"id":"application-status","object":{"en":"Application"},"states":[{"id":"draft","label":{"en":"Draft"},"kind":"initial"},{"id":"approved","label":{"en":"Approved"},"kind":"terminal"}],"transitions":[{"id":"t1","from":"draft","to":"approved","trigger":{"en":"Approve"}}]}]}`
	rec := do(t, srv, http.MethodPut, "/flows", body, authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("put valid flows: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	raw, err := os.ReadFile(filepath.Join(dir, "flows.json"))
	if err != nil {
		t.Fatalf("flows.json not written: %v", err)
	}
	// Pretty-printed for clean Git diffs.
	if !strings.Contains(string(raw), "\n  \"flows\"") {
		t.Errorf("expected pretty-printed flows.json, got:\n%s", raw)
	}
	// And it now reads back via GET.
	rec = do(t, srv, http.MethodGet, "/flows", "", authHeader())
	if !strings.Contains(rec.Body.String(), "application-status") {
		t.Errorf("GET after PUT missing content: %s", rec.Body.String())
	}
}

func TestPutInvalidFlowsRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	body := `{"flows":[]}` // missing required "version"
	rec := do(t, srv, http.MethodPut, "/flows", body, authHeader())
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid flows: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "schema_invalid") {
		t.Errorf("expected schema_invalid error, got %s", rec.Body.String())
	}
}

func TestFlowsRequiresToken(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/flows", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("flows without token: want 401, got %d", rec.Code)
	}
}

// The empty default returned for an absent flows.json must itself validate, so
// a future schema bound can never make GET hand back a body the same sidecar
// would reject on PUT.
func TestDefaultFlowsBodyValidates(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/flows", "", authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("get flows default: want 200, got %d", rec.Code)
	}
	if errs := srv.validator.ValidateFlows(rec.Body.Bytes()); errs != nil {
		t.Errorf("default flows body should validate, got: %v", errs)
	}
}
