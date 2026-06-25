package schema

import (
	"os"
	"path/filepath"
	"testing"
)

// Cross-validator (Go side): the same shared corpus the ajv validator runs in
// packages/spec-schema/scripts/validate-fixtures.ts. Valid fixtures must pass,
// invalid ones must fail. CI runs both; disagreement fails the build.
func TestSharedFixtureCorpus(t *testing.T) {
	v, err := NewValidator()
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}
	base := filepath.Join("..", "..", "..", "..", "tests", "fixtures", "specs")

	t.Run("valid", func(t *testing.T) {
		for _, raw := range readFixtures(t, filepath.Join(base, "valid")) {
			if errs := v.ValidateSpec(raw.data); errs != nil {
				t.Errorf("valid/%s should pass but failed: %v", raw.name, errs)
			}
		}
	})

	t.Run("invalid", func(t *testing.T) {
		for _, raw := range readFixtures(t, filepath.Join(base, "invalid")) {
			if errs := v.ValidateSpec(raw.data); errs == nil {
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
