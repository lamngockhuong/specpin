package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"specpin/internal/schema"
	"specpin/internal/store"
)

var (
	reportDir    string
	reportAsJSON bool
	reportFailOn []string
)

// --fail-on conditions. Each maps to a violation bucket; listing one makes the
// command exit 1 when that bucket is non-empty. Absent from --fail-on, the
// signal is reported but never gates (warn-only default).
const (
	condStale             = "stale"
	condDraftCommitted    = "draft-committed"
	condMissingRequired   = "missing-required"
	condMissingVerifiedBy = "missing-verifiedby"
)

var allowedFailOn = map[string]bool{
	condStale:             true,
	condDraftCommitted:    true,
	condMissingRequired:   true,
	condMissingVerifiedBy: true,
}

var reportCmd = &cobra.Command{
	Use:   "report",
	Short: "Report spec freshness + stats for a .specs/ directory, offline",
	Long: "Report reads a .specs/ directory and prints freshness (which specs are\n" +
		"stale or never-reviewed), spec stats (counts by status, file, group), and a\n" +
		"required-spec check (ids in .specs/required.json that must exist). It counts\n" +
		"specs, not UI elements: CI cannot run the app, so it reports no coverage %.\n" +
		"No server, no token, no browser.\n\n" +
		"Warn-only by default (exit 0). --fail-on makes listed conditions exit 1:\n" +
		"  stale             a spec's reviewedAt is older than the staleness threshold\n" +
		"  draft-committed   a committed spec has status \"draft\"\n" +
		"  missing-required  a .specs/required.json id has no matching spec\n" +
		"  missing-verifiedby a spec declares no verifiedBy paths\n" +
		"never-reviewed specs (no reviewedAt) are reported but never gate.\n" +
		"Exit 0 = clean/warn-only, 1 = a --fail-on condition triggered, 2 = could not run.",
	RunE: func(cmd *cobra.Command, _ []string) error {
		// time.Now() is read only here at the cobra layer; the core takes now as
		// a parameter so freshness stays deterministic under test.
		code := runReport(reportDir, reportAsJSON, reportFailOn, time.Now(), cmd.OutOrStdout(), cmd.ErrOrStderr())
		if code != exitValid {
			os.Exit(code)
		}
		return nil
	},
}

func init() {
	reportCmd.Flags().StringVar(&reportDir, "dir", ".specs", "path to the .specs/ directory")
	reportCmd.Flags().BoolVar(&reportAsJSON, "json", false, "emit the report as JSON for CI parsing")
	reportCmd.Flags().StringSliceVar(&reportFailOn, "fail-on", nil,
		"comma-separated conditions that exit 1 when triggered: stale, draft-committed, missing-required, missing-verifiedby")
}

// reportData is the stable --json shape CI parses.
type reportData struct {
	Freshness  FreshnessReport     `json:"freshness"`
	Stats      StatsReport         `json:"stats"`
	Required   RequiredReport      `json:"required"`
	FailOn     []string            `json:"failOn"`
	Violations map[string][]string `json:"violations"`
}

// runReport builds the report and returns the process exit code. It is pure with
// respect to I/O streams (no os.Exit) so it is directly testable. Without
// --fail-on it exits 0 (or 2 when it cannot run); with --fail-on it exits 1 when
// a listed condition is triggered.
func runReport(dir string, asJSON bool, failOn []string, now time.Time, out, errOut io.Writer) int {
	// Validate --fail-on values before doing any work: an unknown condition is a
	// caller mistake, not a clean run, so it must not be silently ignored.
	failOn = normalizeFailOn(failOn)
	for _, cond := range failOn {
		if !allowedFailOn[cond] {
			fmt.Fprintf(errOut, "error: unknown --fail-on condition %q (allowed: %s)\n", cond, allowedConditions())
			return exitCannotRun
		}
	}

	st := store.New(dir)
	bundle, err := st.Load()
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Fprintf(errOut, "error: no manifest.json in %s\n", st.Dir())
		} else {
			fmt.Fprintf(errOut, "error: read .specs: %v\n", err)
		}
		return exitCannotRun
	}

	requiredRaw, err := st.LoadRequired()
	if err != nil {
		fmt.Fprintf(errOut, "error: read required.json: %v\n", err)
		return exitCannotRun
	}
	v, err := schema.NewValidator()
	if err != nil {
		fmt.Fprintf(errOut, "error: build validator: %v\n", err)
		return exitCannotRun
	}
	if errs := v.ValidateRequired(requiredRaw); errs != nil {
		fmt.Fprintf(errOut, "error: invalid required.json: %s\n", strings.Join(errs, "; "))
		return exitCannotRun
	}

	threshold := stalenessThreshold(bundle.Manifest.Settings)
	freshness := computeFreshness(bundle.Specs, threshold, now)
	stats := computeStats(bundle.Specs, bundle.Manifest.Domains)
	required := computeRequired(requiredRaw, bundle.Specs)
	violations := collectViolations(freshness, required, bundle.Specs)

	if asJSON {
		enc := json.NewEncoder(out)
		enc.SetIndent("", "  ")
		data := reportData{
			Freshness:  freshness,
			Stats:      stats,
			Required:   required,
			FailOn:     failOn,
			Violations: violations,
		}
		if err := enc.Encode(data); err != nil {
			fmt.Fprintf(errOut, "error: encode json: %v\n", err)
			return exitCannotRun
		}
	} else {
		printReport(out, freshness, stats, required, failOn, violations)
	}

	if gated := failingConditions(failOn, violations); len(gated) > 0 {
		fmt.Fprintf(errOut, "gate failed: %s\n", strings.Join(gated, ", "))
		return exitInvalid
	}
	return exitValid
}

// normalizeFailOn trims whitespace and drops empties from the flag values.
func normalizeFailOn(failOn []string) []string {
	out := make([]string, 0, len(failOn))
	for _, c := range failOn {
		if c = strings.TrimSpace(c); c != "" {
			out = append(out, c)
		}
	}
	return out
}

func allowedConditions() string {
	keys := make([]string, 0, len(allowedFailOn))
	for k := range allowedFailOn {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return strings.Join(keys, ", ")
}

// collectViolations tallies every gate-able signal (regardless of --fail-on) so
// the --json output surfaces all of them; --fail-on only decides the exit code.
func collectViolations(f FreshnessReport, req RequiredReport, specs []map[string]any) map[string][]string {
	v := map[string][]string{
		condStale:             refIDs(f.Stale),
		condMissingRequired:   append([]string{}, req.Missing...),
		condDraftCommitted:    {},
		condMissingVerifiedBy: {},
	}
	for _, spec := range specs {
		id := specStr(spec, "id")
		if specStr(spec, "status") == "draft" {
			v[condDraftCommitted] = append(v[condDraftCommitted], id)
		}
		if !hasVerifiedBy(spec) {
			v[condMissingVerifiedBy] = append(v[condMissingVerifiedBy], id)
		}
	}
	return v
}

// failingConditions returns the enforced conditions that actually have
// violations, in the order they appear in failOn.
func failingConditions(failOn []string, violations map[string][]string) []string {
	var gated []string
	for _, cond := range failOn {
		if len(violations[cond]) > 0 {
			gated = append(gated, cond)
		}
	}
	return gated
}

func refIDs(refs []SpecRef) []string {
	out := make([]string, 0, len(refs))
	for _, r := range refs {
		out = append(out, r.ID)
	}
	return out
}

// hasVerifiedBy reports whether a spec declares at least one verifiedBy path.
// This checks declaration presence only, unlike `specpin validate` which checks
// that each declared path exists on disk.
func hasVerifiedBy(spec map[string]any) bool {
	arr, ok := spec["verifiedBy"].([]any)
	return ok && len(arr) > 0
}

func printReport(out io.Writer, f FreshnessReport, s StatsReport, req RequiredReport, failOn []string, violations map[string][]string) {
	fmt.Fprintf(out, "Freshness (stale threshold: %d days)\n", f.ThresholdDays)
	fmt.Fprintf(out, "  fresh:          %d\n", f.Fresh)
	fmt.Fprintf(out, "  stale:          %d\n", len(f.Stale))
	for _, r := range f.Stale {
		fmt.Fprintf(out, "    - %s (%s) reviewed %s\n", r.ID, r.File, r.ReviewedAt)
	}
	fmt.Fprintf(out, "  never-reviewed: %d\n", len(f.NeverReviewed))
	for _, r := range f.NeverReviewed {
		fmt.Fprintf(out, "    - %s (%s)\n", r.ID, r.File)
	}

	fmt.Fprintf(out, "\nSpec stats (%d specs)\n", s.Total)
	fmt.Fprintf(out, "  %s\n", statsDisclaimer)
	printCounts(out, "by status", s.ByStatus)
	printCounts(out, "by file", s.ByFile)
	if len(s.Domains) > 0 {
		fmt.Fprintf(out, "  domains: %d\n", len(s.Domains))
	}

	fmt.Fprintf(out, "\nRequired specs\n")
	if len(req.Missing) == 0 {
		fmt.Fprintln(out, "  all required spec ids present")
	} else {
		fmt.Fprintf(out, "  missing: %d\n", len(req.Missing))
		for _, id := range req.Missing {
			fmt.Fprintf(out, "    - %s\n", id)
		}
	}

	if len(failOn) > 0 {
		fmt.Fprintf(out, "\nGate (--fail-on %s)\n", strings.Join(failOn, ","))
		for _, cond := range failOn {
			fmt.Fprintf(out, "  %s: %d\n", cond, len(violations[cond]))
		}
	}
}

// printCounts prints a label and its key->count map with keys sorted for stable,
// diffable output.
func printCounts(out io.Writer, label string, counts map[string]int) {
	fmt.Fprintf(out, "  %s:\n", label)
	keys := make([]string, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Fprintf(out, "    %s: %d\n", k, counts[k])
	}
}
