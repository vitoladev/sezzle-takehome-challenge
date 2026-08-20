// Package store holds each Session's History in memory, bounded in both
// directions: how much one Session accumulates, and how many Sessions are kept
// at all. It is generic over the recorded item so it stays free of the HTTP
// types — the generated Calculation lives in package httpapi, which imports
// this package.
//
// History is a convenience, not a ledger: it is never edited and does not
// survive a restart, so eviction loses nothing but convenience.
package store

import (
	"slices"
	"sync"

	"github.com/google/uuid"
)

const (
	// MaxItems is how many Calculations one Session's History holds before the
	// oldest is discarded.
	MaxItems = 50
	// MaxSessions is how many Sessions are kept before the least recently used
	// is discarded. Without it the Session map grows without limit: every fresh
	// tab is a new key that nothing would ever reclaim.
	MaxSessions = 100
)

// Store is the History of every Session, read and written by request
// goroutines.
type Store[T any] interface {
	// Record appends to the Session's History, creating the Session if this is
	// its first Calculation.
	Record(session uuid.UUID, item T)
	// List returns the Session's History newest first, and an empty — never
	// nil — slice for a Session that has recorded nothing.
	List(session uuid.UUID) []T
}

// Memory is the in-memory Store. The zero value is not usable; call NewMemory.
type Memory[T any] struct {
	mu        sync.Mutex
	histories map[uuid.UUID][]T // oldest first
	// recency is least recently used first, and holds exactly the keys of
	// histories. A linear scan is what a hundred Sessions costs.
	recency []uuid.UUID
}

func NewMemory[T any]() *Memory[T] {
	return &Memory[T]{histories: make(map[uuid.UUID][]T)}
}

var _ Store[int] = (*Memory[int])(nil)

func (m *Memory[T]) Record(session uuid.UUID, item T) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.touch(session)
	if len(m.recency) > MaxSessions {
		delete(m.histories, m.recency[0])
		m.recency = m.recency[1:]
	}

	items := m.histories[session]
	if len(items) < MaxItems {
		items = append(items, item)
	} else {
		// Shift rather than reslice: a reslice would leave the evicted item
		// reachable from the backing array, and a Result can be tens of
		// kilobytes.
		copy(items, items[1:])
		items[MaxItems-1] = item
	}
	m.histories[session] = items
}

func (m *Memory[T]) List(session uuid.UUID) []T {
	m.mu.Lock()
	defer m.mu.Unlock()

	items, ok := m.histories[session]
	if !ok {
		return []T{}
	}
	// Reading is using: a Session that only reads its History is still live and
	// must not be evicted ahead of one that has been idle since its last write.
	m.touch(session)

	newestFirst := make([]T, len(items))
	for i, item := range items {
		newestFirst[len(items)-1-i] = item
	}
	return newestFirst
}

// touch moves a Session to the most-recently-used end, appending it if it is
// new. Called with m.mu held.
func (m *Memory[T]) touch(session uuid.UUID) {
	if i := slices.Index(m.recency, session); i >= 0 {
		m.recency = append(slices.Delete(m.recency, i, i+1), session)
		return
	}
	m.recency = append(m.recency, session)
}
