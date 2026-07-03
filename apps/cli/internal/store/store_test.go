package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
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
	if err := s.SaveSpec("login.spec.json", json.RawMessage(validSpec), ""); err != nil {
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
	_ = s.SaveSpec("a.spec.json", json.RawMessage(validSpec), "")
	updated := strings.Replace(validSpec, `"submits the form"`, `"updated text"`, 1)
	_ = s.SaveSpec("a.spec.json", json.RawMessage(updated), "")

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
	_ = s.SaveSpec("a.spec.json", json.RawMessage(validSpec), "")
	if err := s.DeleteSpec("login-btn", ""); err != nil {
		t.Fatalf("delete: %v", err)
	}
	bundle, _ := s.Load()
	if len(bundle.Specs) != 0 {
		t.Errorf("expected 0 specs after delete, got %d", len(bundle.Specs))
	}
	if err := s.DeleteSpec("missing", ""); err != ErrNotFound {
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
		if err := s.SaveSpec(bad, json.RawMessage(validSpec), ""); !errors.Is(err, ErrTraversal) {
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
		if err := s.SaveSpec(bad, json.RawMessage(validSpec), ""); !errors.Is(err, ErrInvalidName) {
			t.Errorf("expected ErrInvalidName for %q, got %v", bad, err)
		}
	}
}

func TestGuidesRoundTrip(t *testing.T) {
	s := newTempStore(t)
	// Absent file returns the empty default.
	raw, err := s.LoadGuides()
	if err != nil {
		t.Fatalf("load default guides: %v", err)
	}
	if !strings.Contains(string(raw), `"guides"`) || !strings.Contains(string(raw), `"version"`) {
		t.Errorf("default guides missing fields: %s", raw)
	}

	cfg := `{"version":"1.0","guides":[{"id":"onboarding","name":"Tour","steps":["login-btn"]}]}`
	if err := s.SaveGuides(json.RawMessage(cfg)); err != nil {
		t.Fatalf("save guides: %v", err)
	}
	raw, err = s.LoadGuides()
	if err != nil {
		t.Fatalf("reload guides: %v", err)
	}
	if !strings.Contains(string(raw), "onboarding") {
		t.Errorf("guides round-trip lost content: %s", raw)
	}
	// Pretty-printed for clean Git diffs.
	if !strings.Contains(string(raw), "\n  \"guides\"") {
		t.Errorf("expected pretty-printed guides.json, got:\n%s", raw)
	}
}

// Concurrent appends to the SAME spec file must all survive: each SaveSpec is a
// load-modify-write of one file, so without the store mutex two goroutines could
// both read the pre-append slice and the second write would clobber the first's
// append. Writing distinct ids into one file is the case that actually exercises
// the lock. Run with -race to catch the data race directly.
func TestConcurrentWritesNoLostSpec(t *testing.T) {
	s := newTempStore(t)
	const n = 16
	var wg sync.WaitGroup
	wg.Add(n)
	for i := range n {
		go func(i int) {
			defer wg.Done()
			spec := strings.Replace(validSpec, `"login-btn"`, fmt.Sprintf(`"spec-%d"`, i), 1)
			if err := s.SaveSpec("shared.spec.json", json.RawMessage(spec), ""); err != nil {
				t.Errorf("save %d: %v", i, err)
			}
		}(i)
	}
	wg.Wait()
	bundle, err := s.Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(bundle.Specs) != n {
		t.Fatalf("want %d specs after concurrent same-file writes, got %d (lost append)", n, len(bundle.Specs))
	}
}

// A stale If-Match (the bundle changed since the caller read it) is rejected with
// ErrVersionMismatch; an empty or current If-Match proceeds.
func TestIfMatchOptimisticConcurrency(t *testing.T) {
	s := newTempStore(t)
	if err := s.SaveSpec("a.spec.json", json.RawMessage(validSpec), ""); err != nil {
		t.Fatalf("seed: %v", err)
	}
	bundle, _ := s.Load()
	etag := ETagFor(bundle)

	// A matching If-Match succeeds and changes the bundle (so the tag goes stale).
	updated := strings.Replace(validSpec, `"submits the form"`, `"v2"`, 1)
	if err := s.UpdateSpec("login-btn", json.RawMessage(updated), etag); err != nil {
		t.Fatalf("update with current etag: %v", err)
	}

	// Re-using the now-stale tag must be rejected.
	updated2 := strings.Replace(validSpec, `"submits the form"`, `"v3"`, 1)
	if err := s.UpdateSpec("login-btn", json.RawMessage(updated2), etag); !errors.Is(err, ErrVersionMismatch) {
		t.Fatalf("want ErrVersionMismatch for stale If-Match, got %v", err)
	}

	// Empty If-Match always proceeds (backward compatible).
	if err := s.UpdateSpec("login-btn", json.RawMessage(updated2), ""); err != nil {
		t.Fatalf("empty If-Match should proceed: %v", err)
	}
}

// RT-M2: a .specs/ containing guides.json must still load specs cleanly;
// guides.json must not be scanned as a spec file (suffix is .json, not .spec.json).
func TestGuidesJSONNotParsedAsSpec(t *testing.T) {
	s := newTempStore(t)
	if err := s.SaveSpec("login.spec.json", json.RawMessage(validSpec), ""); err != nil {
		t.Fatalf("save spec: %v", err)
	}
	if err := s.SaveGuides(json.RawMessage(`{"version":"1.0","guides":[]}`)); err != nil {
		t.Fatalf("save guides: %v", err)
	}
	bundle, err := s.Load()
	if err != nil {
		t.Fatalf("load with guides.json present: %v", err)
	}
	if len(bundle.Specs) != 1 {
		t.Fatalf("guides.json polluted the spec scan: want 1 spec, got %d", len(bundle.Specs))
	}
	names, err := s.SpecFileNames()
	if err != nil {
		t.Fatalf("spec file names: %v", err)
	}
	for _, n := range names {
		if n == "guides.json" {
			t.Errorf("guides.json was listed as a spec file: %v", names)
		}
	}
}

func TestCanonicalizeExpandsAndKeepsKeyOrder(t *testing.T) {
	// Compact input with a deliberately non-alphabetical key order.
	in := `{ "b": 1, "a": [1, 2], "c": { "z": true } }`
	out, err := Canonicalize([]byte(in))
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	got := string(out)
	// Fully expanded: array elements on their own lines, trailing newline.
	if !strings.Contains(got, "\n    1,\n    2\n") {
		t.Errorf("array not expanded:\n%s", got)
	}
	if got[len(got)-1] != '\n' {
		t.Errorf("missing trailing newline")
	}
	// Key order preserved (b before a before c), never alphabetized.
	bi, ai, ci := strings.Index(got, `"b"`), strings.Index(got, `"a"`), strings.Index(got, `"c"`)
	if !(bi < ai && ai < ci) {
		t.Errorf("key order not preserved, got:\n%s", got)
	}
}

func TestCanonicalizeIsIdempotent(t *testing.T) {
	once, err := Canonicalize([]byte(`{ "a": [1, 2], "b": { "x": 1 } }`))
	if err != nil {
		t.Fatal(err)
	}
	twice, err := Canonicalize(once)
	if err != nil {
		t.Fatal(err)
	}
	if string(once) != string(twice) {
		t.Errorf("Canonicalize not idempotent:\nonce:\n%s\ntwice:\n%s", once, twice)
	}
}

func TestCanonicalizeRejectsInvalidJSON(t *testing.T) {
	if _, err := Canonicalize([]byte(`{ "a": `)); err == nil {
		t.Error("expected error on invalid JSON")
	}
}
