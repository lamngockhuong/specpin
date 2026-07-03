package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"specpin/internal/store"
)

// canonical returns the on-disk canonical form of a JSON string, matching what
// the sidecar and `specpin format` write.
func canonical(t *testing.T, raw string) string {
	t.Helper()
	out, err := store.Canonicalize([]byte(raw))
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	return string(out)
}

func TestFormatNoopOnCanonicalFiles(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   canonical(t, validManifest),
		"login.spec.json": canonical(t, validSpecFile),
	})
	var out, errOut bytes.Buffer
	if code := runFormat(dir, false, &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d\n%s", exitValid, code, out.String())
	}
	if !strings.Contains(out.String(), "0 formatted") {
		t.Errorf("expected nothing to format, got:\n%s", out.String())
	}
	// --check on already-canonical files also passes.
	out.Reset()
	if code := runFormat(dir, true, &out, &errOut); code != exitValid {
		t.Fatalf("--check on canonical files: want exit %d, got %d\n%s", exitValid, code, out.String())
	}
}

func TestFormatCheckDetectsDriftWithoutWriting(t *testing.T) {
	// validSpecFile is compact (inline objects) -> not canonical.
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   canonical(t, validManifest),
		"login.spec.json": validSpecFile,
	})
	specPath := filepath.Join(dir, "login.spec.json")
	before, _ := os.ReadFile(specPath)

	var out, errOut bytes.Buffer
	if code := runFormat(dir, true, &out, &errOut); code != exitInvalid {
		t.Fatalf("--check with drift: want exit %d, got %d\n%s", exitInvalid, code, out.String())
	}
	if !strings.Contains(out.String(), "drift: login.spec.json") {
		t.Errorf("expected drift line, got:\n%s", out.String())
	}
	after, _ := os.ReadFile(specPath)
	if !bytes.Equal(before, after) {
		t.Errorf("--check must not modify files on disk")
	}
}

func TestFormatRewritesDriftAndIsIdempotent(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   canonical(t, validManifest),
		"login.spec.json": validSpecFile,
	})
	specPath := filepath.Join(dir, "login.spec.json")

	var out, errOut bytes.Buffer
	if code := runFormat(dir, false, &out, &errOut); code != exitValid {
		t.Fatalf("format run: want exit %d, got %d\n%s", exitValid, code, out.String())
	}
	if !strings.Contains(out.String(), "formatted login.spec.json") {
		t.Errorf("expected formatted line, got:\n%s", out.String())
	}
	got, _ := os.ReadFile(specPath)
	if want := canonical(t, validSpecFile); string(got) != want {
		t.Errorf("file not canonical after format.\nwant:\n%s\ngot:\n%s", want, got)
	}

	// Second run is a no-op.
	out.Reset()
	if code := runFormat(dir, false, &out, &errOut); code != exitValid {
		t.Fatalf("second run: want exit %d, got %d", exitValid, code)
	}
	if !strings.Contains(out.String(), "1 formatted, 0 unchanged") &&
		!strings.Contains(out.String(), "0 formatted, 1 unchanged") {
		// login.spec.json now canonical -> unchanged; manifest already canonical.
		if !strings.Contains(out.String(), "0 formatted") {
			t.Errorf("second run should be a no-op, got:\n%s", out.String())
		}
	}
}

func TestFormatPreservesContent(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   canonical(t, validManifest),
		"login.spec.json": validSpecFile,
	})
	specPath := filepath.Join(dir, "login.spec.json")

	var before any
	raw, _ := os.ReadFile(specPath)
	if err := json.Unmarshal(raw, &before); err != nil {
		t.Fatal(err)
	}

	var out, errOut bytes.Buffer
	runFormat(dir, false, &out, &errOut)

	var after any
	raw, _ = os.ReadFile(specPath)
	if err := json.Unmarshal(raw, &after); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Errorf("format changed parsed content; must be whitespace-only")
	}
}

func TestFormatAlsoNormalizesViewsAndGuides(t *testing.T) {
	compactViews := `{ "version": "1.0", "hidden": ["a", "b"] }`
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json": canonical(t, validManifest),
		"views.json":    compactViews,
	})
	var out, errOut bytes.Buffer
	if code := runFormat(dir, true, &out, &errOut); code != exitInvalid {
		t.Fatalf("views drift should be flagged; got exit %d\n%s", code, out.String())
	}
	if !strings.Contains(out.String(), "drift: views.json") {
		t.Errorf("expected views.json in drift output, got:\n%s", out.String())
	}
}

func TestFormatCannotRunWhenDirMissing(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "does-not-exist")
	var out, errOut bytes.Buffer
	if code := runFormat(dir, false, &out, &errOut); code != exitCannotRun {
		t.Fatalf("missing dir: want exit %d, got %d", exitCannotRun, code)
	}
}

func TestFormatFailsOnInvalidJSON(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json": canonical(t, validManifest),
		"bad.spec.json": `{ "id": "x", `, // truncated / invalid JSON
	})
	var out, errOut bytes.Buffer
	if code := runFormat(dir, false, &out, &errOut); code != exitInvalid {
		t.Fatalf("invalid JSON (format): want exit %d, got %d\n%s", exitInvalid, code, out.String())
	}
	out.Reset()
	if code := runFormat(dir, true, &out, &errOut); code != exitInvalid {
		t.Fatalf("invalid JSON (--check): want exit %d, got %d", exitInvalid, code)
	}
	if !strings.Contains(out.String(), "FAIL bad.spec.json") {
		t.Errorf("expected FAIL for bad.spec.json, got:\n%s", out.String())
	}
}
