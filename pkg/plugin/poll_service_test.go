package plugin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Luminous-Telecom/topology-panel/pkg/plugin/zabbix"
)

func TestPollSkipsZabbixWhenSnapshotIsStillWarm(t *testing.T) {
	dir := t.TempDir()
	h := New(dir)
	key := "ds\x00Backbone\x00icmpping"
	now := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	snap := zabbix.LiveSnapshot{
		SavedAt: now.UnixMilli(),
		Metadata: zabbix.DirectMetadata{
			Hosts: []zabbix.DirectHost{
				{HostID: "1", Host: "host-1", Name: "host-1", Groups: []string{"Backbone"}},
			},
			ResolvedGroups: []string{"Backbone"},
			GroupIDs:       []string{"10"},
		},
		KnownStatusItems: []zabbix.InterfaceItem{
			{ItemID: "10001", Key: "icmpping", LastValue: "1", HostID: "1"},
		},
		LastValues: map[string]zabbix.ItemLastValue{
			"10001": {ItemID: "10001", LastValue: "1"},
		},
		InterfaceItems: []zabbix.InterfaceItem{},
		Problems:       zabbix.HostProblemsMap{},
	}
	payload, err := json.Marshal(snap)
	if err != nil {
		t.Fatal(err)
	}
	h.snapshots.now = func() time.Time { return now }
	if !h.snapshots.put(key, payload) {
		t.Fatal("put snapshot")
	}
	session := h.poll.loadSession(key)
	if !sessionReady(session) {
		t.Fatalf("session not ready: hosts=%d items=%d savedAt=%d", len(session.metadata.Hosts), len(session.knownStatusItems), session.savedAt)
	}

	req := httptest.NewRequest(http.MethodPost, "/poll", nil)
	req = req.WithContext(context.Background())
	resp := h.poll.Handle(req.Context(), req, PollRequest{
		DatasourceUID: "ds",
		GroupNames:    []string{"Backbone"},
		StatusItemKey: "icmpping",
		RefreshSec:    60,
	})
	if !resp.Ready {
		t.Fatalf("expected ready snapshot, got %+v", resp)
	}
	if len(resp.Snapshot.Metadata.ResolvedGroups) != 1 {
		t.Fatalf("metadata: %+v", resp.Snapshot.Metadata)
	}
}

func TestPollFetchesZabbixWhenSnapshotMissing(t *testing.T) {
	dir := t.TempDir()
	h := New(dir)
	req := httptest.NewRequest(http.MethodPost, "/poll", nil)
	req = req.WithContext(context.Background())
	resp := h.poll.Handle(req.Context(), req, PollRequest{
		DatasourceUID: "ds",
		GroupNames:    []string{"Backbone"},
		StatusItemKey: "icmpping",
		RefreshSec:    60,
	})
	if resp.Error == "" {
		t.Fatalf("expected error without datasource context, got %+v", resp)
	}
}
