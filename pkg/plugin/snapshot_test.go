package plugin

import (
	"strconv"
	"testing"
	"time"
)

func TestSnapshotCacheTTLAndEvict(t *testing.T) {
	cache := newSnapshotCache("")
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

func TestSnapshotDiskSurvivesNewCache(t *testing.T) {
	dir := t.TempDir()
	key := "ds\x00Backbone\x00icmpping"
	now := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	payload := []byte(`{"savedAt":` + formatUnixMilli(now) + `,"metadata":{"hosts":[],"resolvedGroups":["Backbone"],"groupIds":["10"]},"knownStatusItems":[],"lastValues":{},"interfaceItems":[],"problems":{}}`)

	first := newSnapshotCache(dir)
	first.now = func() time.Time { return now }
	if !first.put(key, payload) {
		t.Fatal("put")
	}

	second := newSnapshotCache(dir)
	second.now = func() time.Time { return now.Add(time.Minute) }
	got, ok := second.get(key)
	if !ok || string(got) != string(payload) {
		t.Fatalf("disk miss ok=%v body=%s", ok, got)
	}
}

func formatUnixMilli(t time.Time) string {
	return strconv.FormatInt(t.UnixMilli(), 10)
}
