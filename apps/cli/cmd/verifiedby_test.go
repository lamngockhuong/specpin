package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// specFileWithVerifiedBy renders a schema-valid login.spec.json whose single spec
// carries the given verifiedBy paths.
func specFileWithVerifiedBy(t *testing.T, paths ...string) string {
	t.Helper()
	vb, err := json.Marshal(paths)
	if err != nil {
		t.Fatal(err)
	}
	return `{
  "$schema": "https://specpin.ohnice.app/schema/v1.json",
  "group": "Login",
  "specs": [
    {
      "id": "login-btn",
      "title": { "en": "Log in" },
      "description": { "en": "submits the form" },
      "verifiedBy": ` + string(vb) + `,
      "fingerprint": {
        "cssSelector": "button",
        "xpath": "/button",
        "domPath": ["button"],
        "tagName": "button",
        "attributes": {},
        "positionHint": { "index": 0, "siblingCount": 1 }
      }
    }
  ]
}`
}

// writeRepoFile writes a file under repoRoot (creating parent dirs), for the
// sibling test files that verifiedBy points at.
func writeRepoFile(t *testing.T, repoRoot, rel, body string) {
	t.Helper()
	full := filepath.Join(repoRoot, rel)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestVerifiedByExistingFilePasses(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": specFileWithVerifiedBy(t, "tests/login.spec.ts"),
	})
	repoRoot := filepath.Dir(dir)
	writeRepoFile(t, repoRoot, "tests/login.spec.ts", "// test")

	var out, errOut bytes.Buffer
	if code := runValidate(dir, "", false, &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d\n%s", exitValid, code, out.String())
	}
}

func TestVerifiedByMissingFileFails(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": specFileWithVerifiedBy(t, "tests/missing.spec.ts"),
	})
	var out, errOut bytes.Buffer
	if code := runValidate(dir, "", false, &out, &errOut); code != exitInvalid {
		t.Fatalf("want exit %d, got %d\n%s", exitInvalid, code, out.String())
	}
	s := out.String()
	if !strings.Contains(s, "login-btn") || !strings.Contains(s, "tests/missing.spec.ts") {
		t.Errorf("expected the failure to name the spec id + path, got:\n%s", s)
	}
}

func TestVerifiedByRejectsAbsoluteAndEscapePaths(t *testing.T) {
	for _, p := range []string{"/etc/passwd", "../../etc/passwd"} {
		dir := writeSpecsDir(t, map[string]string{
			"manifest.json":   validManifest,
			"login.spec.json": specFileWithVerifiedBy(t, p),
		})
		var out, errOut bytes.Buffer
		if code := runValidate(dir, "", false, &out, &errOut); code != exitInvalid {
			t.Fatalf("path %q should be rejected; want exit %d, got %d\n%s", p, exitInvalid, code, out.String())
		}
		if !strings.Contains(out.String(), "rejected") {
			t.Errorf("path %q: expected a 'rejected' message, got:\n%s", p, out.String())
		}
	}
}

func TestVerifiedByRejectsSymlinkEscape(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": specFileWithVerifiedBy(t, "tests/link.ts"),
	})
	repoRoot := filepath.Dir(dir)
	// A real file OUTSIDE the repo, and an in-repo symlink pointing at it.
	outside := filepath.Join(t.TempDir(), "outside.ts")
	if err := os.WriteFile(outside, []byte("// outside"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(repoRoot, "tests"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(repoRoot, "tests", "link.ts")); err != nil {
		t.Skipf("symlinks unsupported: %v", err)
	}
	var out, errOut bytes.Buffer
	if code := runValidate(dir, "", false, &out, &errOut); code != exitInvalid {
		t.Fatalf("symlink escape should fail; want exit %d, got %d\n%s", exitInvalid, code, out.String())
	}
	if !strings.Contains(out.String(), "symlink") {
		t.Errorf("expected a symlink-escape message, got:\n%s", out.String())
	}
}

func TestVerifiedBySymlinkedRepoRootResolves(t *testing.T) {
	// A repo checked out under a symlinked path (macOS /var, symlinked workspace):
	// an in-repo test file must still validate, not be misread as a symlink escape.
	realRoot := t.TempDir()
	dir := filepath.Join(realRoot, ".specs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), []byte(validManifest), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "login.spec.json"), []byte(specFileWithVerifiedBy(t, "tests/login.spec.ts")), 0o644); err != nil {
		t.Fatal(err)
	}
	writeRepoFile(t, realRoot, "tests/login.spec.ts", "// test")

	linkRoot := filepath.Join(t.TempDir(), "link-root")
	if err := os.Symlink(realRoot, linkRoot); err != nil {
		t.Skipf("symlinks unsupported: %v", err)
	}
	var out, errOut bytes.Buffer
	if code := runValidate(filepath.Join(linkRoot, ".specs"), linkRoot, false, &out, &errOut); code != exitValid {
		t.Fatalf("symlinked repo root should resolve in-repo paths; want exit %d, got %d\n%s", exitValid, code, out.String())
	}
}

func TestVerifiedByCustomDirWithRepoRoot(t *testing.T) {
	// A --dir NOT named .specs; the parent-of-dir default would be wrong, so an
	// explicit --repo-root anchors the check.
	repoRoot := t.TempDir()
	dir := filepath.Join(repoRoot, "config", "specs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), []byte(validManifest), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "login.spec.json"), []byte(specFileWithVerifiedBy(t, "tests/login.spec.ts")), 0o644); err != nil {
		t.Fatal(err)
	}
	writeRepoFile(t, repoRoot, "tests/login.spec.ts", "// test")

	var out, errOut bytes.Buffer
	if code := runValidate(dir, repoRoot, false, &out, &errOut); code != exitValid {
		t.Fatalf("custom dir with --repo-root should pass; want exit %d, got %d\n%s", exitValid, code, out.String())
	}
}

func TestVerifiedByAbsentIsUnchanged(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": validSpecFile, // no verifiedBy
	})
	var out, errOut bytes.Buffer
	if code := runValidate(dir, "", false, &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d\n%s", exitValid, code, out.String())
	}
	if strings.Contains(out.String(), "verifiedBy") {
		t.Errorf("no verifiedBy present, expected no verifiedBy output, got:\n%s", out.String())
	}
}

func TestVerifiedBySkippedWhenRepoRootUnreadable(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": specFileWithVerifiedBy(t, "tests/missing.spec.ts"),
	})
	// A repo root that does not exist: the check is skipped (not a false exit 2 or
	// exit 1 for the missing file), with a note.
	missingRoot := filepath.Join(t.TempDir(), "no-such-root")
	var out, errOut bytes.Buffer
	if code := runValidate(dir, missingRoot, false, &out, &errOut); code != exitValid {
		t.Fatalf("unreadable repo root should skip, not fail; want exit %d, got %d\n%s", exitValid, code, out.String())
	}
	if !strings.Contains(out.String(), "note:") || !strings.Contains(out.String(), "skipping") {
		t.Errorf("expected a skip note, got:\n%s", out.String())
	}
}
