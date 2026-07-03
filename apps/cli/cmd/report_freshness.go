package cmd

import (
	"encoding/json"
	"time"
)

// Staleness threshold bounds mirror the schema (ManifestSettings). The default
// applies when settings omit stalenessThresholdDays; the clamp guards a manifest
// that was written outside the validator.
const (
	defaultStalenessDays = 90
	minStalenessDays     = 1
	maxStalenessDays     = 3650
)

// SpecRef identifies a spec in a freshness or violation listing.
type SpecRef struct {
	ID         string `json:"id"`
	File       string `json:"file"`
	ReviewedAt string `json:"reviewedAt,omitempty"`
}

// FreshnessReport buckets specs by review recency. A spec is stale only when it
// HAS a meta.reviewedAt older than the threshold. A spec with no reviewedAt is
// never-reviewed, not stale: freshness measures review recency, not edit
// recency, so there is deliberately no updatedAt fallback. Only the problem
// buckets (stale, never-reviewed) are listed; the healthy set needs only a count.
type FreshnessReport struct {
	ThresholdDays int       `json:"thresholdDays"`
	Fresh         int       `json:"fresh"`
	Stale         []SpecRef `json:"stale"`
	NeverReviewed []SpecRef `json:"neverReviewed"`
}

// computeFreshness buckets each spec relative to now and the threshold. now is
// injected (never time.Now() here) so the core stays deterministic under test.
func computeFreshness(specs []map[string]any, thresholdDays int, now time.Time) FreshnessReport {
	rep := FreshnessReport{
		ThresholdDays: thresholdDays,
		Stale:         []SpecRef{},
		NeverReviewed: []SpecRef{},
	}
	cutoff := now.AddDate(0, 0, -thresholdDays)
	for _, spec := range specs {
		ref := SpecRef{ID: specStr(spec, "id"), File: specStr(spec, "_file")}
		reviewedAt := metaStr(spec, "reviewedAt")
		if reviewedAt == "" {
			rep.NeverReviewed = append(rep.NeverReviewed, ref)
			continue
		}
		t, err := time.Parse(time.RFC3339, reviewedAt)
		if err != nil {
			// Unparseable reviewedAt: treat as never-reviewed rather than crash.
			// Schema validation (separate) is what rejects malformed timestamps.
			rep.NeverReviewed = append(rep.NeverReviewed, ref)
			continue
		}
		if t.Before(cutoff) {
			ref.ReviewedAt = reviewedAt
			rep.Stale = append(rep.Stale, ref)
		} else {
			rep.Fresh++
		}
	}
	return rep
}

// stalenessThreshold reads settings.stalenessThresholdDays, applying the default
// when absent and clamping into [min, max] so a bad manifest cannot silently
// disable the freshness signal.
func stalenessThreshold(settings json.RawMessage) int {
	days := defaultStalenessDays
	if len(settings) > 0 {
		var s struct {
			StalenessThresholdDays *float64 `json:"stalenessThresholdDays"`
		}
		if err := json.Unmarshal(settings, &s); err == nil && s.StalenessThresholdDays != nil {
			days = int(*s.StalenessThresholdDays)
		}
	}
	if days < minStalenessDays {
		return minStalenessDays
	}
	if days > maxStalenessDays {
		return maxStalenessDays
	}
	return days
}

// specStr reads a top-level string field from a loosely-typed spec map.
func specStr(spec map[string]any, key string) string {
	if v, ok := spec[key].(string); ok {
		return v
	}
	return ""
}

// metaStr reads a string field from the spec's meta object.
func metaStr(spec map[string]any, key string) string {
	meta, ok := spec["meta"].(map[string]any)
	if !ok {
		return ""
	}
	if v, ok := meta[key].(string); ok {
		return v
	}
	return ""
}
