package cmd

// statsDisclaimer is printed with the stats section and asserted by tests so
// readers never mistake spec counts for element coverage.
const statsDisclaimer = "Counts specs, not UI elements — element coverage is measured only in the browser, not in CI."

// StatsReport counts specs across dimensions. It counts SPECS, not UI elements:
// CI cannot run the app, so there is no element denominator and therefore no
// coverage %. Element coverage is a runtime (in-browser) measure.
type StatsReport struct {
	Total    int            `json:"total"`
	ByStatus map[string]int `json:"byStatus"`
	ByFile   map[string]int `json:"byFile"`
	Domains  []string       `json:"domains"`
}

// computeStats tallies specs by status and file. status "absent" covers untagged
// specs. There is no per-group tally: store.Load discards the SpecFile.group
// label, so a group breakdown would only relabel the by-file counts.
func computeStats(specs []map[string]any, domains []string) StatsReport {
	rep := StatsReport{
		Total:    len(specs),
		ByStatus: map[string]int{},
		ByFile:   map[string]int{},
		Domains:  domains,
	}
	if rep.Domains == nil {
		rep.Domains = []string{}
	}
	for _, spec := range specs {
		status := specStr(spec, "status")
		if status == "" {
			status = "absent"
		}
		rep.ByStatus[status]++
		rep.ByFile[specStr(spec, "_file")]++
	}
	return rep
}
