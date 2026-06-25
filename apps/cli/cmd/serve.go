package cmd

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"specpin/internal/schema"
	"specpin/internal/server"
	"specpin/internal/store"
	"specpin/internal/watch"
)

var (
	servePort int
	serveDir  string
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Serve .specs/ over a hardened localhost HTTP API",
	RunE:  runServe,
}

func init() {
	serveCmd.Flags().IntVar(&servePort, "port", 0, "pin a port (default: auto-pick a free port)")
	serveCmd.Flags().StringVar(&serveDir, "dir", ".specs", "path to the .specs directory")
}

func runServe(cmd *cobra.Command, _ []string) error {
	specsDir, err := resolveSpecsDir(serveDir)
	if err != nil {
		return err
	}
	if _, err := os.Stat(specsDir); err != nil {
		return fmt.Errorf("cannot open %s (run `specpin init` first): %w", specsDir, err)
	}

	validator, err := schema.NewValidator()
	if err != nil {
		return err
	}

	st := store.New(specsDir)
	project := ""
	if m, err := st.LoadManifest(); err == nil {
		project = m.Project
	}

	token, err := generateToken()
	if err != nil {
		return err
	}

	hub := server.NewHub()
	srv := server.New(st, validator, hub, token, project, Version)

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", servePort))
	if err != nil {
		return fmt.Errorf("bind 127.0.0.1:%d: %w", servePort, err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	url := fmt.Sprintf("http://127.0.0.1:%d", port)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := watch.Watch(ctx, specsDir, 150*time.Millisecond, func() {
		hub.Broadcast(`{"type":"change"}`)
	}); err != nil {
		fmt.Fprintln(cmd.ErrOrStderr(), "warning: file watching disabled:", err)
	}

	httpServer := &http.Server{Handler: srv.Handler(), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdownCtx)
	}()

	printConnectInfo(cmd, url, token, project, specsDir)
	if err := httpServer.Serve(ln); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

func resolveSpecsDir(dir string) (string, error) {
	if filepath.IsAbs(dir) {
		return dir, nil
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	return filepath.Join(cwd, dir), nil
}

func generateToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func printConnectInfo(cmd *cobra.Command, url, token, project, dir string) {
	out := cmd.OutOrStdout()
	fmt.Fprintln(out, "Specpin sidecar running.")
	if project != "" {
		fmt.Fprintf(out, "  Project: %s\n", project)
	}
	fmt.Fprintf(out, "  Dir:     %s\n", dir)
	fmt.Fprintf(out, "  URL:     %s\n", url)
	fmt.Fprintf(out, "  Token:   %s\n", token)
	fmt.Fprintln(out, "Paste the URL and token into the extension Options page. Ctrl+C to stop.")
}
