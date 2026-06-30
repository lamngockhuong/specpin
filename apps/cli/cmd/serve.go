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
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"specpin/internal/schema"
	"specpin/internal/server"
	"specpin/internal/store"
	"specpin/internal/watch"
)

var (
	servePort  int
	serveDir   string
	serveHost  string
	serveToken string
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Serve .specs/ over a hardened HTTP API (localhost by default)",
	RunE:  runServe,
}

func init() {
	serveCmd.Flags().IntVar(&servePort, "port", 0, "pin a port (default: auto-pick a free port)")
	serveCmd.Flags().StringVar(&serveDir, "dir", ".specs", "path to the .specs directory")
	serveCmd.Flags().StringVar(&serveHost, "host", "127.0.0.1", "bind address (default loopback; a non-loopback address exposes a plaintext, token-only port — firewall it and front it with an HTTPS reverse proxy)")
	serveCmd.Flags().StringVar(&serveToken, "token", "", "pin the bearer token (or set SPECPIN_TOKEN); default is a fresh random token each run")
}

// isLoopbackHost reports whether a bind address stays on the local machine.
// localhost resolves to a loopback IP but is not itself parseable as one, so it
// is matched by name; everything else (0.0.0.0, ::, concrete LAN IPs) is treated
// as network-exposed.
func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback()
	}
	return false
}

// resolveToken picks the bearer token: --token flag, then SPECPIN_TOKEN env, then
// a fresh random token. A pinned token survives restarts so a remote team is not
// de-authed on every reboot.
func resolveToken() (string, error) {
	if serveToken != "" {
		return serveToken, nil
	}
	if env := os.Getenv("SPECPIN_TOKEN"); env != "" {
		return env, nil
	}
	return generateToken()
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
	// Fail early on a missing/unreadable manifest.json instead of serving a dir
	// whose every /specs request would return load_failed. The usual cause is
	// --dir pointed at the repo root rather than its .specs/ subdirectory.
	m, err := st.LoadManifest()
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("no manifest.json in %s (point --dir at the .specs directory, or run `specpin init` first)", specsDir)
		}
		return fmt.Errorf("read manifest.json in %s: %w", specsDir, err)
	}
	project := m.Project

	token, err := resolveToken()
	if err != nil {
		return err
	}

	hub := server.NewHub()
	srv := server.New(st, validator, hub, token, project, Version)

	listenAddr := net.JoinHostPort(serveHost, strconv.Itoa(servePort))
	ln, err := net.Listen("tcp", listenAddr)
	if err != nil {
		return fmt.Errorf("bind %s: %w", listenAddr, err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	url := fmt.Sprintf("http://%s", net.JoinHostPort(serveHost, strconv.Itoa(port)))

	// A non-loopback bind exposes the raw, plaintext, token-only port directly to
	// the network; the reverse proxy is NOT magically in the path. Warn loudly.
	if !isLoopbackHost(serveHost) {
		errOut := cmd.ErrOrStderr()
		fmt.Fprintf(errOut, "warning: binding %s exposes Specpin to the network.\n", serveHost)
		fmt.Fprintln(errOut, "  - The raw port is PLAINTEXT and token-only: firewall it so only your reverse proxy reaches it.")
		fmt.Fprintln(errOut, "  - Put it behind an HTTPS reverse proxy; the extension blocks plaintext remote connections.")
		if servePort == 0 {
			fmt.Fprintln(errOut, "  - The auto-picked port is unstable across restarts and will break a proxy config: pin --port.")
		}
	}

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

	printConnectInfo(cmd, url, token, project, specsDir, serveHost)
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

func printConnectInfo(cmd *cobra.Command, url, token, project, dir, host string) {
	out := cmd.OutOrStdout()
	fmt.Fprintln(out, "Specpin sidecar running.")
	if project != "" {
		fmt.Fprintf(out, "  Project: %s\n", project)
	}
	fmt.Fprintf(out, "  Dir:     %s\n", dir)
	fmt.Fprintf(out, "  URL:     %s\n", url)
	fmt.Fprintf(out, "  Token:   %s\n", token)
	if isLoopbackHost(host) {
		fmt.Fprintln(out, "Paste the URL and token into the extension Options page. Ctrl+C to stop.")
		return
	}
	// The printed URL is the raw plaintext port, not a connectable remote target:
	// the extension rejects plaintext remote. Point the operator at the proxy.
	fmt.Fprintln(out, "This is the raw plaintext URL. For remote use, connect the extension to your")
	fmt.Fprintln(out, "HTTPS reverse proxy (e.g. https://specs.example.com), not this address. Ctrl+C to stop.")
}
