package plugin

import (
	"testing"
	"time"
)

func TestSnapshotCacheTTLAndEvict(t *testing.T) {
	cache := newSnapshotCache()
	now := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	cache.now = func() time.Time { return now }

	if !cache.put("a", []byte(`{"ok":true}`)) {
		t.Fatal("put a")
	}
	if _, ok := cache.get("a"); !ok {
		t.Fatal("get a")
	}
	cache.now = func() time.Time { return now.Add(snapshotTTL + time.Second) }
	if _, ok := cache.get("a"); ok {
		t.Fatal("ttl deveria expirar")
	}

	cache.now = func() time.Time { return now }
	for i := 0; i < snapshotMaxItems+2; i++ {
		key := string(rune('A' + i))
		if !cache.put(key, []byte(`{"i":`+key+`}`)) && i < snapshotMaxItems {
			t.Fatalf("put %s", key)
		}
	}
	if len(cache.entries) > snapshotMaxItems {
		t.Fatalf("passou do teto: %d", len(cache.entries))
	}
	if cache.put("", []byte(`x`)) || cache.put("big", make([]byte, snapshotMaxBytes+1)) {
		t.Fatal("recusa chave vazia e payload grande")
	}
}
