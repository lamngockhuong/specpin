// Package watch debounces filesystem events on the .specs/ directory and
// invokes a callback so the server can push SSE change events.
package watch

import (
	"context"
	"path/filepath"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Watch observes dir for write/create/remove/rename events and calls onChange
// at most once per debounce window. It returns once the watcher is set up and
// runs in the background until ctx is cancelled, then tears down the watcher.
// The returned error is non-nil only on setup failure.
func Watch(ctx context.Context, dir string, debounce time.Duration, onChange func()) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	if err := w.Add(dir); err != nil {
		w.Close()
		return err
	}

	go func() {
		defer w.Close()
		var timer *time.Timer
		fire := make(chan struct{}, 1)

		for {
			select {
			case <-ctx.Done():
				if timer != nil {
					timer.Stop()
				}
				return
			case event, ok := <-w.Events:
				if !ok {
					return
				}
				// Ignore our own temp files from atomic writes.
				if isTempArtifact(event.Name) {
					continue
				}
				if timer != nil {
					timer.Stop()
				}
				timer = time.AfterFunc(debounce, func() {
					select {
					case fire <- struct{}{}:
					default:
					}
				})
			case <-fire:
				onChange()
			case _, ok := <-w.Errors:
				if !ok {
					return
				}
			}
		}
	}()

	return nil
}

func isTempArtifact(name string) bool {
	return strings.HasPrefix(filepath.Base(name), ".specpin-")
}
