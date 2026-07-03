package cmd

import "testing"

func TestComputeStats(t *testing.T) {
	specs := []map[string]any{
		{"id": "a", "_file": "login.spec.json", "status": "draft"},
		{"id": "b", "_file": "login.spec.json", "status": "approved"},
		{"id": "c", "_file": "dashboard-page.spec.json"}, // no status -> absent
	}
	domains := []string{"localhost:3000"}

	s := computeStats(specs, domains)

	if s.Total != 3 {
		t.Errorf("Total = %d, want 3", s.Total)
	}
	if s.ByStatus["draft"] != 1 || s.ByStatus["approved"] != 1 || s.ByStatus["absent"] != 1 {
		t.Errorf("ByStatus = %+v", s.ByStatus)
	}
	if s.ByFile["login.spec.json"] != 2 || s.ByFile["dashboard-page.spec.json"] != 1 {
		t.Errorf("ByFile = %+v", s.ByFile)
	}
	if len(s.Domains) != 1 || s.Domains[0] != "localhost:3000" {
		t.Errorf("Domains = %+v", s.Domains)
	}
}

func TestComputeStatsEmpty(t *testing.T) {
	s := computeStats(nil, nil)
	if s.Total != 0 {
		t.Errorf("Total = %d, want 0", s.Total)
	}
	// Maps and slices must be non-nil so --json emits {} / [] not null.
	if s.ByStatus == nil || s.ByFile == nil || s.Domains == nil {
		t.Errorf("empty stats must have non-nil containers: %+v", s)
	}
}
