package schema

import (
	"os"
	"path/filepath"
	"testing"
)

// Cross-validator (Go side): the same shared corpora the ajv validator runs in
// packages/spec-schema/scripts/validate-fixtures.ts. Valid fixtures must pass,
// invalid ones must fail. CI runs both; disagreement fails the build.
func TestSharedFixtureCorpus(t *testing.T) {
	v, err := NewValidator()
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}
	runFixtureCorpus(t, "specs", v.ValidateSpec)
}

// TestSharedViewsCorpus mirrors the ajv views loop so the TS and Go validators
// agree on the views.json (ViewsConfig) schema too.
func TestSharedViewsCorpus(t *testing.T) {
	v, err := NewValidator()
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}
	runFixtureCorpus(t, "views", v.ValidateViews)
}

// TestSharedGuidesCorpus mirrors the ajv guides loop so the TS and Go validators
// agree on the guides.json (GuidesConfig) schema too.
func TestSharedGuidesCorpus(t *testing.T) {
	v, err := NewValidator()
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}
	runFixtureCorpus(t, "guides", v.ValidateGuides)
}

// TestSharedManifestCorpus mirrors the ajv manifest loop so the TS and Go
// validators agree on the manifest.json (Manifest) schema too — notably the
// ManifestSettings.stalenessThresholdDays bounds, which are otherwise absent
// from the shared corpus.
func TestSharedManifestCorpus(t *testing.T) {
	v, err := NewValidator()
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}
	runFixtureCorpus(t, "manifest", v.ValidateManifest)
}

// TestSharedRequiredCorpus mirrors the ajv required loop so the TS and Go
// validators agree on the required.json (RequiredConfig) schema too.
func TestSharedRequiredCorpus(t *testing.T) {
	v, err := NewValidator()
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}
	runFixtureCorpus(t, "required", v.ValidateRequired)
}

// runFixtureCorpus runs every fixture under tests/fixtures/<name>/{valid,invalid}
// through validate, asserting valid ones pass and invalid ones fail.
func runFixtureCorpus(t *testing.T, name string, validate func([]byte) []string) {
	t.Helper()
	base := filepath.Join("..", "..", "..", "..", "tests", "fixtures", name)

	t.Run("valid", func(t *testing.T) {
		for _, raw := range readFixtures(t, filepath.Join(base, "valid")) {
			if errs := validate(raw.data); errs != nil {
				t.Errorf("valid/%s should pass but failed: %v", raw.name, errs)
			}
		}
	})

	t.Run("invalid", func(t *testing.T) {
		for _, raw := range readFixtures(t, filepath.Join(base, "invalid")) {
			if errs := validate(raw.data); errs == nil {
				t.Errorf("invalid/%s should fail but passed", raw.name)
			}
		}
	})
}

type fixture struct {
	name string
	data []byte
}

func readFixtures(t *testing.T, dir string) []fixture {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read fixtures %s: %v", dir, err)
	}
	var out []fixture
	for _, e := range entries {
		if filepath.Ext(e.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", e.Name(), err)
		}
		out = append(out, fixture{name: e.Name(), data: data})
	}
	if len(out) == 0 {
		t.Fatalf("no fixtures found in %s", dir)
	}
	return out
}
