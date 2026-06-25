package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

// generateCmd is a deliberate stub. AI-assisted spec generation is deferred to
// v1.1; the command exists so the CLI surface is stable and discoverable.
var generateCmd = &cobra.Command{
	Use:   "generate [source-file]",
	Short: "AI-assisted spec generation (deferred to v1.1)",
	RunE: func(cmd *cobra.Command, _ []string) error {
		fmt.Fprintln(cmd.OutOrStdout(),
			"specpin generate is deferred to v1.1 and not available in this build.")
		return nil
	},
}
