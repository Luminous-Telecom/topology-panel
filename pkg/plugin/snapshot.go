package plugin

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	snapshotTTL      = 15 * time.Minute
	snapshotDiskTTL  = 7 * 24 * time.Hour
	snapshotMaxItems = 32
	snapshotMaxBytes = 8 << 20
	snapshotMaxKey   = 8192
)

type snapshotEntry struct {
	savedAt time.Time
	body    []byte
}

type snapshotCache struct {
	mu      sync.Mutex
	entries map[string]snapshotEntry
	now     func() time.Time
	dir     string
}

func newSnapshotCache(pluginDir string) *snapshotCache {
	dir := ""
	if pluginDir != "" {
		dir = filepath.Join(pluginDir, "snapshots")
	}
	return &snapshotCache{
		entries: make(map[string]snapshotEntry),
		now:     time.Now,
		dir:     dir,
	}
}

func (c *snapshotCache) get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if body, ok := c.getFromRAMLocked(key); ok {
		return body, true
	}
	if c.dir == "" {
		return nil, false
	}
	body, savedAt, ok := c.readDiskLocked(key)
	if !ok {
		return nil, false
	}
	if c.now().Sub(savedAt) > snapshotDiskTTL {
		c.removeDiskLocked(key)
		return nil, false
	}
	c.entries[key] = snapshotEntry{savedAt: c.now(), body: body}
	return body, true
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
	if c.dir != "" {
		_ = c.writeDiskLocked(key, body)
	}
	return true
}

func (c *snapshotCache) getFromRAMLocked(key string) ([]byte, bool) {
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

func snapshotSavedAt(body []byte, fallback time.Time) time.Time {
	var envelope struct {
		SavedAt int64 `json:"savedAt"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil || envelope.SavedAt <= 0 {
		return fallback
	}
	return time.UnixMilli(envelope.SavedAt)
}

func (c *snapshotCache) diskPath(key string) string {
	sum := sha256.Sum256([]byte(key))
	return filepath.Join(c.dir, hex.EncodeToString(sum[:])+".snap")
}

func (c *snapshotCache) readDiskLocked(key string) ([]byte, time.Time, bool) {
	path := c.diskPath(key)
	raw, err := os.ReadFile(path)
	if err != nil || len(raw) == 0 || len(raw) > snapshotMaxBytes {
		return nil, time.Time{}, false
	}
	savedAt := snapshotSavedAt(raw, time.Time{})
	if savedAt.IsZero() {
		if info, statErr := os.Stat(path); statErr == nil {
			savedAt = info.ModTime()
		}
	}
	if savedAt.IsZero() {
		return nil, time.Time{}, false
	}
	return append([]byte(nil), raw...), savedAt, true
}

func (c *snapshotCache) writeDiskLocked(key string, body []byte) error {
	if err := os.MkdirAll(c.dir, 0o750); err != nil {
		return err
	}
	path := c.diskPath(key)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, body, 0o640); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (c *snapshotCache) removeDiskLocked(key string) {
	_ = os.Remove(c.diskPath(key))
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
		c.removeDiskLocked(oldestKey)
	}
}
