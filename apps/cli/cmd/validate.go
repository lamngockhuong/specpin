package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"

	"github.com/spf13/cobra"

	"specpin/internal/schema"
	"specpin/internal/store"
)

var (
	validateDir      string
	validateStrict   bool
	validateRepoRoot string
)

// Exit codes are differentiated so CI can tell a spec problem (author must fix)
// from an environment problem (infra must fix):
//
//	0 - everything valid
//	1 - schema violations or unreadable/symlinked spec files were found
//	2 - could not run the check (dir missing, manifest absent, internal error)
const (
	exitValid     = 0
	exitInvalid   = 1
	exitCannotRun = 2
)

var validateCmd = &cobra.Command{
	Use:   "validate",
	Short: "Validate .specs/ (manifest + *.spec.json) against the schema, offline",
	Long: "Validate walks a .specs/ directory and checks manifest.json plus every\n" +
		"*.spec.json against the embedded schema. No server, no token, no browser.\n" +
		"Exit 0 = all valid, 1 = invalid specs found, 2 = could not run.",
	RunE: func(cmd *cobra.Command, _ []string) error {
		code := runValidate(validateDir, validateRepoRoot, validateStrict, cmd.OutOrStdout(), cmd.ErrOrStderr())
		if code != exitValid {
			os.Exit(code)
		}
		return nil
	},
}

func init() {
	validateCmd.Flags().StringVar(&validateDir, "dir", ".specs", "path to the .specs/ directory")
	validateCmd.Flags().BoolVar(&validateStrict, "strict-manifest", false,
		"fail (not just warn) when manifest.specFiles and on-disk *.spec.json files disagree")
	validateCmd.Flags().StringVar(&validateRepoRoot, "repo-root", "",
		"repo root that verifiedBy paths resolve against (default: the parent of --dir)")
}

// runValidate performs the validation and returns the process exit code. It is
// pure with respect to I/O streams (no os.Exit) so it is directly testable.
func runValidate(dir, repoRoot string, strictManifest bool, out, errOut io.Writer) int {
	v, err := schema.NewValidator()
	if err != nil {
		fmt.Fprintln(errOut, "error: build validator:", err)
		return exitCannotRun
	}
	st := store.New(dir)

	// verifiedBy paths resolve against the repo root. It is NOT necessarily the
	// parent of .specs/ (a custom --dir like ./config/specs breaks that guess), so
	// it is an explicit flag defaulting to the parent of --dir. When it is not a
	// readable directory (e.g. a piped bundle with no working tree) the existence
	// check is skipped with a note rather than failing the run.
	if repoRoot == "" {
		repoRoot = filepath.Dir(dir)
	}
	checkPaths := repoRootReadable(repoRoot)
	if !checkPaths {
		fmt.Fprintf(out, "note: repo root %q is not a readable directory; skipping verifiedBy existence check\n", repoRoot)
	}

	// manifest.json must be present and readable to run at all.
	manifestRaw, err := st.ReadRaw("manifest.json")
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Fprintf(errOut, "error: no manifest.json in %s\n", st.Dir())
		} else {
			fmt.Fprintf(errOut, "error: read manifest.json: %v\n", err)
		}
		return exitCannotRun
	}

	totalErrors := 0
	if errs := v.ValidateManifest(manifestRaw); errs != nil {
		printFileResult(out, "manifest.json", errs)
		totalErrors += len(errs)
	} else {
		fmt.Fprintln(out, "OK manifest.json")
	}

	names, err := st.SpecFileNames()
	if err != nil {
		fmt.Fprintf(errOut, "error: list spec files in %s: %v\n", st.Dir(), err)
		return exitCannotRun
	}

	for _, name := range names {
		raw, err := st.ReadRaw(name)
		if err != nil {
			// An unreadable or symlinked listed spec file is an author-fixable
			// problem with the specs dir, not an infra failure.
			printFileResult(out, name, []string{fmt.Sprintf("(file) %v", err)})
			totalErrors++
			continue
		}
		if errs := v.ValidateSpecFile(raw); errs != nil {
			printFileResult(out, name, errs)
			totalErrors += len(errs)
			continue
		}
		// Schema-valid: now check that each spec's declared verifiedBy paths exist
		// inside the repo (only meaningful once the file parses + validates).
		if checkPaths {
			if problems := checkVerifiedByPaths(repoRoot, raw); problems != nil {
				printFileResult(out, name, problems)
				totalErrors += len(problems)
				continue
			}
		}
		fmt.Fprintf(out, "OK %s\n", name)
	}

	driftErrors := reportDrift(out, manifestRaw, names, strictManifest)

	fmt.Fprintf(out, "\n%d files checked, %d error(s)\n", 1+len(names), totalErrors)

	if totalErrors > 0 || (strictManifest && driftErrors > 0) {
		return exitInvalid
	}
	return exitValid
}

func printFileResult(out io.Writer, name string, errs []string) {
	fmt.Fprintf(out, "FAIL %s\n", name)
	for _, e := range errs {
		fmt.Fprintf(out, "    %s\n", e)
	}
}

// reportDrift compares manifest.specFiles against the *.spec.json files on disk.
// It reuses the already-read manifest bytes (no second disk read). Warns by
// default; under --strict-manifest the caller treats drift as a failure.
// Returns the number of drift items found.
func reportDrift(out io.Writer, manifestRaw []byte, names []string, strict bool) int {
	var m struct {
		SpecFiles []string `json:"specFiles"`
	}
	if err := json.Unmarshal(manifestRaw, &m); err != nil {
		// Manifest parse problems are already reported by schema validation;
		// skip drift rather than double-report.
		return 0
	}

	onDisk := map[string]bool{}
	for _, n := range names {
		onDisk[n] = true
	}
	listed := map[string]bool{}
	for _, n := range m.SpecFiles {
		listed[n] = true
	}

	var missing, untracked []string
	for _, n := range m.SpecFiles {
		if !onDisk[n] {
			missing = append(missing, n)
		}
	}
	for _, n := range names {
		if !listed[n] {
			untracked = append(untracked, n)
		}
	}
	sort.Strings(missing)
	sort.Strings(untracked)

	label := "warning"
	if strict {
		label = "FAIL"
	}
	for _, n := range missing {
		fmt.Fprintf(out, "%s: manifest.specFiles lists %q but it is not on disk\n", label, n)
	}
	for _, n := range untracked {
		fmt.Fprintf(out, "%s: %q is on disk but not in manifest.specFiles\n", label, n)
	}
	return len(missing) + len(untracked)
}
