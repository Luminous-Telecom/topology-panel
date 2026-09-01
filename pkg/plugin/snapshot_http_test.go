package plugin

import (
	"context"
	"encoding/base64"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type resourceSender struct {
	status int
	body   []byte
}

func (s *resourceSender) Send(resp *backend.CallResourceResponse) error {
	if resp.Status != 0 {
		s.status = resp.Status
	}
	s.body = append(s.body, resp.Body...)
	return nil
}

func TestDecodeSnapshotKeyAcceptsLongGroupList(t *testing.T) {
	raw := make([]byte, 2000)
	for i := range raw {
		raw[i] = 'a'
	}
	encoded := base64.RawURLEncoding.EncodeToString(raw)
	decoded, ok := decodeSnapshotKey(encoded)
	if !ok || decoded != string(raw) {
		t.Fatalf("ok=%v len=%d", ok, len(decoded))
	}
}

func TestSnapshotPostWithoutMetadataLooksUp(t *testing.T) {
	h := New(t.TempDir())
	key := "ds\x00Backbone\x00icmpping"
	payload := []byte(`{"key":"YQ","savedAt":1,"metadata":{"hosts":[],"resolvedGroups":["Backbone"],"groupIds":["10"]},"knownStatusItems":[],"lastValues":{},"interfaceItems":[],"problems":{}}`)
	if !h.snapshots.put(key, payload) {
		t.Fatal("put")
	}
	encoded := base64.RawURLEncoding.EncodeToString([]byte(key))
	sender := &resourceSender{}
	err := h.ResourceHandler().CallResource(context.Background(), &backend.CallResourceRequest{
		Method: http.MethodPost,
		Path:   "snapshot",
		URL:    "/api/plugins/luminous-topology-panel/resources/snapshot",
		Body:   []byte(`{"key":"` + encoded + `"}`),
	}, sender)
	if err != nil {
		t.Fatal(err)
	}
	if sender.status != http.StatusOK {
		t.Fatalf("status %d body %s", sender.status, sender.body)
	}
	if string(sender.body) != string(payload) {
		t.Fatalf("body=%s", sender.body)
	}
}

func TestSnapshotPostWithoutMetadataLooksUpFromDisk(t *testing.T) {
	dir := t.TempDir()
	key := "ds\x00Backbone\x00icmpping"
	now := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	payload := []byte(`{"key":"YQ","savedAt":` + strconv.FormatInt(now.UnixMilli(), 10) + `,"metadata":{"hosts":[],"resolvedGroups":["Backbone"],"groupIds":["10"]},"knownStatusItems":[],"lastValues":{},"interfaceItems":[],"problems":{}}`)
	first := New(dir)
	first.snapshots.now = func() time.Time { return now }
	if !first.snapshots.put(key, payload) {
		t.Fatal("put")
	}
	second := New(dir)
	second.snapshots.now = func() time.Time { return now.Add(time.Minute) }
	encoded := base64.RawURLEncoding.EncodeToString([]byte(key))
	sender := &resourceSender{}
	err := second.ResourceHandler().CallResource(context.Background(), &backend.CallResourceRequest{
		Method: http.MethodPost,
		Path:   "snapshot",
		URL:    "/api/plugins/luminous-topology-panel/resources/snapshot",
		Body:   []byte(`{"key":"` + encoded + `"}`),
	}, sender)
	if err != nil {
		t.Fatal(err)
	}
	if sender.status != http.StatusOK {
		t.Fatalf("status %d body %s", sender.status, sender.body)
	}
	if string(sender.body) != string(payload) {
		t.Fatalf("body=%s", sender.body)
	}
}

func TestSnapshotPostFindsKeyLongerThanLegacyLimit(t *testing.T) {
	h := New(t.TempDir())
	rawKey := make([]byte, 600)
	for i := range rawKey {
		rawKey[i] = 'g'
	}
	key := string(rawKey)
	payload := []byte(`{"savedAt":1,"metadata":{"hosts":[],"resolvedGroups":["Backbone"],"groupIds":["10"]},"knownStatusItems":[]}`)
	if !h.snapshots.put(key, payload) {
		t.Fatal("put")
	}
	encoded := base64.RawURLEncoding.EncodeToString(rawKey)
	sender := &resourceSender{}
	err := h.ResourceHandler().CallResource(context.Background(), &backend.CallResourceRequest{
		Method: http.MethodPost,
		Path:   "snapshot",
		URL:    "/api/plugins/luminous-topology-panel/resources/snapshot",
		Body:   []byte(`{"key":"` + encoded + `"}`),
	}, sender)
	if err != nil {
		t.Fatal(err)
	}
	if sender.status != http.StatusOK {
		t.Fatalf("status %d body %s", sender.status, sender.body)
	}
}
