package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// checkVerifiedByPaths turns declared test linkage into a checked "link isn't
// broken" signal: for every spec in a *.spec.json file, each verifiedBy entry is
// resolved against the repo root and confirmed to exist inside the repo. It never
// runs tests or reads pass/fail — only that the referenced path is present and
// contained. Returns one message per problem (missing file, or a path that would
// escape the repo), each naming the spec id + path; nil when all paths are fine.
//
// The path guard is anchored at the REPO ROOT (not the .specs/-confined store
// guard, which rejects any `..` and so would reject every legitimate test path
// living outside .specs/). It rejects absolute paths and `..`-escapes lexically,
// then resolves symlinks and re-checks containment so a symlink cannot point the
// existence check outside the repo.
func checkVerifiedByPaths(repoRoot string, specFileRaw []byte) []string {
	var sf struct {
		Specs []struct {
			ID         string   `json:"id"`
			VerifiedBy []string `json:"verifiedBy"`
		} `json:"specs"`
	}
	// A parse failure is already surfaced by schema validation; don't double-report.
	if err := json.Unmarshal(specFileRaw, &sf); err != nil {
		return nil
	}

	// Resolve the repo root's own symlinks once up front so the per-path
	// containment check compares resolved-vs-resolved. Otherwise a repo checked out
	// under a symlinked path (e.g. macOS /var -> /private/var, or a symlinked
	// workspace) would make every EvalSymlinks-resolved test path look like it
	// escapes the (un-resolved) root, falsely failing validation.
	if resolved, err := filepath.EvalSymlinks(repoRoot); err == nil {
		repoRoot = resolved
	}

	var problems []string
	for _, spec := range sf.Specs {
		for _, p := range spec.VerifiedBy {
			problems = appendVerifiedByProblem(problems, repoRoot, spec.ID, p)
		}
	}
	return problems
}

func appendVerifiedByProblem(problems []string, repoRoot, specID, p string) []string {
	full, reason := resolveRepoPath(repoRoot, p)
	if reason != "" {
		return append(problems,
			fmt.Sprintf("(verifiedBy) spec %q: path %q rejected: %s", specID, p, reason))
	}
	// EvalSymlinks resolves any symlink components AND implies existence (it errors
	// for a missing path). A resolved real path that escapes the repo is a symlink
	// escape; a resolution error means the file is missing/unresolvable.
	resolved, err := filepath.EvalSymlinks(full)
	if err != nil {
		return append(problems,
			fmt.Sprintf("(verifiedBy) spec %q references missing file %q", specID, p))
	}
	if !withinRepo(repoRoot, resolved) {
		return append(problems,
			fmt.Sprintf("(verifiedBy) spec %q: path %q escapes the repo via a symlink", specID, p))
	}
	return problems
}

// resolveRepoPath joins a repo-relative path onto repoRoot and rejects absolute
// paths and lexical `..`-escapes. Returns the absolute joined path, or a non-empty
// reason when the path is unsafe.
func resolveRepoPath(repoRoot, p string) (full, reason string) {
	if filepath.IsAbs(p) {
		return "", "absolute path not allowed"
	}
	full = filepath.Join(repoRoot, filepath.Clean(p))
	if !withinRepo(repoRoot, full) {
		return "", "path escapes the repo root"
	}
	return full, ""
}

// withinRepo reports whether target is repoRoot itself or a descendant of it,
// using a lexical relative-path check (allows subdirectories, rejects `..`).
func withinRepo(repoRoot, target string) bool {
	rel, err := filepath.Rel(repoRoot, target)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// repoRootReadable reports whether repoRoot is an existing, readable directory,
// so the verifiedBy existence check can run. When false (e.g. a piped bundle with
// no working tree), the caller skips the check rather than failing.
func repoRootReadable(repoRoot string) bool {
	info, err := os.Stat(repoRoot)
	return err == nil && info.IsDir()
}
