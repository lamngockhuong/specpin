// Package server exposes the .specs/ store over a hardened localhost HTTP API:
// CRUD on specs, an SSE change stream, and a health check. It binds 127.0.0.1
// only, requires a bearer token, and accepts only extension Origins.
package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

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
	if err := s.store.SaveSpec(body.File, body.Spec); err != nil {
		writeError(w, statusForStoreError(err), "save_failed", []string{err.Error()})
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
	if err := s.store.UpdateSpec(id, spec); err != nil {
		writeError(w, statusForStoreError(err), "update_failed", []string{err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "spec": spec})
}

func (s *Server) handleDeleteSpec(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.store.DeleteSpec(id); err != nil {
		writeError(w, statusForStoreError(err), "delete_failed", []string{err.Error()})
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

	for {
		select {
		case <-r.Context().Done():
			return
		case payload, ok := <-ch:
			if !ok {
				return
			}
			_, _ = io.WriteString(w, "event: change\ndata: "+payload+"\n\n")
			flusher.Flush()
		}
	}
}

func decodeBody(r *http.Request, v any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	return dec.Decode(v)
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
