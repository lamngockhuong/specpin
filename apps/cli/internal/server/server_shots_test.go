package server

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

const validShotBody = `{"version":"1","screenId":"checkout","image":"shots/checkout.png","items":[{"itemNo":"1","bbox":{"startX":0,"startY":0,"endX":10,"endY":10},"specId":"cta"}]}`

func TestListShotsEmpty(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/shots", "", authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("list shots: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"screenIds"`) {
		t.Errorf("list body missing screenIds: %s", rec.Body.String())
	}
}

func TestPutGetListDeleteShot(t *testing.T) {
	srv, _ := newTestServer(t)

	rec := do(t, srv, http.MethodPut, "/shots/checkout", validShotBody, authHeader())
	if rec.Code != http.StatusOK {
		t.Fatalf("put shot: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}

	rec = do(t, srv, http.MethodGet, "/shots/checkout", "", authHeader())
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"checkout"`) {
		t.Fatalf("get shot: want 200 with content, got %d (%s)", rec.Code, rec.Body.String())
	}

	rec = do(t, srv, http.MethodGet, "/shots", "", authHeader())
	if !strings.Contains(rec.Body.String(), `"checkout"`) {
		t.Errorf("list after put missing checkout: %s", rec.Body.String())
	}

	rec = do(t, srv, http.MethodDelete, "/shots/checkout", "", authHeader())
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete shot: want 204, got %d (%s)", rec.Code, rec.Body.String())
	}

	rec = do(t, srv, http.MethodGet, "/shots/checkout", "", authHeader())
	if rec.Code != http.StatusNotFound {
		t.Errorf("get after delete: want 404, got %d", rec.Code)
	}
}

func TestGetShotAbsentIs404(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := do(t, srv, http.MethodGet, "/shots/nope", "", authHeader())
	if rec.Code != http.StatusNotFound {
		t.Errorf("get absent shot: want 404, got %d", rec.Code)
	}
}

func TestPutInvalidShotRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	body := `{"screenId":"checkout","image":"x","items":[]}` // missing required "version"
	rec := do(t, srv, http.MethodPut, "/shots/checkout", body, authHeader())
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid shot: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "schema_invalid") {
		t.Errorf("expected schema_invalid, got %s", rec.Body.String())
	}
}

func TestPutShotBodyScreenIDMismatch(t *testing.T) {
	srv, _ := newTestServer(t)
	// URL says login, body says checkout.
	rec := do(t, srv, http.MethodPut, "/shots/login", validShotBody, authHeader())
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("screenId mismatch: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestPutShotTraversalRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	// A path-separator screenId cannot reach the handler via the router; a
	// dot-bearing id that does route is rejected by the store guard as 400.
	rec := do(t, srv, http.MethodPut, "/shots/with.dot",
		`{"version":"1","screenId":"with.dot","image":"x","items":[]}`, authHeader())
	if rec.Code != http.StatusBadRequest {
		t.Errorf("dotted screenId: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestShotsRequireToken(t *testing.T) {
	srv, _ := newTestServer(t)
	for _, m := range []struct {
		method, path string
	}{
		{http.MethodGet, "/shots"},
		{http.MethodGet, "/shots/checkout"},
		{http.MethodPut, "/shots/checkout"},
		{http.MethodDelete, "/shots/checkout"},
	} {
		rec := do(t, srv, m.method, m.path, "", nil)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s without token: want 401, got %d", m.method, m.path, rec.Code)
		}
	}
}

func TestPutShotBroadcastsSSE(t *testing.T) {
	srv, _ := newTestServer(t)
	ch, cancel := srv.hub.Subscribe()
	defer cancel()

	do(t, srv, http.MethodPut, "/shots/checkout", validShotBody, authHeader())

	select {
	case payload := <-ch:
		if !strings.Contains(payload, "change") {
			t.Errorf("unexpected SSE payload: %s", payload)
		}
	case <-time.After(time.Second):
		t.Error("expected SSE broadcast on shot write, got none")
	}
}
