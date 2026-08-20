package store

import (
	"fmt"
	"sync"
	"testing"

	"github.com/google/uuid"
)

func TestListOfUnrecordedSessionIsEmptyNotNil(t *testing.T) {
	got := NewMemory[int]().List(uuid.New())
	if got == nil {
		t.Fatal("List returned nil; a Session with no History must encode as []")
	}
	if len(got) != 0 {
		t.Fatalf("List returned %d items, want 0", len(got))
	}
}

func TestListIsNewestFirst(t *testing.T) {
	m := NewMemory[int]()
	session := uuid.New()
	for i := range 3 {
		m.Record(session, i)
	}

	got := m.List(session)
	want := []int{2, 1, 0}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("List = %v, want %v", got, want)
	}
}

func TestSessionsDoNotSeeEachOther(t *testing.T) {
	m := NewMemory[int]()
	mine, theirs := uuid.New(), uuid.New()
	m.Record(mine, 1)

	if got := m.List(theirs); len(got) != 0 {
		t.Fatalf("other Session's History = %v, want empty", got)
	}
	if got := m.List(mine); len(got) != 1 || got[0] != 1 {
		t.Fatalf("own History = %v, want [1]", got)
	}
}

func TestRecordEvictsOldestCalculationBeyondMaxItems(t *testing.T) {
	m := NewMemory[int]()
	session := uuid.New()
	for i := range MaxItems + 1 {
		m.Record(session, i)
	}

	got := m.List(session)
	if len(got) != MaxItems {
		t.Fatalf("History holds %d Calculations, want %d", len(got), MaxItems)
	}
	if got[0] != MaxItems {
		t.Fatalf("newest = %d, want %d", got[0], MaxItems)
	}
	// The 51st Calculation evicts the 1st, so the oldest survivor is the 2nd.
	if oldest := got[len(got)-1]; oldest != 1 {
		t.Fatalf("oldest = %d, want 1 — the 1st Calculation should have been evicted", oldest)
	}
}

func TestRecordEvictsLeastRecentlyUsedSessionBeyondMaxSessions(t *testing.T) {
	m := NewMemory[int]()
	sessions := make([]uuid.UUID, MaxSessions)
	for i := range sessions {
		sessions[i] = uuid.New()
		m.Record(sessions[i], i)
	}
	// Reading the first Session makes the second the least recently used.
	if got := m.List(sessions[0]); len(got) != 1 {
		t.Fatalf("first Session's History = %v, want one Calculation", got)
	}

	newcomer := uuid.New()
	m.Record(newcomer, 100)

	if got := m.List(sessions[1]); len(got) != 0 {
		t.Fatalf("least recently used Session's History = %v, want it evicted", got)
	}
	if got := m.List(sessions[0]); len(got) != 1 {
		t.Fatalf("recently read Session's History = %v, want it retained", got)
	}
	if got := m.List(newcomer); len(got) != 1 {
		t.Fatalf("newest Session's History = %v, want one Calculation", got)
	}
}

func TestConcurrentWritesAcrossSessions(t *testing.T) {
	m := NewMemory[int]()
	const writers, perWriter = 8, 50

	sessions := make([]uuid.UUID, writers)
	for i := range sessions {
		sessions[i] = uuid.New()
	}

	var wg sync.WaitGroup
	for i, session := range sessions {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range perWriter {
				m.Record(session, i*perWriter+j)
				m.List(session)
				// A neighbour's History, to drive the recency list from more
				// than one goroutine at a time.
				m.List(sessions[(i+1)%writers])
			}
		}()
	}
	wg.Wait()

	for i, session := range sessions {
		got := m.List(session)
		if len(got) != MaxItems {
			t.Fatalf("session %d holds %d Calculations, want %d", i, len(got), MaxItems)
		}
		if want := i*perWriter + perWriter - 1; got[0] != want {
			t.Fatalf("session %d newest = %d, want %d", i, got[0], want)
		}
	}
}
