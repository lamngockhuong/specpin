package cmd

import "encoding/json"

// RequiredReport lists required spec ids that are absent from the project.
type RequiredReport struct {
	Missing []string `json:"missing"`
}

// computeRequired parses a validated RequiredConfig document and returns the
// required ids not matching any spec id in the bundle. Existence only — it never
// checks element matching, which is a runtime (in-browser) concern. Callers
// validate requiredRaw against the schema first (Go ValidateRequired); here a
// parse miss simply yields no requirements.
func computeRequired(requiredRaw []byte, specs []map[string]any) RequiredReport {
	rep := RequiredReport{Missing: []string{}}
	var cfg struct {
		Required []string `json:"required"`
	}
	_ = json.Unmarshal(requiredRaw, &cfg)

	present := map[string]bool{}
	for _, spec := range specs {
		if id := specStr(spec, "id"); id != "" {
			present[id] = true
		}
	}
	for _, id := range cfg.Required {
		if !present[id] {
			rep.Missing = append(rep.Missing, id)
		}
	}
	return rep
}
