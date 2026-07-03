// Package store reads and writes the consumer repo's .specs/ directory:
// manifest.json plus the <area>.spec.json files. All writes are atomic,
// pretty-printed (2-space), and confined to the .specs/ directory.
package store

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// defaultViewsJSON is returned by LoadViews when .specs/views.json is absent: an
// empty team default (everything visible), so clients need no 404 special-case.
const defaultViewsJSON = "{\n  \"version\": \"1.0\",\n  \"hidden\": []\n}\n"

// defaultGuidesJSON is returned by LoadGuides when .specs/guides.json is absent:
// an empty named-guides default, so clients need no 404 special-case.
const defaultGuidesJSON = "{\n  \"version\": \"1.0\",\n  \"guides\": []\n}\n"

// ErrNotFound is returned when a spec id cannot be located across spec files.
var ErrNotFound = errors.New("spec not found")

// ErrTraversal is returned when a requested file escapes the .specs/ directory.
var ErrTraversal = errors.New("path escapes .specs directory")

// ErrInvalidName is returned when a spec file name is not a *.spec.json file.
var ErrInvalidName = errors.New("invalid spec file name")

// ErrVersionMismatch is returned when a write carries an If-Match that no longer
// matches the current /specs bundle ETag: a teammate changed the specs since the
// caller last read them. The server maps this to 409 so the client reloads
// instead of silently clobbering the newer state (optimistic concurrency).
var ErrVersionMismatch = errors.New("specs changed since last read (stale If-Match)")

// Manifest mirrors the schema's Manifest entity (loose; validation lives in the
// schema package).
type Manifest struct {
	Schema    string          `json:"$schema,omitempty"`
	Version   string          `json:"version"`
	Project   string          `json:"project"`
	Domains   []string        `json:"domains"`
	SpecFiles []string        `json:"specFiles"`
	Settings  json.RawMessage `json:"settings,omitempty"`
}

// specFile is the on-disk shape of an <area>.spec.json file.
type specFile struct {
	Schema string            `json:"$schema,omitempty"`
	Group  string            `json:"group"`
	Specs  []json.RawMessage `json:"specs"`
}

// Bundle is the merged view returned by Load: the manifest plus every spec,
// each annotated with the file it came from.
type Bundle struct {
	Manifest Manifest         `json:"manifest"`
	Specs    []map[string]any `json:"specs"`
}

// Store operates on a single .specs/ directory.
type Store struct {
	dir string
	// mu serializes every load-modify-write so two concurrent writers (multiple
	// extension clients against one remote sidecar) cannot interleave a read and a
	// write of the same file and silently drop one append. One coarse lock for the
	// whole store is sufficient at this scale; per-file locking is premature.
	mu sync.Mutex
}

// New returns a Store rooted at the given .specs/ directory (cleaned).
func New(dir string) *Store {
	abs, err := filepath.Abs(dir)
	if err != nil {
		abs = filepath.Clean(dir)
	}
	return &Store{dir: abs}
}

// Dir returns the absolute .specs/ directory path.
func (s *Store) Dir() string { return s.dir }

// resolve maps a relative spec-file name to an absolute path, rejecting any
// name that would escape the .specs/ directory (path-traversal guard).
func (s *Store) resolve(name string) (string, error) {
	if name == "" {
		return "", fmt.Errorf("%w: empty file name", ErrTraversal)
	}
	clean := filepath.Clean(name)
	if filepath.IsAbs(clean) || strings.HasPrefix(clean, "..") {
		return "", fmt.Errorf("%w: %q", ErrTraversal, name)
	}
	full := filepath.Join(s.dir, clean)
	rel, err := filepath.Rel(s.dir, full)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("%w: %q", ErrTraversal, name)
	}
	// Reject symlinked entries: os.ReadFile/Write follow symlinks, so a symlinked
	// .spec.json could read or clobber a file outside .specs/. A missing file is
	// fine here (new spec files are created by SaveSpec); only an existing symlink
	// is rejected.
	if fi, err := os.Lstat(full); err == nil && fi.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("%w: symlink not allowed: %q", ErrTraversal, name)
	}
	return full, nil
}

// ReadRaw reads a file inside .specs/ by name, applying the traversal and
// symlink guard. Used by offline validation to read manifest.json and each
// *.spec.json without going through the parsing helpers.
func (s *Store) ReadRaw(name string) ([]byte, error) {
	full, err := s.resolve(name)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(full)
}

func (s *Store) manifestPath() string { return filepath.Join(s.dir, "manifest.json") }

// Canonicalize returns raw re-indented to the .specs/ on-disk canonical form:
// 2-space indent, every object/array element on its own line, and a trailing
// newline. It is a pure whitespace transform (json.Indent), so it never reorders
// keys or mutates values, and is idempotent on files the sidecar already wrote.
// It backs SaveViews/SaveGuides and the `specpin format` command.
//
// Note: the spec-file write path (writeSpecFile) marshals the specFile struct via
// json.MarshalIndent, which HTML-escapes < > & where json.Indent leaves them
// literal. The two agree byte-for-byte on spec bytes the sidecar itself produced
// (already escaped), but diverge for hand-authored specs containing literal
// < > &. Unifying writeSpecFile onto this recipe is a tracked follow-up.
func Canonicalize(raw []byte) ([]byte, error) {
	var buf bytes.Buffer
	if err := json.Indent(&buf, raw, "", "  "); err != nil {
		return nil, err
	}
	// json.Indent copies insignificant whitespace surrounding the top-level value
	// verbatim (notably a trailing newline), so trim it and add exactly one back.
	// Without this, canonicalizing an already-canonical file (which ends in \n)
	// would append a second newline, breaking idempotence.
	out := bytes.TrimSpace(buf.Bytes())
	return append(out, '\n'), nil
}

// WriteCanonical canonicalizes raw and writes it to name inside .specs/,
// atomically and behind the traversal + symlink guard. Callers outside this
// package must go through here (not os.WriteFile) so the .specs/-confinement
// guarantee holds. Used by the `specpin format` command.
func (s *Store) WriteCanonical(name string, raw []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	full, err := s.resolve(name)
	if err != nil {
		return err
	}
	out, err := Canonicalize(raw)
	if err != nil {
		return err
	}
	return atomicWrite(full, out)
}

// LoadViews reads the raw .specs/views.json (the team-default visibility config),
// or returns the empty default when the file does not exist. The traversal +
// symlink guard applies via resolve, like every other .specs/ read.
func (s *Store) LoadViews() ([]byte, error) {
	full, err := s.resolve("views.json")
	if err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(full)
	if err != nil {
		if os.IsNotExist(err) {
			return []byte(defaultViewsJSON), nil
		}
		return nil, err
	}
	return raw, nil
}

// SaveViews writes views.json atomically and canonically (2-space, expanded) for
// clean Git diffs, confined to .specs/. The caller validates the body against the
// schema first; Canonicalize preserves the client's key order.
func (s *Store) SaveViews(raw json.RawMessage) error {
	return s.WriteCanonical("views.json", raw)
}

// LoadGuides reads the raw .specs/guides.json (the named-guides config), or
// returns the empty default when the file does not exist. The traversal +
// symlink guard applies via resolve, like every other .specs/ read. guides.json
// is a singleton (one per .specs/); per-guide edits are whole-file PUTs.
func (s *Store) LoadGuides() ([]byte, error) {
	full, err := s.resolve("guides.json")
	if err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(full)
	if err != nil {
		if os.IsNotExist(err) {
			return []byte(defaultGuidesJSON), nil
		}
		return nil, err
	}
	return raw, nil
}

// SaveGuides writes guides.json atomically and canonically (2-space, expanded) for
// clean Git diffs, confined to .specs/. The caller validates the body against the
// schema first; Canonicalize preserves the client's key order.
func (s *Store) SaveGuides(raw json.RawMessage) error {
	return s.WriteCanonical("guides.json", raw)
}

// LoadManifest reads and parses manifest.json.
func (s *Store) LoadManifest() (Manifest, error) {
	var m Manifest
	raw, err := os.ReadFile(s.manifestPath())
	if err != nil {
		return m, err
	}
	if err := json.Unmarshal(raw, &m); err != nil {
		return m, fmt.Errorf("parse manifest.json: %w", err)
	}
	return m, nil
}

// SpecFileNames lists *.spec.json files in the directory, sorted for stable output.
func (s *Store) SpecFileNames() ([]string, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".spec.json") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	return names, nil
}

// Load merges the manifest and all spec files into a Bundle. Each spec gains a
// "_file" key naming its source file.
func (s *Store) Load() (Bundle, error) {
	var b Bundle
	m, err := s.LoadManifest()
	if err != nil {
		return b, err
	}
	b.Manifest = m
	b.Specs = []map[string]any{}

	names, err := s.SpecFileNames()
	if err != nil {
		return b, err
	}
	for _, name := range names {
		sf, _, err := s.loadSpecFile(name)
		if err != nil {
			return b, err
		}
		for _, raw := range sf.Specs {
			var spec map[string]any
			if err := json.Unmarshal(raw, &spec); err != nil {
				return b, fmt.Errorf("parse spec in %s: %w", name, err)
			}
			spec["_file"] = name
			b.Specs = append(b.Specs, spec)
		}
	}
	return b, nil
}

// ETagFor computes the optimistic-concurrency tag for a /specs bundle: a quoted
// SHA-256 of the marshaled bundle. encoding/json sorts map keys, so the bytes
// (and therefore the tag) are deterministic for a given set of specs. Both the
// GET /specs response header and the write-path If-Match compare go through this
// one function so their formats cannot drift.
func ETagFor(b Bundle) string {
	data, _ := json.Marshal(b)
	sum := sha256.Sum256(data)
	return `"` + hex.EncodeToString(sum[:]) + `"`
}

func (s *Store) loadSpecFile(name string) (specFile, string, error) {
	var sf specFile
	full, err := s.resolve(name)
	if err != nil {
		return sf, "", err
	}
	raw, err := os.ReadFile(full)
	if err != nil {
		if os.IsNotExist(err) {
			return specFile{Specs: []json.RawMessage{}}, full, nil
		}
		return sf, full, err
	}
	if err := json.Unmarshal(raw, &sf); err != nil {
		return sf, full, fmt.Errorf("parse %s: %w", name, err)
	}
	if sf.Specs == nil {
		sf.Specs = []json.RawMessage{}
	}
	return sf, full, nil
}

func specID(raw json.RawMessage) string {
	var probe struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(raw, &probe)
	return probe.ID
}

// SaveSpec appends or updates (by id) a spec inside the named file, then writes
// the file atomically. The spec's id is the upsert key. A non-empty ifMatch is an
// optimistic-concurrency precondition: the write is rejected with
// ErrVersionMismatch when it no longer matches the current bundle ETag.
func (s *Store) SaveSpec(name string, spec json.RawMessage, ifMatch string) error {
	id := specID(spec)
	if id == "" {
		return errors.New("spec has no id")
	}
	if !strings.HasSuffix(name, ".spec.json") {
		return fmt.Errorf("%w: must end with .spec.json: %q", ErrInvalidName, name)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.checkIfMatch(ifMatch); err != nil {
		return err
	}
	sf, full, err := s.loadSpecFile(name)
	if err != nil {
		return err
	}
	if sf.Group == "" {
		sf.Group = deriveGroup(name)
	}
	replaced := false
	for i, existing := range sf.Specs {
		if specID(existing) == id {
			sf.Specs[i] = spec
			replaced = true
			break
		}
	}
	if !replaced {
		sf.Specs = append(sf.Specs, spec)
	}
	return s.writeSpecFile(full, sf)
}

// UpdateSpec replaces a spec found by id in whichever file holds it. A non-empty
// ifMatch is an optimistic-concurrency precondition (see SaveSpec).
func (s *Store) UpdateSpec(id string, spec json.RawMessage, ifMatch string) error {
	return s.mutateByID(id, ifMatch, func(sf *specFile, i int) { sf.Specs[i] = spec })
}

// DeleteSpec removes a spec by id from whichever file holds it. A non-empty
// ifMatch is an optimistic-concurrency precondition (see SaveSpec).
func (s *Store) DeleteSpec(id string, ifMatch string) error {
	return s.mutateByID(id, ifMatch, func(sf *specFile, i int) {
		sf.Specs = append(sf.Specs[:i], sf.Specs[i+1:]...)
	})
}

func (s *Store) mutateByID(id string, ifMatch string, fn func(sf *specFile, i int)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.checkIfMatch(ifMatch); err != nil {
		return err
	}
	names, err := s.SpecFileNames()
	if err != nil {
		return err
	}
	for _, name := range names {
		sf, full, err := s.loadSpecFile(name)
		if err != nil {
			return err
		}
		for i, existing := range sf.Specs {
			if specID(existing) == id {
				fn(&sf, i)
				return s.writeSpecFile(full, sf)
			}
		}
	}
	return ErrNotFound
}

// checkIfMatch enforces the optimistic-concurrency precondition. An empty ifMatch
// means "no precondition" (backward compatible for the single-writer localhost
// case). Otherwise it must equal the current /specs bundle ETag. MUST be called
// with s.mu held: it loads the bundle that the about-to-run write will mutate, so
// the read-compare-write is atomic.
func (s *Store) checkIfMatch(ifMatch string) error {
	if ifMatch == "" {
		return nil
	}
	b, err := s.Load()
	if err != nil {
		return err
	}
	if ETagFor(b) != ifMatch {
		return ErrVersionMismatch
	}
	return nil
}

func (s *Store) writeSpecFile(full string, sf specFile) error {
	out, err := json.MarshalIndent(sf, "", "  ")
	if err != nil {
		return err
	}
	out = append(out, '\n')
	return atomicWrite(full, out)
}

func deriveGroup(name string) string {
	base := strings.TrimSuffix(filepath.Base(name), ".spec.json")
	return strings.ReplaceAll(base, "-", " ")
}

// atomicWrite writes via a temp file in the same directory, then renames.
func atomicWrite(full string, data []byte) error {
	dir := filepath.Dir(full)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".specpin-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, full)
}
