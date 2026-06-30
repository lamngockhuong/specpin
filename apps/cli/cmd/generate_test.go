package cmd

import (
	"bytes"
	"strings"
	"testing"
)

// generate is a stub that points users at the bundled skill rather than running
// an LLM. Assert it stays a no-op pointer so the message cannot silently revert
// to the old "deferred to v1.1" wording or grow real generation behavior.
func TestGeneratePointsAtSkill(t *testing.T) {
	var out bytes.Buffer
	generateCmd.SetOut(&out)
	generateCmd.SetArgs(nil)

	if err := generateCmd.RunE(generateCmd, nil); err != nil {
		t.Fatalf("generate returned error: %v", err)
	}

	got := out.String()
	for _, want := range []string{"skill", "specpin validate", "unpkg.com/@specpin/cli"} {
		if !strings.Contains(got, want) {
			t.Errorf("generate output missing %q\ngot:\n%s", want, got)
		}
	}
}
