package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const validShot = `{"version":"1","screenId":"checkout","image":"shots/checkout.png","items":[{"itemNo":"1","bbox":{"startX":0,"startY":0,"endX":10,"endY":10}}]}`

func TestShotWriteReadRoundTrip(t *testing.T) {
	s := newTempStore(t)
	if err := s.WriteShot("checkout", json.RawMessage(validShot)); err != nil {
		t.Fatalf("write: %v", err)
	}
	raw, err := s.ReadShot("checkout")
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got["screenId"] != "checkout" {
		t.Errorf("wrong screenId: %v", got["screenId"])
	}
	// File lives in the shots/ subdir and is pretty-printed with a trailing newline.
	full := filepath.Join(s.Dir(), "shots", "checkout.shot.json")
	onDisk, err := os.ReadFile(full)
	if err != nil {
		t.Fatalf("stat file: %v", err)
	}
	if !strings.Contains(string(onDisk), "\n  ") {
		t.Errorf("expected 2-space pretty JSON, got %q", onDisk)
	}
	if !strings.HasSuffix(string(onDisk), "\n") {
		t.Errorf("expected trailing newline")
	}
}

func TestShotListSorted(t *testing.T) {
	s := newTempStore(t)
	// Empty (no shots/ dir yet) is a clean empty list, not an error.
	if ids, err := s.ListShots(); err != nil || len(ids) != 0 {
		t.Fatalf("empty list: ids=%v err=%v", ids, err)
	}
	for _, id := range []string{"login", "checkout", "profile"} {
		body := strings.Replace(validShot, `"screenId":"checkout"`, `"screenId":"`+id+`"`, 1)
		if err := s.WriteShot(id, json.RawMessage(body)); err != nil {
			t.Fatalf("write %s: %v", id, err)
		}
	}
	ids, err := s.ListShots()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	want := []string{"checkout", "login", "profile"}
	if strings.Join(ids, ",") != strings.Join(want, ",") {
		t.Errorf("want %v sorted, got %v", want, ids)
	}
}

func TestShotDelete(t *testing.T) {
	s := newTempStore(t)
	if err := s.WriteShot("checkout", json.RawMessage(validShot)); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := s.DeleteShot("checkout"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := s.ReadShot("checkout"); !errors.Is(err, ErrNotFound) {
		t.Errorf("want ErrNotFound after delete, got %v", err)
	}
	if err := s.DeleteShot("checkout"); !errors.Is(err, ErrNotFound) {
		t.Errorf("delete absent: want ErrNotFound, got %v", err)
	}
}

func TestShotReadAbsentIsNotFound(t *testing.T) {
	s := newTempStore(t)
	if _, err := s.ReadShot("nope"); !errors.Is(err, ErrNotFound) {
		t.Errorf("want ErrNotFound, got %v", err)
	}
}

func TestShotScreenIDGuard(t *testing.T) {
	s := newTempStore(t)
	bad := []string{"", "..", "../escape", "a/b", `a\b`, "with.dot", "space id", strings.Repeat("x", 101)}
	for _, id := range bad {
		if err := s.WriteShot(id, json.RawMessage(validShot)); !errors.Is(err, ErrTraversal) {
			t.Errorf("WriteShot(%q): want ErrTraversal, got %v", id, err)
		}
		if _, err := s.ReadShot(id); !errors.Is(err, ErrTraversal) {
			t.Errorf("ReadShot(%q): want ErrTraversal, got %v", id, err)
		}
		if err := s.DeleteShot(id); !errors.Is(err, ErrTraversal) {
			t.Errorf("DeleteShot(%q): want ErrTraversal, got %v", id, err)
		}
	}
}

func TestShotWriteConfinedToShotsDir(t *testing.T) {
	s := newTempStore(t)
	if err := s.WriteShot("checkout", json.RawMessage(validShot)); err != nil {
		t.Fatalf("write: %v", err)
	}
	// Nothing escaped .specs/shots/.
	full := filepath.Join(s.Dir(), "shots", "checkout.shot.json")
	if _, err := os.Stat(full); err != nil {
		t.Errorf("shot not written to shots/ subdir: %v", err)
	}
}
