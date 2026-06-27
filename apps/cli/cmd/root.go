package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// Version is the CLI version, overridable at build time via -ldflags.
var Version = "0.0.0-dev"

var rootCmd = &cobra.Command{
	Use:   "specpin",
	Short: "Specpin sidecar: serve a repo's .specs/ directory to the browser extension",
	Long: "Specpin pins business specs to UI elements. This sidecar scaffolds and serves\n" +
		"the .specs/ directory over a hardened localhost HTTP API. It is not a code\n" +
		"generator: it serves living documentation for interfaces you already have.",
	SilenceUsage: true,
}

// Execute runs the root command.
func Execute() {
	rootCmd.Version = Version
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.AddCommand(initCmd, serveCmd, validateCmd, bundleCmd, generateCmd)
}
