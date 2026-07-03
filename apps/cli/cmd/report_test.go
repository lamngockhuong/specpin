package cmd

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

var reportNow = time.Date(2026, 7, 3, 0, 0, 0, 0, time.UTC)

// A spec reviewed long ago: stale under the default threshold, but report
// (without --fail-on) must still exit 0.
const staleSpecFile = `{
  "$schema": "https://specpin.ohnice.app/schema/v1.json",
  "group": "Login",
  "specs": [
    {
      "id": "login-btn",
      "title": { "en": "Log in" },
      "description": { "en": "submits the form" },
      "status": "approved",
      "fingerprint": {
        "cssSelector": "button",
        "xpath": "/button",
        "domPath": ["button"],
        "tagName": "button",
        "attributes": {},
        "positionHint": { "index": 0, "siblingCount": 1 }
      },
      "meta": {
        "createdBy": "t",
        "createdAt": "2020-01-01T00:00:00Z",
        "updatedAt": "2020-01-01T00:00:00Z",
        "source": "manual",
        "reviewedAt": "2020-01-01T00:00:00Z"
      }
    }
  ]
}`

func TestReportExitsZeroEvenWhenStale(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": staleSpecFile,
	})
	var out, errOut bytes.Buffer
	if code := runReport(dir, false, nil, reportNow, &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d\nstdout:\n%s\nstderr:\n%s", exitValid, code, out.String(), errOut.String())
	}
	if !strings.Contains(out.String(), "stale") {
		t.Errorf("expected freshness section mentioning stale, got:\n%s", out.String())
	}
	// The stats disclaimer must appear so counts are not read as coverage %.
	if !strings.Contains(out.String(), statsDisclaimer) {
		t.Errorf("expected stats disclaimer, got:\n%s", out.String())
	}
}

func TestReportJSONShape(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": staleSpecFile,
	})
	var out, errOut bytes.Buffer
	if code := runReport(dir, true, nil, reportNow, &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d\nstderr:\n%s", exitValid, code, errOut.String())
	}
	var parsed map[string]json.RawMessage
	if err := json.Unmarshal(out.Bytes(), &parsed); err != nil {
		t.Fatalf("output is not valid JSON: %v\n%s", err, out.String())
	}
	if _, ok := parsed["freshness"]; !ok {
		t.Errorf("json missing freshness key: %s", out.String())
	}
	if _, ok := parsed["stats"]; !ok {
		t.Errorf("json missing stats key: %s", out.String())
	}
}

func TestReportMissingManifestExitsTwo(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"login.spec.json": staleSpecFile,
	})
	var out, errOut bytes.Buffer
	if code := runReport(dir, false, nil, reportNow, &out, &errOut); code != exitCannotRun {
		t.Fatalf("want exit %d, got %d\nstdout:\n%s", exitCannotRun, code, out.String())
	}
}

// A committed draft spec with no verifiedBy, plus a required.json that lists a
// present id and a missing one. Used to drive the gate cases.
const draftSpecFile = `{
  "$schema": "https://specpin.ohnice.app/schema/v1.json",
  "group": "Login",
  "specs": [
    {
      "id": "login-btn",
      "title": { "en": "Log in" },
      "description": { "en": "submits the form" },
      "status": "draft",
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

func gateDir(t *testing.T, required string) string {
	t.Helper()
	files := map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": staleSpecFile,
	}
	if required != "" {
		files["required.json"] = required
	}
	return writeSpecsDir(t, files)
}

func TestReportGateMissingRequiredFails(t *testing.T) {
	// required lists an id that does not exist -> missing-required, gated -> exit 1.
	dir := gateDir(t, `{"version":"1.0","required":["nope"]}`)
	var out, errOut bytes.Buffer
	if code := runReport(dir, false, []string{"missing-required"}, reportNow, &out, &errOut); code != exitInvalid {
		t.Fatalf("want exit %d, got %d\nstdout:\n%s", exitInvalid, code, out.String())
	}
}

func TestReportGateSameDataNoFlagPasses(t *testing.T) {
	// Same missing-required data, but no --fail-on -> warn-only -> exit 0.
	dir := gateDir(t, `{"version":"1.0","required":["nope"]}`)
	var out, errOut bytes.Buffer
	if code := runReport(dir, false, nil, reportNow, &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d\nstdout:\n%s", exitValid, code, out.String())
	}
}

func TestReportGateMissingRequiredSatisfiedPasses(t *testing.T) {
	// required lists the id that IS present -> no violation -> exit 0.
	dir := gateDir(t, `{"version":"1.0","required":["login-btn"]}`)
	var out, errOut bytes.Buffer
	if code := runReport(dir, false, []string{"missing-required"}, reportNow, &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d\nstdout:\n%s\nstderr:\n%s", exitValid, code, out.String(), errOut.String())
	}
}

func TestReportGateStaleFails(t *testing.T) {
	dir := gateDir(t, "")
	var out, errOut bytes.Buffer
	if code := runReport(dir, false, []string{"stale"}, reportNow, &out, &errOut); code != exitInvalid {
		t.Fatalf("want exit %d, got %d\nstdout:\n%s", exitInvalid, code, out.String())
	}
}

func TestReportGateDraftCommittedFails(t *testing.T) {
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": draftSpecFile,
	})
	var out, errOut bytes.Buffer
	if code := runReport(dir, false, []string{"draft-committed"}, reportNow, &out, &errOut); code != exitInvalid {
		t.Fatalf("want exit %d, got %d\nstdout:\n%s", exitInvalid, code, out.String())
	}
}

func TestReportGateMissingVerifiedByFails(t *testing.T) {
	// draftSpecFile declares no verifiedBy -> missing-verifiedby.
	dir := writeSpecsDir(t, map[string]string{
		"manifest.json":   validManifest,
		"login.spec.json": draftSpecFile,
	})
	var out, errOut bytes.Buffer
	if code := runReport(dir, false, []string{"missing-verifiedby"}, reportNow, &out, &errOut); code != exitInvalid {
		t.Fatalf("want exit %d, got %d\nstdout:\n%s", exitInvalid, code, out.String())
	}
}

func TestReportGateUnknownConditionExitsTwo(t *testing.T) {
	dir := gateDir(t, "")
	var out, errOut bytes.Buffer
	if code := runReport(dir, false, []string{"bogus"}, reportNow, &out, &errOut); code != exitCannotRun {
		t.Fatalf("want exit %d, got %d\nstderr:\n%s", exitCannotRun, code, errOut.String())
	}
}

func TestReportMissingRequiredFileIgnored(t *testing.T) {
	// No required.json at all -> required-check has nothing to enforce -> exit 0
	// even under --fail-on missing-required.
	dir := gateDir(t, "")
	var out, errOut bytes.Buffer
	if code := runReport(dir, false, []string{"missing-required"}, reportNow, &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d\nstderr:\n%s", exitValid, code, errOut.String())
	}
}

func TestReportJSONHasGateKeys(t *testing.T) {
	dir := gateDir(t, `{"version":"1.0","required":["login-btn"]}`)
	var out, errOut bytes.Buffer
	if code := runReport(dir, true, []string{"missing-required"}, reportNow, &out, &errOut); code != exitValid {
		t.Fatalf("want exit %d, got %d\nstderr:\n%s", exitValid, code, errOut.String())
	}
	var parsed map[string]json.RawMessage
	if err := json.Unmarshal(out.Bytes(), &parsed); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}
	for _, key := range []string{"required", "failOn", "violations"} {
		if _, ok := parsed[key]; !ok {
			t.Errorf("json missing %q key: %s", key, out.String())
		}
	}
}
