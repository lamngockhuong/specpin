package cmd

import "testing"

func TestIsLoopbackHost(t *testing.T) {
	loopback := []string{"127.0.0.1", "::1", "localhost", "LOCALHOST", "127.0.0.5"}
	for _, h := range loopback {
		if !isLoopbackHost(h) {
			t.Errorf("%q should be loopback", h)
		}
	}
	network := []string{"0.0.0.0", "::", "192.168.1.50", "10.0.0.1", "example.com", ""}
	for _, h := range network {
		if isLoopbackHost(h) {
			t.Errorf("%q should NOT be loopback", h)
		}
	}
}

func TestResolveTokenPrecedence(t *testing.T) {
	// Flag wins over env.
	t.Setenv("SPECPIN_TOKEN", "from-env")
	serveToken = "from-flag"
	t.Cleanup(func() { serveToken = "" })
	tok, err := resolveToken()
	if err != nil {
		t.Fatal(err)
	}
	if tok != "from-flag" {
		t.Errorf("flag should win, got %q", tok)
	}

	// Env wins when the flag is empty.
	serveToken = ""
	tok, err = resolveToken()
	if err != nil {
		t.Fatal(err)
	}
	if tok != "from-env" {
		t.Errorf("env should be used, got %q", tok)
	}

	// Neither set -> a random token (non-empty, hex).
	t.Setenv("SPECPIN_TOKEN", "")
	tok, err = resolveToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(tok) != 48 { // 24 random bytes hex-encoded
		t.Errorf("random token should be 48 hex chars, got %d (%q)", len(tok), tok)
	}
}
