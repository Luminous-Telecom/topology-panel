package zabbix

import (
	"context"
	"encoding/json"
	"testing"
)

func TestRunPingReadsIcmpLastvalue(t *testing.T) {
	api := &fakeAPI{handle: func(method string, _ map[string]any) (json.RawMessage, error) {
		switch method {
		case "host.get":
			return mustJSON(t, []map[string]string{{"hostid": "1"}}), nil
		case "script.get":
			return mustJSON(t, []map[string]string{{"scriptid": "9", "name": "Ping rápido"}}), nil
		case "script.execute":
			return mustJSON(t, map[string]string{"response": "success", "value": "64 bytes"}), nil
		case "item.get":
			return mustJSON(t, []map[string]string{
				{"itemid": "p", "key_": "icmpping", "lastvalue": "0", "lastclock": "2000", "value_type": "3"},
				{"itemid": "s", "key_": "icmppingsec", "lastvalue": "0", "lastclock": "2000", "value_type": "0"},
			}), nil
		default:
			t.Fatalf("método inesperado: %s", method)
			return nil, nil
		}
	}}
	result := RunPing(context.Background(), api, "ds-icmp", "sw-core", "panel")
	if !result.Success || result.Output != "64 bytes" {
		t.Fatalf("script: %+v", result)
	}
	if result.ICMP == nil || result.ICMP.Reachable == nil || *result.ICMP.Reachable {
		t.Fatalf("icmp reachable: %+v", result.ICMP)
	}
	if result.ICMP.RttMs == nil || *result.ICMP.RttMs != 0 {
		t.Fatalf("rtt: %+v", result.ICMP.RttMs)
	}
	if result.ICMP.LastClock == nil || *result.ICMP.LastClock != 2000 {
		t.Fatalf("clock: %+v", result.ICMP.LastClock)
	}
}

func TestRunPingHostMissing(t *testing.T) {
	api := &fakeAPI{handle: func(method string, _ map[string]any) (json.RawMessage, error) {
		return json.RawMessage("[]"), nil
	}}
	result := RunPing(context.Background(), api, "ds-missing", "host-a", "panel")
	if result.Success || result.Error == "" {
		t.Fatalf("esperado erro de host: %+v", result)
	}
}
