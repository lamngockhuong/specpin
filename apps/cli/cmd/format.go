package cmd

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"slices"

	"github.com/spf13/cobra"

	"specpin/internal/store"
)

var (
	formatDir   string
	formatCheck bool
)

// format reuses validate's exit-code contract:
//
//	0 - all files already canonical (or successfully reformatted)
//	1 - --check found drift, or a file was unreadable / not valid JSON
//	2 - could not run (dir missing, internal error)
var formatCmd = &cobra.Command{
	Use:   "format",
	Short: "Rewrite .specs/ JSON into specpin's canonical format, offline",
	Long: "Format normalizes manifest.json, every *.spec.json, and views.json /\n" +
		"guides.json (when present) to specpin's on-disk canonical form: 2-space\n" +
		"indent, fully expanded, trailing newline. It is a pure whitespace transform\n" +
		"(never reorders keys or changes values) and matches what the sidecar writes,\n" +
		"so edits made through the extension produce minimal Git diffs.\n\n" +
		"Treat .specs/ as a tool-owned artifact: exclude it from your generic\n" +
		"formatter (Prettier/Biome) and run `specpin format` instead. Use\n" +
		"`specpin format --check` in pre-commit or CI to fail on un-formatted specs.\n\n" +
		"Exit 0 = all canonical, 1 = drift found (--check) or a bad file, 2 = cannot run.",
	RunE: func(cmd *cobra.Command, _ []string) error {
		code := runFormat(formatDir, formatCheck, cmd.OutOrStdout(), cmd.ErrOrStderr())
		if code != exitValid {
			os.Exit(code)
		}
		return nil
	},
}

func init() {
	formatCmd.Flags().StringVar(&formatDir, "dir", ".specs", "path to the .specs/ directory")
	formatCmd.Flags().BoolVar(&formatCheck, "check", false,
		"report files that need formatting and exit 1 without writing (for CI / pre-commit)")
}

// runFormat performs the format (or --check) pass and returns the process exit
// code. Like runValidate it is pure with respect to I/O streams (no os.Exit) so
// it is directly testable.
func runFormat(dir string, check bool, out, errOut io.Writer) int {
	st := store.New(dir)

	names, err := st.SpecFileNames()
	if err != nil {
		fmt.Fprintf(errOut, "error: read %s: %v\n", st.Dir(), err)
		return exitCannotRun
	}

	// Toolchain-owned files: the optional singletons (when present) plus every
	// *.spec.json on disk. Formatting is content-safe, so we normalize untracked
	// spec files too; manifest.specFiles drift stays `validate`'s concern.
	singletons := []string{"manifest.json", "views.json", "guides.json"}
	candidates := append(slices.Clone(singletons), names...)

	var checked, formatted, unchanged, drift, failures int
	for _, name := range candidates {
		raw, err := st.ReadRaw(name)
		if err != nil {
			if os.IsNotExist(err) && slices.Contains(singletons, name) {
				continue // optional singleton simply absent
			}
			fmt.Fprintf(out, "FAIL %s: %v\n", name, err)
			failures++
			continue
		}
		checked++

		want, err := store.Canonicalize(raw)
		if err != nil {
			fmt.Fprintf(out, "FAIL %s: %v\n", name, err) // not valid JSON
			failures++
			continue
		}
		if bytes.Equal(raw, want) {
			unchanged++
			continue
		}
		if check {
			fmt.Fprintf(out, "drift: %s\n", name)
			drift++
			continue
		}
		if err := st.WriteCanonical(name, raw); err != nil {
			fmt.Fprintf(out, "FAIL %s: %v\n", name, err)
			failures++
			continue
		}
		fmt.Fprintf(out, "formatted %s\n", name)
		formatted++
	}

	if check {
		fmt.Fprintf(out, "\n%d file(s) checked, %d need formatting", checked, drift)
	} else {
		fmt.Fprintf(out, "\n%d formatted, %d unchanged (%d checked)", formatted, unchanged, checked)
	}
	if failures > 0 {
		fmt.Fprintf(out, ", %d failed", failures)
	}
	fmt.Fprintln(out)

	if failures > 0 {
		return exitInvalid
	}
	if check && drift > 0 {
		return exitInvalid
	}
	return exitValid
}
