package watch

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWatchFiresOnFileChange(t *testing.T) {
	dir := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	fired := make(chan struct{}, 1)
	if err := Watch(ctx, dir, 30*time.Millisecond, func() {
		select {
		case fired <- struct{}{}:
		default:
		}
	}); err != nil {
		t.Fatalf("watch setup: %v", err)
	}

	// Give the watcher goroutine a moment to start.
	time.Sleep(20 * time.Millisecond)
	if err := os.WriteFile(filepath.Join(dir, "login.spec.json"), []byte(`{}`), 0o644); err != nil {
		t.Fatal(err)
	}

	select {
	case <-fired:
	case <-time.After(2 * time.Second):
		t.Fatal("watcher did not fire on file change")
	}
}

func TestWatchFiresOnViewsChange(t *testing.T) {
	dir := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	fired := make(chan struct{}, 1)
	if err := Watch(ctx, dir, 30*time.Millisecond, func() {
		select {
		case fired <- struct{}{}:
		default:
		}
	}); err != nil {
		t.Fatalf("watch setup: %v", err)
	}

	// The dir watch covers views.json with no allow-list, so a write to it must
	// fire SSE just like a *.spec.json change.
	time.Sleep(20 * time.Millisecond)
	if err := os.WriteFile(filepath.Join(dir, "views.json"), []byte(`{}`), 0o644); err != nil {
		t.Fatal(err)
	}

	select {
	case <-fired:
	case <-time.After(2 * time.Second):
		t.Fatal("watcher did not fire on views.json change")
	}
}

func TestWatchIgnoresTempArtifacts(t *testing.T) {
	dir := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	fired := make(chan struct{}, 1)
	if err := Watch(ctx, dir, 30*time.Millisecond, func() {
		select {
		case fired <- struct{}{}:
		default:
		}
	}); err != nil {
		t.Fatalf("watch setup: %v", err)
	}

	time.Sleep(20 * time.Millisecond)
	if err := os.WriteFile(filepath.Join(dir, ".specpin-abc.tmp"), []byte(`{}`), 0o644); err != nil {
		t.Fatal(err)
	}

	select {
	case <-fired:
		t.Fatal("watcher should ignore its own temp artifacts")
	case <-time.After(200 * time.Millisecond):
		// expected: no fire
	}
}
