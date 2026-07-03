package cmd

import (
	"reflect"
	"testing"
)

func TestComputeRequiredMissing(t *testing.T) {
	specs := []map[string]any{
		{"id": "a", "_file": "x.spec.json"},
	}
	// required=[a,b]; bundle has a, missing b.
	rep := computeRequired([]byte(`{"version":"1.0","required":["a","b"]}`), specs)
	if !reflect.DeepEqual(rep.Missing, []string{"b"}) {
		t.Errorf("Missing = %+v, want [b]", rep.Missing)
	}
}

func TestComputeRequiredNoneWhenEmpty(t *testing.T) {
	specs := []map[string]any{{"id": "a"}}
	rep := computeRequired([]byte(`{"version":"1.0","required":[]}`), specs)
	if len(rep.Missing) != 0 {
		t.Errorf("Missing = %+v, want empty", rep.Missing)
	}
}

func TestComputeRequiredDefaultDocIsEmpty(t *testing.T) {
	// The store default (absent file) has an empty required list -> no violation.
	rep := computeRequired([]byte(`{"version":"1.0","required":[]}`), nil)
	if len(rep.Missing) != 0 {
		t.Errorf("Missing = %+v, want empty for default doc", rep.Missing)
	}
}
