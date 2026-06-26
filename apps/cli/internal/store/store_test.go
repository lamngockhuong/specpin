package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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

func newTempStore(t *testing.T) *Store {
	t.Helper()
	dir := filepath.Join(t.TempDir(), ".specs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := `{"version":"1.0","project":"Test","domains":[],"specFiles":[]}`
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
	return New(dir)
}

func TestSaveAndLoadRoundTrip(t *testing.T) {
	s := newTempStore(t)
	if err := s.SaveSpec("login.spec.json", json.RawMessage(validSpec)); err != nil {
		t.Fatalf("save: %v", err)
	}

	bundle, err := s.Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(bundle.Specs) != 1 {
		t.Fatalf("want 1 spec, got %d", len(bundle.Specs))
	}
	if bundle.Specs[0]["_file"] != "login.spec.json" {
		t.Errorf("missing _file annotation: %v", bundle.Specs[0]["_file"])
	}
	if bundle.Specs[0]["id"] != "login-btn" {
		t.Errorf("wrong id: %v", bundle.Specs[0]["id"])
	}

	// File is pretty-printed (2-space) and reviewable.
	raw, _ := os.ReadFile(filepath.Join(s.Dir(), "login.spec.json"))
	if !strings.Contains(string(raw), "\n  \"group\"") {
		t.Errorf("expected 2-space pretty print, got:\n%s", raw)
	}
}

func TestSaveSpecUpsertsByID(t *testing.T) {
	s := newTempStore(t)
	_ = s.SaveSpec("a.spec.json", json.RawMessage(validSpec))
	updated := strings.Replace(validSpec, `"submits the form"`, `"updated text"`, 1)
	_ = s.SaveSpec("a.spec.json", json.RawMessage(updated))

	bundle, _ := s.Load()
	if len(bundle.Specs) != 1 {
		t.Fatalf("upsert should not duplicate, got %d", len(bundle.Specs))
	}
	desc, _ := bundle.Specs[0]["description"].(map[string]any)
	if desc["en"] != "updated text" {
		t.Errorf("expected updated description, got %v", bundle.Specs[0]["description"])
	}
}

func TestDeleteSpec(t *testing.T) {
	s := newTempStore(t)
	_ = s.SaveSpec("a.spec.json", json.RawMessage(validSpec))
	if err := s.DeleteSpec("login-btn"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	bundle, _ := s.Load()
	if len(bundle.Specs) != 0 {
		t.Errorf("expected 0 specs after delete, got %d", len(bundle.Specs))
	}
	if err := s.DeleteSpec("missing"); err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestPathTraversalRejected(t *testing.T) {
	s := newTempStore(t)
	// .spec.json-suffixed so they pass the name check and hit the traversal guard.
	for _, bad := range []string{
		"../evil.spec.json",
		"../../etc/passwd.spec.json",
		"/abs/path.spec.json",
		"sub/../../out.spec.json",
	} {
		if err := s.SaveSpec(bad, json.RawMessage(validSpec)); !errors.Is(err, ErrTraversal) {
			t.Errorf("expected ErrTraversal for %q, got %v", bad, err)
		}
	}
	if _, err := os.Stat(filepath.Join(s.Dir(), "..", "evil.spec.json")); err == nil {
		t.Error("traversal wrote a file outside .specs")
	}
}

func TestNonSpecFileNameRejected(t *testing.T) {
	s := newTempStore(t)
	for _, bad := range []string{"manifest.json", "notes.txt", "data.json"} {
		if err := s.SaveSpec(bad, json.RawMessage(validSpec)); !errors.Is(err, ErrInvalidName) {
			t.Errorf("expected ErrInvalidName for %q, got %v", bad, err)
		}
	}
}
