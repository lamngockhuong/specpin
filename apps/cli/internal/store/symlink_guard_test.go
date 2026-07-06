package store

import (
	"encoding/json"
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

// A name with a path separator is rejected before any filesystem access: .specs/
// is flat, so a multi-segment name can only be an escape attempt (e.g. a subdir
// symlink) or a nested write no reader would surface. Both "/" and "\" are
// rejected so a Windows-style separator cannot slip past on a POSIX host.
func TestResolveRejectsPathSeparator(t *testing.T) {
	s := newTempStore(t)

	if err := s.SaveSpec("sub/login.spec.json", json.RawMessage(validSpec), ""); !errors.Is(err, ErrTraversal) {
		t.Fatalf("SaveSpec with slash: want ErrTraversal, got %v", err)
	}
	if _, err := s.ReadRaw("sub/manifest.json"); !errors.Is(err, ErrTraversal) {
		t.Fatalf("ReadRaw with slash: want ErrTraversal, got %v", err)
	}
	if _, err := s.ReadRaw(`sub\manifest.json`); !errors.Is(err, ErrTraversal) {
		t.Fatalf("ReadRaw with backslash: want ErrTraversal, got %v", err)
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
