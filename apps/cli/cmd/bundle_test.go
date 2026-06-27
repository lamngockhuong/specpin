package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// decodeBundle parses bundle stdout into the envelope shape so tests can assert
// on structure rather than string matching.
func decodeBundle(t *testing.T, b []byte) bundleEnvelope {
	t.Helper()
	var env bundleEnvelope
	if err := json.Unmarshal(b, &env); err != nil {
		t.Fatalf("bundle output is not valid JSON: %v\n%s", err, b)
	}
	return env
}

func TestBundleEmitsManifestAndFiles(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": validSpecFile,
	})
	var out, errOut bytes.Buffer
	if code := runBundle(dir, "", &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d\nstderr:\n%s", exitValid, code, errOut.String())
	}

	env := decodeBundle(t, out.Bytes())
	if len(env.Manifest) == 0 {
		t.Error("expected non-empty manifest in bundle")
	}
	if _, ok := env.Files["login.spec.json"]; !ok {
		t.Errorf("expected login.spec.json in files, got keys: %v", keysOf(env.Files))
	}
	// Verify the spec file content round-trips (the per-file on-disk shape, with group).
	var sf struct {
		Group string `json:"group"`
		Specs []any  `json:"specs"`
	}
	if err := json.Unmarshal(env.Files["login.spec.json"], &sf); err != nil {
		t.Fatalf("spec file content not preserved: %v", err)
	}
	if sf.Group != "Login" || len(sf.Specs) != 1 {
		t.Errorf("spec file content altered: group=%q specs=%d", sf.Group, len(sf.Specs))
	}
}

func TestBundleIsPrettyPrintedWithTrailingNewline(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": validSpecFile,
	})
	var out, errOut bytes.Buffer
	if code := runBundle(dir, "", &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d", exitValid, code)
	}
	s := out.String()
	if !strings.HasSuffix(s, "\n") {
		t.Error("expected trailing newline")
	}
	// Pretty-printed output indents nested content with two spaces.
	if !strings.Contains(s, "\n  \"manifest\":") {
		t.Errorf("expected 2-space indented output, got:\n%s", s)
	}
}

func TestBundleWritesToOutFile(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": validSpecFile,
	})
	outPath := filepath.Join(t.TempDir(), "bundle.json")
	var out, errOut bytes.Buffer
	if code := runBundle(dir, outPath, &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d\nstderr:\n%s", exitValid, code, errOut.String())
	}
	if out.Len() != 0 {
		t.Errorf("expected empty stdout in --out mode, got:\n%s", out.String())
	}
	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read out file: %v", err)
	}
	decodeBundle(t, data) // must be valid bundle JSON
	if !strings.HasSuffix(string(data), "\n") {
		t.Error("expected trailing newline in out file")
	}
}

func TestBundleCannotRunWhenManifestMissing(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".specs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	var out, errOut bytes.Buffer
	if code := runBundle(dir, "", &out, &errOut); code != exitCannotRun {
		t.Fatalf("want exit %d, got %d", exitCannotRun, code)
	}
	if out.Len() != 0 {
		t.Errorf("expected no stdout when manifest missing, got:\n%s", out.String())
	}
	if !strings.Contains(errOut.String(), "manifest.json") {
		t.Errorf("expected manifest error on stderr, got:\n%s", errOut.String())
	}
}

func TestBundleFailsOnSymlinkedSpecFile(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{"manifest.json": validManifest})
	target := filepath.Join(t.TempDir(), "outside.json")
	if err := os.WriteFile(target, []byte(`{"evil":true}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(dir, "evil.spec.json")); err != nil {
		t.Skipf("symlinks unsupported: %v", err)
	}
	var out, errOut bytes.Buffer
	if code := runBundle(dir, "", &out, &errOut); code != exitCannotRun {
		t.Fatalf("want exit %d for symlinked spec, got %d", exitCannotRun, code)
	}
	if out.Len() != 0 {
		t.Errorf("expected no partial bundle on read failure, got:\n%s", out.String())
	}
}

func keysOf(m map[string]json.RawMessage) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	return ks
}
