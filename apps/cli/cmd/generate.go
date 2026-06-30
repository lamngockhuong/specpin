package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

// generateCmd is a deliberate stub. The CLI adds no LLM: AI authoring is driven
// by your coding agent through the bundled @specpin/cli skill, which teaches it
// to author schema-valid specs and run this CLI. The command stays so the
// surface is stable and points users at that workflow.
var generateCmd = &cobra.Command{
	Use:   "generate [source-file]",
	Short: "AI-assisted spec authoring (driven by your coding agent via the @specpin/cli skill)",
	RunE: func(cmd *cobra.Command, _ []string) error {
		fmt.Fprintln(cmd.OutOrStdout(),
			"specpin does not generate specs itself. AI authoring is driven by your\n"+
				"coding agent (Claude Code, Cursor, etc.) using the bundled @specpin/cli skill.\n"+
				"Point your agent at the skill, then it authors .specs/ and runs `specpin validate`:\n"+
				"  https://unpkg.com/@specpin/cli@latest/skill/SKILL.md")
		return nil
	},
}
