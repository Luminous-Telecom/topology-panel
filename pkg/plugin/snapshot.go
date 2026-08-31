package plugin

import (
	"sync"
	"time"
)

const (
	snapshotTTL      = 15 * time.Minute
	snapshotMaxItems = 32
	snapshotMaxBytes = 2 << 20
)

type snapshotEntry struct {
	savedAt time.Time
	body    []byte
}

type snapshotCache struct {
	mu      sync.Mutex
	entries map[string]snapshotEntry
	now     func() time.Time
}

func newSnapshotCache() *snapshotCache {
	return &snapshotCache{
		entries: make(map[string]snapshotEntry),
		now:     time.Now,
	}
}

func (c *snapshotCache) get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[key]
	if !ok {
		return nil, false
	}
	if c.now().Sub(entry.savedAt) > snapshotTTL {
		delete(c.entries, key)
		return nil, false
	}
	return entry.body, true
}

func (c *snapshotCache) put(key string, body []byte) bool {
	if key == "" || len(body) == 0 || len(body) > snapshotMaxBytes {
		return false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= snapshotMaxItems {
		if _, exists := c.entries[key]; !exists {
			c.evictOldestLocked()
		}
	}
	c.entries[key] = snapshotEntry{savedAt: c.now(), body: append([]byte(nil), body...)}
	return true
}

func (c *snapshotCache) evictOldestLocked() {
	var oldestKey string
	var oldestTime time.Time
	first := true
	for key, entry := range c.entries {
		if first || entry.savedAt.Before(oldestTime) {
			oldestKey = key
			oldestTime = entry.savedAt
			first = false
		}
	}
	if oldestKey != "" {
		delete(c.entries, oldestKey)
	}
}
