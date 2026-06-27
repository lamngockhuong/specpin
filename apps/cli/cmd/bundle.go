package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"

	"specpin/internal/store"
)

var (
	bundleDir string
	bundleOut string
)

// bundleEnvelope is the Manual-import bundle shape the browser extension's
// parseLocalBundle expects: the manifest plus each *.spec.json kept verbatim
// under its file name. This is the per-file on-disk shape, NOT the flattened
// { manifest, specs[] } that store.Load() / the sidecar SpecsResponse produce.
type bundleEnvelope struct {
	Manifest json.RawMessage            `json:"manifest"`
	Files    map[string]json.RawMessage `json:"files"`
}

var bundleCmd = &cobra.Command{
	Use:   "bundle",
	Short: "Assemble .specs/ into a Manual-import bundle JSON for the extension (no sidecar)",
	Long: "Bundle reads a .specs/ directory (manifest.json plus every *.spec.json) and prints\n" +
		"a single JSON object of the shape { \"manifest\": {...}, \"files\": { \"x.spec.json\": {...} } }.\n" +
		"Paste it into the extension's Options page (Manual specs) or pipe it elsewhere to view\n" +
		"specs without running `specpin serve`. It does not validate; run `specpin validate` for\n" +
		"schema checks.",
	RunE: func(cmd *cobra.Command, _ []string) error {
		code := runBundle(bundleDir, bundleOut, cmd.OutOrStdout(), cmd.ErrOrStderr())
		if code != exitValid {
			os.Exit(code)
		}
		return nil
	},
}

func init() {
	bundleCmd.Flags().StringVar(&bundleDir, "dir", ".specs", "path to the .specs/ directory")
	bundleCmd.Flags().StringVar(&bundleOut, "out", "",
		"write the bundle JSON to a file instead of stdout")
}

// runBundle assembles the bundle and returns the process exit code. It is pure
// with respect to I/O streams (no os.Exit) so it is directly testable, mirroring
// runValidate. On any read failure it emits nothing to out (no partial bundle).
func runBundle(dir, outPath string, out, errOut io.Writer) int {
	st := store.New(dir)

	// manifest.json must be present and readable to produce a bundle at all.
	manifestRaw, err := st.ReadRaw("manifest.json")
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Fprintf(errOut, "error: no manifest.json in %s\n", st.Dir())
		} else {
			fmt.Fprintf(errOut, "error: read manifest.json: %v\n", err)
		}
		return exitCannotRun
	}

	names, err := st.SpecFileNames()
	if err != nil {
		fmt.Fprintf(errOut, "error: list spec files in %s: %v\n", st.Dir(), err)
		return exitCannotRun
	}

	files := make(map[string]json.RawMessage, len(names))
	for _, name := range names {
		raw, err := st.ReadRaw(name)
		if err != nil {
			// A bundle missing one of its files is not a valid bundle; fail hard
			// rather than emit a partial envelope. The store rejects symlinked
			// entries here (path-traversal/symlink guard).
			fmt.Fprintf(errOut, "error: read %s: %v\n", name, err)
			return exitCannotRun
		}
		files[name] = raw
	}

	// MarshalIndent compacts each RawMessage then re-indents the whole envelope,
	// so nested file contents are pretty-printed (2-space) for clean Git diffs.
	data, err := json.MarshalIndent(bundleEnvelope{Manifest: manifestRaw, Files: files}, "", "  ")
	if err != nil {
		fmt.Fprintf(errOut, "error: encode bundle: %v\n", err)
		return exitCannotRun
	}
	data = append(data, '\n')

	if outPath != "" {
		if err := os.WriteFile(outPath, data, 0o644); err != nil {
			fmt.Fprintf(errOut, "error: write %s: %v\n", outPath, err)
			return exitCannotRun
		}
		fmt.Fprintf(errOut, "wrote %d spec file(s) to %s\n", len(files), outPath)
		return exitValid
	}

	if _, err := out.Write(data); err != nil {
		fmt.Fprintf(errOut, "error: write output: %v\n", err)
		return exitCannotRun
	}
	return exitValid
}
