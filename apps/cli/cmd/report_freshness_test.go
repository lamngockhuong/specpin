package cmd

import (
	"testing"
	"time"
)

func specWith(id, file, reviewedAt string) map[string]any {
	spec := map[string]any{"id": id, "_file": file}
	if reviewedAt != "" {
		spec["meta"] = map[string]any{"reviewedAt": reviewedAt}
	}
	return spec
}

func TestComputeFreshnessBuckets(t *testing.T) {
	now := time.Date(2026, 7, 3, 0, 0, 0, 0, time.UTC)
	specs := []map[string]any{
		// reviewed 200 days ago, threshold 90 -> stale
		specWith("old", "a.spec.json", "2025-12-15T00:00:00Z"),
		// reviewed 10 days ago -> fresh
		specWith("recent", "a.spec.json", "2026-06-23T00:00:00Z"),
		// no reviewedAt -> never-reviewed (NOT stale)
		specWith("untouched", "b.spec.json", ""),
	}

	rep := computeFreshness(specs, 90, now)

	if rep.ThresholdDays != 90 {
		t.Errorf("ThresholdDays = %d, want 90", rep.ThresholdDays)
	}
	if len(rep.Stale) != 1 || rep.Stale[0].ID != "old" {
		t.Errorf("Stale = %+v, want [old]", rep.Stale)
	}
	// Only the count is tracked for the healthy bucket; buckets are exclusive, so
	// with old=stale and untouched=never-reviewed the remaining "recent" is fresh.
	if rep.Fresh != 1 {
		t.Errorf("Fresh = %d, want 1", rep.Fresh)
	}
	if len(rep.NeverReviewed) != 1 || rep.NeverReviewed[0].ID != "untouched" {
		t.Errorf("NeverReviewed = %+v, want [untouched]", rep.NeverReviewed)
	}
}

// A spec with an OLD updatedAt but no reviewedAt must be never-reviewed, never
// stale: freshness measures review recency, not edit recency (no updatedAt
// fallback).
func TestComputeFreshnessNoUpdatedAtFallback(t *testing.T) {
	now := time.Date(2026, 7, 3, 0, 0, 0, 0, time.UTC)
	spec := map[string]any{
		"id":    "editedLongAgo",
		"_file": "a.spec.json",
		"meta":  map[string]any{"updatedAt": "2020-01-01T00:00:00Z"},
	}
	rep := computeFreshness([]map[string]any{spec}, 90, now)
	if len(rep.Stale) != 0 {
		t.Errorf("Stale = %+v, want empty (no updatedAt fallback)", rep.Stale)
	}
	if len(rep.NeverReviewed) != 1 {
		t.Errorf("NeverReviewed = %+v, want [editedLongAgo]", rep.NeverReviewed)
	}
}

func TestStalenessThresholdDefaultAndClamp(t *testing.T) {
	cases := []struct {
		name     string
		settings string
		want     int
	}{
		{"absent", "", defaultStalenessDays},
		{"empty object", "{}", defaultStalenessDays},
		{"explicit", `{"stalenessThresholdDays": 30}`, 30},
		{"below min clamps", `{"stalenessThresholdDays": 0}`, minStalenessDays},
		{"above max clamps", `{"stalenessThresholdDays": 9999}`, maxStalenessDays},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var raw []byte
			if c.settings != "" {
				raw = []byte(c.settings)
			}
			if got := stalenessThreshold(raw); got != c.want {
				t.Errorf("stalenessThreshold(%q) = %d, want %d", c.settings, got, c.want)
			}
		})
	}
}
