package zabbix

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"
)

type fakeCall struct {
	Method string
	Params map[string]any
}

type fakeAPI struct {
	mu     sync.Mutex
	calls  []fakeCall
	handle func(method string, params map[string]any) (json.RawMessage, error)
}

func (f *fakeAPI) Call(_ context.Context, method string, params map[string]any, _ time.Duration) (json.RawMessage, error) {
	f.mu.Lock()
	f.calls = append(f.calls, fakeCall{Method: method, Params: params})
	handle := f.handle
	f.mu.Unlock()
	if handle == nil {
		return json.RawMessage("[]"), nil
	}
	return handle(method, params)
}

func (f *fakeAPI) methods() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, len(f.calls))
	for i, call := range f.calls {
		out[i] = call.Method
	}
	return out
}

func mustJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestFetchHostInterfaceItemsFiltersKeyOnClient(t *testing.T) {
	api := &fakeAPI{handle: func(method string, params map[string]any) (json.RawMessage, error) {
		if method != "item.get" {
			t.Fatalf("método inesperado: %s", method)
		}
		return mustJSON(t, []map[string]string{
			{"itemid": "10", "key_": "vendor.metric.rx[10]", "name": "port-a", "hostid": "10001", "lastvalue": "1"},
			{"itemid": "11", "key_": "other.metric[10]", "name": "skip", "hostid": "10001", "lastvalue": "2"},
		}), nil
	}}
	entries, err := FetchHostInterfaceItems(context.Background(), api, []InterfaceHostRef{
		{HostKey: "host-a", HostID: "10001"},
	}, []string{"vendor.metric.rx"})
	if err != nil {
		t.Fatal(err)
	}
	if len(api.methods()) != 1 || api.methods()[0] != "item.get" {
		t.Fatalf("chamadas: %v", api.methods())
	}
	if len(entries) != 1 || len(entries[0].Items) != 1 || entries[0].Items[0].ItemID != "10" {
		t.Fatalf("entries: %+v", entries)
	}
}

func TestFetchHostInterfaceItemsResolvesHostByName(t *testing.T) {
	api := &fakeAPI{handle: func(method string, params map[string]any) (json.RawMessage, error) {
		if method == "host.get" {
			filter, _ := params["filter"].(map[string]any)
			if names, ok := filter["name"].([]string); ok && len(names) > 0 && names[0] == "host-a" {
				return mustJSON(t, []map[string]string{{"hostid": "10001"}}), nil
			}
			return mustJSON(t, []any{}), nil
		}
		if method == "item.get" {
			return mustJSON(t, []map[string]string{
				{"itemid": "10", "key_": "vendor.metric.rx[10]", "name": "port-a", "hostid": "10001", "lastvalue": "1"},
			}), nil
		}
		t.Fatalf("método inesperado: %s", method)
		return nil, nil
	}}
	entries, err := FetchHostInterfaceItems(context.Background(), api, []InterfaceHostRef{
		{HostKey: "host-a", HostID: ""},
	}, []string{"vendor.metric.rx"})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].HostID != "10001" || entries[0].Items[0].ItemID != "10" {
		t.Fatalf("entries: %+v", entries)
	}
	if api.methods()[len(api.methods())-1] != "item.get" {
		t.Fatalf("última chamada: %v", api.methods())
	}
}

func TestFetchHostInterfaceItemsSkipsItemGetWhenHostMissing(t *testing.T) {
	api := &fakeAPI{handle: func(method string, _ map[string]any) (json.RawMessage, error) {
		if method != "host.get" {
			t.Fatalf("não deveria chamar %s", method)
		}
		return mustJSON(t, []any{}), nil
	}}
	entries, err := FetchHostInterfaceItems(context.Background(), api, []InterfaceHostRef{
		{HostKey: "host-a", HostID: ""},
	}, []string{"vendor.metric.rx"})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("entries: %+v", entries)
	}
	for _, method := range api.methods() {
		if method == "item.get" {
			t.Fatal("item.get não deveria ser chamado")
		}
	}
}

func TestFetchItemNamesStopsAtFirstGroupWithNames(t *testing.T) {
	api := &fakeAPI{handle: func(method string, params map[string]any) (json.RawMessage, error) {
		if method == "hostgroup.get" {
			return mustJSON(t, []map[string]string{
				{"groupid": "1", "name": "Backbone"},
				{"groupid": "2", "name": "Borda"},
			}), nil
		}
		if method == "item.get" {
			groupids, _ := params["groupids"].([]string)
			if len(groupids) == 1 && groupids[0] == "1" {
				return mustJSON(t, []map[string]string{{"name": "Status item"}, {"name": "Status item"}}), nil
			}
			t.Fatalf("item.get inesperado: %+v", params)
		}
		t.Fatalf("método inesperado: %s", method)
		return nil, nil
	}}
	names, err := FetchItemNames(context.Background(), api, []string{"Backbone", "Borda"})
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 1 || names[0] != "Status item" {
		t.Fatalf("names: %v", names)
	}
	itemGets := 0
	for _, call := range api.calls {
		if call.Method == "item.get" {
			itemGets++
			monitored, _ := call.Params["monitored"].(bool)
			if !monitored {
				t.Fatal("item.get precisa de monitored: true")
			}
		}
	}
	if itemGets != 1 {
		t.Fatalf("item.get: %d", itemGets)
	}
}

func TestFetchHostGroupNamesListsUniqueNames(t *testing.T) {
	api := &fakeAPI{handle: func(method string, _ map[string]any) (json.RawMessage, error) {
		if method != "hostgroup.get" {
			t.Fatalf("método inesperado: %s", method)
		}
		return mustJSON(t, []map[string]string{
			{"groupid": "1", "name": "Borda"},
			{"groupid": "2", "name": "Backbone"},
			{"groupid": "3", "name": "Backbone"},
		}), nil
	}}
	names, err := FetchHostGroupNames(context.Background(), api)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 2 || names[0] != "Backbone" || names[1] != "Borda" {
		t.Fatalf("names: %v", names)
	}
}
