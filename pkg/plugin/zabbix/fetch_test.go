package zabbix

import (
	"context"
	"encoding/json"
	"testing"
)

func TestFetchTrafficLastValuesByItemID(t *testing.T) {
	api := &fakeAPI{handle: func(method string, params map[string]any) (json.RawMessage, error) {
		if method != "item.get" {
			t.Fatalf("método inesperado: %s", method)
		}
		if _, ok := params["itemids"]; !ok {
			t.Fatalf("params: %+v", params)
		}
		return mustJSON(t, []map[string]string{
			{"itemid": "10", "key_": "vendor.metric.rx[10]", "hostid": "10001", "lastvalue": "500000000", "lastclock": "1700"},
		}), nil
	}}
	result, err := FetchTrafficLastValues(context.Background(), api, []string{"10", "vendor.metric.rx[10]"}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.LastValues["10"].LastValue != "500000000" {
		t.Fatalf("lastValues: %+v", result.LastValues)
	}
	if result.LastValues["10001:vendor.metric.rx[10]"].LastValue != "500000000" {
		t.Fatalf("scoped: %+v", result.LastValues)
	}
	if _, ok := result.LastValues["vendor.metric.rx[10]"]; ok {
		t.Fatal("chave sem hostid não deve indexar")
	}
	if result.ItemIDByKey["10001:vendor.metric.rx[10]"] != "10" {
		t.Fatalf("itemIdByKey: %+v", result.ItemIDByKey)
	}
}

func TestFetchTrafficLastValuesSkipsWithoutIDsOrKeys(t *testing.T) {
	api := &fakeAPI{}
	result, err := FetchTrafficLastValues(context.Background(), api, []string{"vendor.metric.rx[10]"}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(api.methods()) != 0 {
		t.Fatalf("chamadas: %v", api.methods())
	}
	if len(result.LastValues) != 0 {
		t.Fatalf("lastValues: %+v", result.LastValues)
	}
}

func TestFetchTrafficLastValuesByKeyWhenCableHasNoItemID(t *testing.T) {
	api := &fakeAPI{handle: func(method string, params map[string]any) (json.RawMessage, error) {
		filter, _ := params["filter"].(map[string]any)
		keys, _ := filter["key_"].([]string)
		if len(keys) != 1 || keys[0] != "vendor.metric.rx[10]" {
			t.Fatalf("filter: %+v", params)
		}
		return mustJSON(t, []map[string]string{
			{"itemid": "77", "key_": "vendor.metric.rx[10]", "hostid": "10001", "lastvalue": "42"},
		}), nil
	}}
	result, err := FetchTrafficLastValues(context.Background(), api, nil, []string{"vendor.metric.rx[10]"}, []string{"10001"})
	if err != nil {
		t.Fatal(err)
	}
	if result.LastValues["77"].LastValue != "42" {
		t.Fatalf("lastValues: %+v", result.LastValues)
	}
}

func TestFetchTrafficLastValuesPrefersItemIDsInOnePost(t *testing.T) {
	api := &fakeAPI{handle: func(method string, params map[string]any) (json.RawMessage, error) {
		if _, ok := params["itemids"]; !ok {
			t.Fatalf("esperava itemids: %+v", params)
		}
		if _, ok := params["filter"]; ok {
			t.Fatal("não mistura chave no mesmo item.get")
		}
		return mustJSON(t, []any{}), nil
	}}
	if _, err := FetchTrafficLastValues(context.Background(), api, []string{"10"}, []string{"vendor.metric.rx[10]"}, []string{"10001"}); err != nil {
		t.Fatal(err)
	}
	if len(api.methods()) != 1 {
		t.Fatalf("chamadas: %v", api.methods())
	}
}

func TestFetchStatusLastValuesUsesKeyFilter(t *testing.T) {
	api := &fakeAPI{handle: func(method string, params map[string]any) (json.RawMessage, error) {
		filter, _ := params["filter"].(map[string]any)
		if filter["key_"] != "icmpping" {
			t.Fatalf("filter: %+v", params)
		}
		return mustJSON(t, []map[string]string{
			{"itemid": "5", "key_": "icmpping", "name": "ICMP ping", "hostid": "1", "lastvalue": "1", "lastclock": "1700"},
		}), nil
	}}
	items, err := FetchStatusLastValues(context.Background(), api, "icmpping", []string{"1"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].LastValue != "1" {
		t.Fatalf("items: %+v", items)
	}
}

func TestFetchStatusLastValuesUsesNameWhenNotAKey(t *testing.T) {
	api := &fakeAPI{handle: func(method string, params map[string]any) (json.RawMessage, error) {
		filter, _ := params["filter"].(map[string]any)
		if filter["name"] != "ICMP ping" {
			t.Fatalf("filter: %+v", params)
		}
		return mustJSON(t, []any{}), nil
	}}
	if _, err := FetchStatusLastValues(context.Background(), api, "ICMP ping", []string{"1"}, nil); err != nil {
		t.Fatal(err)
	}
}

func TestFetchDirectMetadataResolvesGroupsAndHostsWithoutItemGet(t *testing.T) {
	api := &fakeAPI{handle: func(method string, params map[string]any) (json.RawMessage, error) {
		switch method {
		case "hostgroup.get":
			return mustJSON(t, []map[string]string{{"groupid": "10", "name": "Backbone"}}), nil
		case "host.get":
			return mustJSON(t, []map[string]any{
				{
					"hostid": "1", "host": "host-a", "name": "host-a",
					"interfaces": []map[string]string{{"ip": "10.0.0.1", "main": "1", "type": "1"}},
					"hostgroups": []map[string]string{{"name": "Backbone"}},
				},
			}), nil
		default:
			t.Fatalf("método inesperado: %s", method)
			return nil, nil
		}
	}}
	meta, err := FetchDirectMetadata(context.Background(), api, []string{"Backbone"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(meta.Hosts) != 1 || meta.Hosts[0].HostID != "1" || meta.Hosts[0].IP != "10.0.0.1" {
		t.Fatalf("meta: %+v", meta)
	}
	for _, method := range api.methods() {
		if method == "item.get" {
			t.Fatal("descoberta de hosts não chama item.get")
		}
	}
}

func TestFetchProblemsJoinsHostViaTriggerGet(t *testing.T) {
	api := &fakeAPI{handle: func(method string, params map[string]any) (json.RawMessage, error) {
		switch method {
		case "problem.get":
			return mustJSON(t, []map[string]string{
				{"eventid": "1", "objectid": "2001", "name": "Interface down", "severity": "4"},
			}), nil
		case "trigger.get":
			return mustJSON(t, []map[string]any{
				{"triggerid": "2001", "status": "0", "hosts": []map[string]string{{"hostid": "1001"}}},
			}), nil
		default:
			t.Fatalf("método inesperado: %s", method)
			return nil, nil
		}
	}}
	summary, err := FetchProblems(context.Background(), api, []string{"1001"}, []string{"10"})
	if err != nil {
		t.Fatal(err)
	}
	if summary["1001"].Count != 1 || summary["1001"].Names[0] != "Interface down" {
		t.Fatalf("summary: %+v", summary)
	}
}

func TestFetchProblemsSkipsDisabledTrigger(t *testing.T) {
	api := &fakeAPI{handle: func(method string, _ map[string]any) (json.RawMessage, error) {
		if method == "problem.get" {
			return mustJSON(t, []map[string]string{
				{"eventid": "1", "objectid": "2001", "name": "Interface down", "severity": "4"},
			}), nil
		}
		return mustJSON(t, []map[string]any{
			{"triggerid": "2001", "status": "1", "hosts": []map[string]string{{"hostid": "1001"}}},
		}), nil
	}}
	summary, err := FetchProblems(context.Background(), api, []string{"1001"}, []string{"10"})
	if err != nil {
		t.Fatal(err)
	}
	if len(summary) != 0 {
		t.Fatalf("summary: %+v", summary)
	}
}

func TestFetchProblemsSkipsTriggerGetWhenEmpty(t *testing.T) {
	api := &fakeAPI{handle: func(method string, _ map[string]any) (json.RawMessage, error) {
		if method != "problem.get" {
			t.Fatalf("método inesperado: %s", method)
		}
		return mustJSON(t, []any{}), nil
	}}
	summary, err := FetchProblems(context.Background(), api, []string{"1001"}, []string{"10"})
	if err != nil {
		t.Fatal(err)
	}
	if len(summary) != 0 {
		t.Fatalf("summary: %+v", summary)
	}
	if len(api.methods()) != 1 {
		t.Fatalf("chamadas: %v", api.methods())
	}
}
