package server

import "sync"

// Hub is a minimal fan-out for Server-Sent Events. Each subscriber gets its own
// buffered channel; slow or disconnected clients are dropped without blocking
// the broadcaster.
type Hub struct {
	mu          sync.RWMutex
	subscribers map[chan string]struct{}
}

// NewHub creates an empty Hub.
func NewHub() *Hub {
	return &Hub{subscribers: make(map[chan string]struct{})}
}

// Subscribe registers a new subscriber and returns its channel plus an
// unsubscribe function that closes and deregisters it.
func (h *Hub) Subscribe() (<-chan string, func()) {
	ch := make(chan string, 8)
	h.mu.Lock()
	h.subscribers[ch] = struct{}{}
	h.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			h.mu.Lock()
			delete(h.subscribers, ch)
			h.mu.Unlock()
			close(ch)
		})
	}
	return ch, cancel
}

// Broadcast delivers a payload to all current subscribers, skipping any whose
// buffer is full (non-blocking send).
func (h *Hub) Broadcast(payload string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subscribers {
		select {
		case ch <- payload:
		default:
		}
	}
}

// Count returns the number of active subscribers (used in tests).
func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subscribers)
}
