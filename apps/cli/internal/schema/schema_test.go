package schema

import "testing"

const validSpec = `{
  "id": "login-btn",
  "title": "Login",
  "description": "submits the form",
  "fingerprint": {
    "cssSelector": "button",
    "xpath": "/button",
    "domPath": ["button"],
    "tagName": "button",
    "attributes": {},
    "positionHint": { "index": 0, "siblingCount": 1 }
  }
}`

const validManifest = `{"version":"1.0","project":"Test","domains":["localhost:3000"],"specFiles":[]}`

func TestValidatorAcceptsValid(t *testing.T) {
	v, err := NewValidator()
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}
	if errs := v.ValidateSpec([]byte(validSpec)); errs != nil {
		t.Errorf("valid spec rejected: %v", errs)
	}
	if errs := v.ValidateManifest([]byte(validManifest)); errs != nil {
		t.Errorf("valid manifest rejected: %v", errs)
	}
}

func TestValidatorRejectsMissingFingerprint(t *testing.T) {
	v, _ := NewValidator()
	errs := v.ValidateSpec([]byte(`{"id":"x","title":"X","description":"d"}`))
	if errs == nil {
		t.Fatal("expected validation errors for missing fingerprint")
	}
}

func TestValidatorRejectsBadDateTimeFormat(t *testing.T) {
	v, _ := NewValidator()
	// meta.createdAt is format:date-time; an obvious non-date must be rejected,
	// matching ajv+ajv-formats on the TS side.
	bad := `{
      "id":"x","title":"X","description":"d",
      "fingerprint":{"cssSelector":"b","xpath":"/b","domPath":["b"],"tagName":"b","attributes":{},"positionHint":{"index":0,"siblingCount":1}},
      "meta":{"createdBy":"k","createdAt":"not-a-date","updatedAt":"2026-06-25T08:00:00Z","source":"manual"}
    }`
	if errs := v.ValidateSpec([]byte(bad)); errs == nil {
		t.Error("expected date-time format assertion to reject 'not-a-date'")
	}
}
