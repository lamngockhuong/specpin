package server

import (
	"crypto/subtle"
	"net/http"
	"strings"
)

// extensionOriginSchemes are the only Origins allowed to call the sidecar.
// Web origins (http/https) are rejected; this is the CSRF guard for localhost.
var extensionOriginSchemes = []string{
	"chrome-extension://",
	"moz-extension://",
	"safari-web-extension://",
}

func isAllowedOrigin(origin string) bool {
	for _, scheme := range extensionOriginSchemes {
		if strings.HasPrefix(origin, scheme) {
			return true
		}
	}
	return false
}

// cors enforces the extension-origin policy and answers preflight requests.
// A request with no Origin (e.g. curl, the CLI's own health check) is allowed;
// a request with a non-extension Origin is rejected 403.
func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if !isAllowedOrigin(origin) {
				http.Error(w, "forbidden origin", http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			// If-Match carries the optimistic-concurrency precondition on writes;
			// it is not a CORS-safelisted request header, so a cross-origin (remote)
			// PUT/POST/DELETE needs it allowed here or the preflight fails.
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			// ETag is not a CORS-safelisted response header, so JS on a cross-origin
			// fetch cannot read it unless it is explicitly exposed. The client needs
			// it to send If-Match on the next write.
			w.Header().Set("Access-Control-Expose-Headers", "ETag")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// auth requires a matching bearer token on every request (constant-time compare).
func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		const prefix = "Bearer "
		if !strings.HasPrefix(header, prefix) {
			http.Error(w, "missing bearer token", http.StatusUnauthorized)
			return
		}
		got := strings.TrimPrefix(header, prefix)
		if subtle.ConstantTimeCompare([]byte(got), []byte(s.token)) != 1 {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
