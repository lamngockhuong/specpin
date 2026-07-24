package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// shotScreenID restricts a screenId to a filename-safe charset. The screenId
// becomes the basename of .specs/shots/<screenId>.shot.json, so anything outside
// this set (notably ".", "/", "\", "..") is rejected before it can traverse out
// of the shots/ directory. The bound mirrors Screen.id (maxLength 100).
var shotScreenID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)

// shotSuffix is the on-disk suffix for a shot artifact file.
const shotSuffix = ".shot.json"

// shotsSubdir is the .specs/ subdirectory holding per-screen shot artifacts.
// Unlike the flat singletons (views/guides/…), shots are many files keyed by
// screenId, so they live in their own subdir to avoid colliding with names like
// screens.json.
const shotsSubdir = "shots"

// validateScreenID applies the filename-safety guard, returning ErrTraversal so
// the server maps a bad id to 400 (same status as the flat-store guard).
func validateScreenID(screenID string) error {
	if !shotScreenID.MatchString(screenID) {
		return fmt.Errorf("%w: invalid screenId %q", ErrTraversal, screenID)
	}
	return nil
}

func (s *Store) shotsDir() string { return filepath.Join(s.dir, shotsSubdir) }

func (s *Store) shotPath(screenID string) (string, error) {
	if err := validateScreenID(screenID); err != nil {
		return "", err
	}
	full := filepath.Join(s.shotsDir(), screenID+shotSuffix)
	// Reject a symlinked shot file: os.ReadFile/atomicWrite follow symlinks, so a
	// planted symlink could read or clobber a file outside shots/. Mirrors the
	// symlink guard in the flat-store resolve() (see symlink_guard_test.go). A
	// missing file is fine — WriteShot creates it.
	if fi, err := os.Lstat(full); err == nil && fi.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("%w: symlink not allowed: %q", ErrTraversal, screenID)
	}
	return full, nil
}

// ListShots returns the screenIds of every .specs/shots/<id>.shot.json file,
// sorted for stable output. A missing shots/ directory yields an empty list.
func (s *Store) ListShots() ([]string, error) {
	entries, err := os.ReadDir(s.shotsDir())
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}
	ids := []string{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), shotSuffix) {
			continue
		}
		id := strings.TrimSuffix(e.Name(), shotSuffix)
		// Skip any file whose basename is not a well-formed screenId; such a file
		// could not have been written through WriteShot.
		if shotScreenID.MatchString(id) {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids, nil
}

// ReadShot returns the raw bytes of one shot artifact, or ErrNotFound when the
// file is absent. The screenId is guarded before it touches the filesystem.
func (s *Store) ReadShot(screenID string) ([]byte, error) {
	full, err := s.shotPath(screenID)
	if err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(full)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return raw, nil
}

// WriteShot writes one shot artifact atomically, pretty-printed (2-space) for
// clean Git diffs, confined to .specs/shots/. The caller validates the body
// against the schema first. json.Indent is a pure whitespace transform, so the
// client's key order is preserved.
func (s *Store) WriteShot(screenID string, raw json.RawMessage) error {
	full, err := s.shotPath(screenID)
	if err != nil {
		return err
	}
	// Reuse the shared canonical-form recipe (2-space, trailing newline) so a shot
	// file is byte-identical in shape to every other .specs/ artifact.
	out, err := Canonicalize(raw)
	if err != nil {
		return fmt.Errorf("%w: shot body is not valid JSON", ErrInvalidName)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return atomicWrite(full, out)
}

// DeleteShot removes one shot artifact, returning ErrNotFound when it is absent.
func (s *Store) DeleteShot(screenID string) error {
	full, err := s.shotPath(screenID)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.Remove(full); err != nil {
		if os.IsNotExist(err) {
			return ErrNotFound
		}
		return err
	}
	return nil
}
