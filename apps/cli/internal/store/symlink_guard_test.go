package store

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// A symlinked spec file must be rejected: os.ReadFile would otherwise follow it
// and read (or, on write, clobber) a file outside .specs/.
func TestReadRawRejectsSymlink(t *testing.T) {
	s := newTempStore(t)

	target := filepath.Join(t.TempDir(), "outside.json")
	if err := os.WriteFile(target, []byte(`{"secret":true}`), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(s.Dir(), "evil.spec.json")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlinks unsupported on this platform: %v", err)
	}

	if _, err := s.ReadRaw("evil.spec.json"); !errors.Is(err, ErrTraversal) {
		t.Fatalf("want ErrTraversal for symlinked file, got %v", err)
	}
}

// A real (non-symlink) file inside .specs/ reads normally.
func TestReadRawReadsRegularFile(t *testing.T) {
	s := newTempStore(t)
	raw, err := s.ReadRaw("manifest.json")
	if err != nil {
		t.Fatalf("read manifest: %v", err)
	}
	if len(raw) == 0 {
		t.Fatal("manifest.json read empty")
	}
}
