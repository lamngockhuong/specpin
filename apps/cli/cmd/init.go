package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var (
	initProject string
	initDomains []string
)

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Scaffold .specs/manifest.json in the current repo",
	RunE:  runInit,
}

func init() {
	initCmd.Flags().StringVar(&initProject, "project", "", "project name (required)")
	initCmd.Flags().StringSliceVar(&initDomains, "domains", nil, "origins where the UI runs, e.g. localhost:3000")
}

func runInit(cmd *cobra.Command, _ []string) error {
	if initProject == "" {
		return fmt.Errorf("--project is required")
	}
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	specsDir := filepath.Join(cwd, ".specs")
	manifestPath := filepath.Join(specsDir, "manifest.json")

	if _, err := os.Stat(manifestPath); err == nil {
		return fmt.Errorf(".specs/manifest.json already exists; refusing to overwrite")
	}
	if err := os.MkdirAll(specsDir, 0o755); err != nil {
		return err
	}

	domains := initDomains
	if domains == nil {
		domains = []string{}
	}
	manifest := map[string]any{
		"$schema":   "https://specpin.ohnice.app/schema/v1.json",
		"version":   "1.0",
		"project":   initProject,
		"domains":   domains,
		"specFiles": []string{},
		"settings": map[string]any{
			"defaultLocale":            "en",
			"matchConfidenceThreshold": 0.6,
			"defaultDisplayMode":       "tooltip",
		},
	}
	out, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	out = append(out, '\n')
	if err := os.WriteFile(manifestPath, out, 0o644); err != nil {
		return err
	}

	fmt.Fprintf(cmd.OutOrStdout(), "Created %s\n", manifestPath)
	return nil
}
