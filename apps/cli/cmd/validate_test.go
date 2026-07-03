package cmd

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const validManifest = `{
  "$schema": "https://specpin.ohnice.app/schema/v1.json",
  "version": "1.0",
  "project": "Test",
  "domains": ["localhost:3000"],
  "specFiles": ["login.spec.json"],
  "settings": { "defaultLocale": "en", "matchConfidenceThreshold": 0.6, "defaultDisplayMode": "tooltip" }
}`

const validSpecFile = `{
  "$schema": "https://specpin.ohnice.app/schema/v1.json",
  "group": "Login",
  "specs": [
    {
      "id": "login-btn",
      "title": { "en": "Log in" },
      "description": { "en": "submits the form" },
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

func writeSpecsDir(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := filepath.Join(t.TempDir(), ".specs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestValidatePassesOnValidSpecs(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": validSpecFile,
	})
	var out, errOut bytes.Buffer
	if code := runValidate(dir, "", false, &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d\nstdout:\n%s\nstderr:\n%s", exitValid, code, out.String(), errOut.String())
	}
	if !strings.Contains(out.String(), "OK manifest.json") {
		t.Errorf("expected manifest OK line, got:\n%s", out.String())
	}
}

func TestValidateFailsOnSchemaViolation(t *testing.T) {
	// A spec missing the required "title" violates the schema.
	bad := strings.Replace(validSpecFile, `"title": { "en": "Log in" },`, "", 1)
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": bad,
	})
	var out, errOut bytes.Buffer
	if code := runValidate(dir, "", false, &out, &errOut); code != exitInvalid {
		t.Fatalf("want exit %d, got %d\nstdout:\n%s", exitInvalid, code, out.String())
	}
	if !strings.Contains(out.String(), "FAIL login.spec.json") {
		t.Errorf("expected FAIL line, got:\n%s", out.String())
	}
}

func TestValidateCannotRunWhenManifestMissing(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".specs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	var out, errOut bytes.Buffer
	if code := runValidate(dir, "", false, &out, &errOut); code != exitCannotRun {
		t.Fatalf("want exit %d, got %d", exitCannotRun, code)
	}
}

func TestValidateWarnsOnDriftButPasses(t *testing.T) {
	// manifest lists login.spec.json; an extra orphan.spec.json is on disk and a
	// listed file may be missing - drift warns but does not fail by default.
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":    validManifest,
		"login.spec.json":  validSpecFile,
		"orphan.spec.json": validSpecFile,
	})
	var out, errOut bytes.Buffer
	if code := runValidate(dir, "", false, &out, &errOut); code != exitValid {
		t.Fatalf("drift should warn-only; want exit %d, got %d\n%s", exitValid, code, out.String())
	}
	if !strings.Contains(out.String(), "warning:") || !strings.Contains(out.String(), "orphan.spec.json") {
		t.Errorf("expected drift warning for orphan.spec.json, got:\n%s", out.String())
	}
}

func TestValidateRejectsSymlinkedSpecFile(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{"manifest.json": validManifest})
	target := filepath.Join(t.TempDir(), "outside.json")
	if err := os.WriteFile(target, []byte(`{"evil":true}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(dir, "evil.spec.json")); err != nil {
		t.Skipf("symlinks unsupported: %v", err)
	}
	var out, errOut bytes.Buffer
	if code := runValidate(dir, "", false, &out, &errOut); code != exitInvalid {
		t.Fatalf("want exit %d for symlinked spec, got %d\n%s", exitInvalid, code, out.String())
	}
	if !strings.Contains(out.String(), "FAIL evil.spec.json") || !strings.Contains(out.String(), "symlink") {
		t.Errorf("expected symlink rejection, got:\n%s", out.String())
	}
}

func TestValidateStrictManifestFailsOnDrift(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":    validManifest,
		"login.spec.json":  validSpecFile,
		"orphan.spec.json": validSpecFile,
	})
	var out, errOut bytes.Buffer
	if code := runValidate(dir, "", true, &out, &errOut); code != exitInvalid {
		t.Fatalf("strict drift should fail; want exit %d, got %d\n%s", exitInvalid, code, out.String())
	}
}
