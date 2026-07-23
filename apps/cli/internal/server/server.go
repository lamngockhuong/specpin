// Package server exposes the .specs/ store over a hardened localhost HTTP API:
// CRUD on specs, an SSE change stream, and a health check. It binds 127.0.0.1
// only, requires a bearer token, and accepts only extension Origins.
package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"specpin/internal/schema"
	"specpin/internal/store"
)

// Server wires the store, schema validator, and SSE hub into an http.Handler.
type Server struct {
	store     *store.Store
	validator *schema.Validator
	hub       *Hub
	token     string
	project   string
	version   string
}

// New constructs a Server. The token authenticates every request.
func New(st *store.Store, v *schema.Validator, hub *Hub, token, project, version string) *Server {
	return &Server{store: st, validator: v, hub: hub, token: token, project: project, version: version}
}

// Handler returns the fully wired http.Handler (cors -> auth -> routes).
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /specs", s.handleGetSpecs)
	mux.HandleFunc("POST /specs", s.handlePostSpec)
	mux.HandleFunc("PUT /specs/{id}", s.handlePutSpec)
	mux.HandleFunc("DELETE /specs/{id}", s.handleDeleteSpec)
	mux.HandleFunc("GET /views", s.handleGetViews)
	mux.HandleFunc("PUT /views", s.handlePutViews)
	mux.HandleFunc("GET /guides", s.handleGetGuides)
	mux.HandleFunc("PUT /guides", s.handlePutGuides)
	mux.HandleFunc("GET /flows", s.handleGetFlows)
	mux.HandleFunc("PUT /flows", s.handlePutFlows)
	mux.HandleFunc("GET /screens", s.handleGetScreens)
	mux.HandleFunc("PUT /screens", s.handlePutScreens)
	mux.HandleFunc("GET /events", s.handleEvents)
	return s.cors(s.auth(mux))
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, code string, errs []string) {
	writeJSON(w, status, map[string]any{"error": code, "details": errs})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"version": s.version,
		"project": s.project,
	})
}

func (s *Server) handleGetSpecs(w http.ResponseWriter, _ *http.Request) {
	bundle, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "load_failed", []string{err.Error()})
		return
	}
	// Optimistic-concurrency tag for the whole bundle. Clients echo it back as
	// If-Match on writes; a stale tag yields 409 instead of a silent clobber.
	w.Header().Set("ETag", store.ETagFor(bundle))
	writeJSON(w, http.StatusOK, bundle)
}

type postSpecBody struct {
	File string          `json:"file"`
	Spec json.RawMessage `json:"spec"`
}

func (s *Server) handlePostSpec(w http.ResponseWriter, r *http.Request) {
	var body postSpecBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", []string{err.Error()})
		return
	}
	if body.File == "" || len(body.Spec) == 0 {
		writeError(w, http.StatusBadRequest, "bad_request", []string{"file and spec are required"})
		return
	}
	if errs := s.validator.ValidateSpec(body.Spec); errs != nil {
		writeError(w, http.StatusBadRequest, "schema_invalid", errs)
		return
	}
	if err := s.store.SaveSpec(body.File, body.Spec, r.Header.Get("If-Match")); err != nil {
		writeWriteError(w, "save_failed", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"file": body.File, "spec": body.Spec})
}

func (s *Server) handlePutSpec(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var spec json.RawMessage
	if err := decodeBody(r, &spec); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", []string{err.Error()})
		return
	}
	if errs := s.validator.ValidateSpec(spec); errs != nil {
		writeError(w, http.StatusBadRequest, "schema_invalid", errs)
		return
	}
	if err := s.store.UpdateSpec(id, spec, r.Header.Get("If-Match")); err != nil {
		writeWriteError(w, "update_failed", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "spec": spec})
}

func (s *Server) handleDeleteSpec(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.store.DeleteSpec(id, r.Header.Get("If-Match")); err != nil {
		writeWriteError(w, "delete_failed", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleGetViews returns the team-default visibility config, or the empty default
// when .specs/views.json is absent (200, so clients need no 404 special-case).
func (s *Server) handleGetViews(w http.ResponseWriter, _ *http.Request) {
	raw, err := s.store.LoadViews()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "load_failed", []string{err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}

// handlePutViews validates and writes .specs/views.json (singleton, no {id}).
// Same bearer + extension-origin middleware as /specs; the dir watcher fires SSE
// on the write with no watcher change needed.
func (s *Server) handlePutViews(w http.ResponseWriter, r *http.Request) {
	var body json.RawMessage
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", []string{err.Error()})
		return
	}
	if errs := s.validator.ValidateViews(body); errs != nil {
		writeError(w, http.StatusBadRequest, "schema_invalid", errs)
		return
	}
	if err := s.store.SaveViews(body); err != nil {
		writeError(w, statusForStoreError(err), "save_failed", []string{err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, body)
}

// handleGetGuides returns the named-guides config, or the empty default when
// .specs/guides.json is absent (200, so clients need no 404 special-case).
func (s *Server) handleGetGuides(w http.ResponseWriter, _ *http.Request) {
	raw, err := s.store.LoadGuides()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "load_failed", []string{err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}

// handlePutGuides validates and writes .specs/guides.json (singleton, no {id};
// per-guide edits are whole-file read-modify-write PUTs). Same bearer +
// extension-origin middleware as /specs; the dir watcher fires SSE on the write.
func (s *Server) handlePutGuides(w http.ResponseWriter, r *http.Request) {
	var body json.RawMessage
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", []string{err.Error()})
		return
	}
	if errs := s.validator.ValidateGuides(body); errs != nil {
		writeError(w, http.StatusBadRequest, "schema_invalid", errs)
		return
	}
	if err := s.store.SaveGuides(body); err != nil {
		writeError(w, statusForStoreError(err), "save_failed", []string{err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, body)
}

// handleGetFlows returns the FSM flows config, or the empty default when
// .specs/flows.json is absent (200, so clients need no 404 special-case).
func (s *Server) handleGetFlows(w http.ResponseWriter, _ *http.Request) {
	raw, err := s.store.LoadFlows()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "load_failed", []string{err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}

// handlePutFlows validates and writes .specs/flows.json (singleton, no {id};
// per-flow edits are whole-file read-modify-write PUTs). Same bearer +
// extension-origin middleware as /specs; the dir watcher fires SSE on the write.
func (s *Server) handlePutFlows(w http.ResponseWriter, r *http.Request) {
	var body json.RawMessage
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", []string{err.Error()})
		return
	}
	if errs := s.validator.ValidateFlows(body); errs != nil {
		writeError(w, http.StatusBadRequest, "schema_invalid", errs)
		return
	}
	if err := s.store.SaveFlows(body); err != nil {
		writeError(w, statusForStoreError(err), "save_failed", []string{err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, body)
}

// handleGetScreens returns the screens/transitions graph config, or the empty
// default when .specs/screens.json is absent (200, so clients need no 404
// special-case).
func (s *Server) handleGetScreens(w http.ResponseWriter, _ *http.Request) {
	raw, err := s.store.LoadScreens()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "load_failed", []string{err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}

// handlePutScreens validates and writes .specs/screens.json (singleton, no
// {id}; per-screen edits are whole-file read-modify-write PUTs). Same bearer +
// extension-origin middleware as /specs; the dir watcher fires SSE on the write.
func (s *Server) handlePutScreens(w http.ResponseWriter, r *http.Request) {
	var body json.RawMessage
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", []string{err.Error()})
		return
	}
	if errs := s.validator.ValidateScreens(body); errs != nil {
		writeError(w, http.StatusBadRequest, "schema_invalid", errs)
		return
	}
	if err := s.store.SaveScreens(body); err != nil {
		writeError(w, statusForStoreError(err), "save_failed", []string{err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, body)
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ch, cancel := s.hub.Subscribe()
	defer cancel()

	// Heartbeat: a reverse proxy (nginx, Cloudflare Tunnel) idle-closes a stream
	// with no traffic. A periodic SSE comment keeps /events warm across an idle
	// repo. The interval sits below common proxy idle defaults (nginx 60s,
	// Cloudflare ~100s). The comment carries no `event:` line, so the client's
	// frame parser ignores it.
	ticker := time.NewTicker(sseHeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			_, _ = io.WriteString(w, ": ping\n\n")
			flusher.Flush()
		case payload, ok := <-ch:
			if !ok {
				return
			}
			_, _ = io.WriteString(w, "event: change\ndata: "+payload+"\n\n")
			flusher.Flush()
		}
	}
}

// sseHeartbeatInterval is how often /events emits a keepalive comment. Kept below
// common reverse-proxy idle timeouts (nginx 60s, Cloudflare ~100s). A var (not a
// const) only so tests can dial it down; nothing else reassigns it.
var sseHeartbeatInterval = 20 * time.Second

func decodeBody(r *http.Request, v any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	return dec.Decode(v)
}

// writeWriteError maps a spec-write store error to an HTTP response. A stale
// If-Match (ErrVersionMismatch) is the one case that gets its own code so the
// client can recognize it and reload rather than treat it as a generic failure.
func writeWriteError(w http.ResponseWriter, fallbackCode string, err error) {
	if errors.Is(err, store.ErrVersionMismatch) {
		writeError(w, http.StatusConflict, "version_mismatch", []string{err.Error()})
		return
	}
	writeError(w, statusForStoreError(err), fallbackCode, []string{err.Error()})
}

func statusForStoreError(err error) int {
	switch {
	case errors.Is(err, store.ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, store.ErrTraversal), errors.Is(err, store.ErrInvalidName):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}
