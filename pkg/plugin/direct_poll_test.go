package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type recordedCall struct {
	Method string
	Params map[string]any
}

type fakeZabbix struct {
	mu      sync.Mutex
	calls   []recordedCall
	handle  func(method string, params map[string]any) (any, error)
	hold    chan struct{}
	started chan string
}

func (f *fakeZabbix) Call(_ context.Context, _ grafanaSession, _ string, method string, params map[string]any) (json.RawMessage, error) {
	f.mu.Lock()
	f.calls = append(f.calls, recordedCall{Method: method, Params: params})
	f.mu.Unlock()
	if method != "hostgroup.get" && f.started != nil {
		select {
		case f.started <- method:
		default:
		}
	}
	if method != "hostgroup.get" && f.hold != nil {
		<-f.hold
	}
	if f.handle == nil {
		return nil, fmt.Errorf("método inesperado: %s", method)
	}
	out, err := f.handle(method, params)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(out)
	return raw, err
}

func (f *fakeZabbix) methods() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, len(f.calls))
	for i, call := range f.calls {
		out[i] = call.Method
	}
	return out
}

func (f *fakeZabbix) itemIDBatches() [][]string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var batches [][]string
	for _, call := range f.calls {
		if call.Method != "item.get" {
			continue
		}
		raw, ok := call.Params["itemids"]
		if !ok {
			continue
		}
		batch := asStringSlice(raw)
		batches = append(batches, batch)
	}
	return batches
}

func asStringSlice(raw any) []string {
	switch v := raw.(type) {
	case []string:
		return v
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			out = append(out, asItemString(item))
		}
		return out
	default:
		return nil
	}
}

func ptr[T any](v T) *T { return &v }

func onlineMappings() []statusValueMapping {
	zero := 0.0
	return []statusValueMapping{
		{Value: &zero, Status: "offline"},
		{From: &zero, Status: "online"},
	}
}

func previousSnapshot() liveSnapshot {
	return liveSnapshot{
		SavedAt: 1,
		Metadata: zabbixDirectMetadata{
			Hosts:          []zabbixDirectHost{{HostID: "1", Host: "host-1", Name: "host-1", Groups: []string{"Backbone"}}},
			ResolvedGroups: []string{"Backbone"},
			GroupIDs:       []string{"10"},
		},
		KnownStatusItems: []interfaceItem{{ItemID: "10001", Key: "icmpping", LastValue: "1", HostID: "1"}},
		LastValues:       map[string]itemLastValue{"10001": {ItemID: "10001", LastValue: "1", LastClock: "10"}},
		InterfaceItems:   []interfaceItem{},
		Problems:         map[string]problemSummary{},
	}
}

func TestStatusItemSearch(t *testing.T) {
	key, name := statusItemSearch("icmpping")
	if key != "icmpping" || name != "" {
		t.Fatalf("identificador: key=%q name=%q", key, name)
	}
	key, name = statusItemSearch("ICMP ping")
	if key != "" || name != "ICMP ping" {
		t.Fatalf("texto livre: key=%q name=%q", key, name)
	}
}

func TestParseProblemsIgnoraSeveridadeAbaixoDeWarning(t *testing.T) {
	summary := parseProblems([]map[string]any{
		{"name": "link down", "severity": 4.0, "hostid": "1001", "objectid": "9"},
		{"name": "info", "severity": 1.0, "hostid": "1001", "objectid": "8"},
	}, []string{"1001"})
	if summary["1001"].Count != 1 || summary["1001"].MaxSeverity != 4 {
		t.Fatalf("resumo: %+v", summary["1001"])
	}
	if len(summary["1001"].Names) != 1 || summary["1001"].Names[0] != "link down" {
		t.Fatalf("nomes: %v", summary["1001"].Names)
	}
}

func TestParseProblemsSemHostidsGuardaTodos(t *testing.T) {
	summary := parseProblems([]map[string]any{
		{"name": "link down", "severity": 4.0, "hostid": "1001", "objectid": "9"},
	}, nil)
	if summary["1001"].Count != 1 {
		t.Fatalf("resumo: %+v", summary["1001"])
	}
}

func TestFetchProblemsNaoChamaTriggerQuandoHostidVeio(t *testing.T) {
	fake := &fakeZabbix{handle: func(method string, params map[string]any) (any, error) {
		if method == "problem.get" {
			if _, ok := params["selectHosts"]; ok {
				t.Fatal("problem.get não pode enviar selectHosts")
			}
			if fmt.Sprint(params["hostids"]) != fmt.Sprint([]string{"1001"}) && fmt.Sprint(asStringSlice(params["hostids"])) != fmt.Sprint([]string{"1001"}) {
				t.Fatalf("hostids: %#v", params["hostids"])
			}
			return []map[string]any{{"name": "link down", "severity": 4, "hostid": "1001", "objectid": "9"}}, nil
		}
		return nil, fmt.Errorf("%s", method)
	}}
	summary, err := fetchProblems(context.Background(), fake.Call, grafanaSession{}, "ds", []string{"1001"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := fake.methods(); len(got) != 1 || got[0] != "problem.get" {
		t.Fatalf("métodos: %v", got)
	}
	if summary["1001"].Count != 1 {
		t.Fatalf("resumo: %+v", summary["1001"])
	}
}

func TestFetchProblemsBuscaHostNoEventGet(t *testing.T) {
	fake := &fakeZabbix{handle: func(method string, params map[string]any) (any, error) {
		switch method {
		case "problem.get":
			if _, ok := params["selectHosts"]; ok {
				t.Fatal("problem.get não pode enviar selectHosts")
			}
			return []map[string]any{{"name": "link down", "severity": 4, "objectid": "9", "eventid": "99"}}, nil
		case "event.get":
			if fmt.Sprint(asStringSlice(params["selectHosts"])) != fmt.Sprint([]string{"hostid"}) {
				t.Fatalf("selectHosts: %#v", params["selectHosts"])
			}
			return []map[string]any{{"eventid": "99", "hosts": []map[string]any{{"hostid": "1001"}}}}, nil
		default:
			return nil, fmt.Errorf("%s", method)
		}
	}}
	summary, err := fetchProblems(context.Background(), fake.Call, grafanaSession{}, "ds", nil, []string{"10"})
	if err != nil {
		t.Fatal(err)
	}
	if got := fake.methods(); fmt.Sprint(got) != fmt.Sprint([]string{"problem.get", "event.get"}) {
		t.Fatalf("métodos: %v", got)
	}
	if summary["1001"].Count != 1 {
		t.Fatalf("resumo: %+v", summary["1001"])
	}
}

func TestFetchProblemsCaiNoTriggerGetSeEventoSemHost(t *testing.T) {
	fake := &fakeZabbix{handle: func(method string, _ map[string]any) (any, error) {
		switch method {
		case "problem.get":
			return []map[string]any{{"name": "link down", "severity": 4, "objectid": "9", "eventid": "99"}}, nil
		case "event.get":
			return []map[string]any{{"eventid": "99"}}, nil
		case "trigger.get":
			return []map[string]any{{"triggerid": "9", "status": 0, "hosts": []map[string]any{{"hostid": "1001"}}}}, nil
		default:
			return nil, fmt.Errorf("%s", method)
		}
	}}
	summary, err := fetchProblems(context.Background(), fake.Call, grafanaSession{}, "ds", nil, []string{"10"})
	if err != nil {
		t.Fatal(err)
	}
	if got := fake.methods(); fmt.Sprint(got) != fmt.Sprint([]string{"problem.get", "event.get", "trigger.get"}) {
		t.Fatalf("métodos: %v", got)
	}
	if summary["1001"].Count != 1 {
		t.Fatalf("resumo: %+v", summary["1001"])
	}
}

func TestFetchProblemsUsaGroupidsQuandoNaoHaHostids(t *testing.T) {
	var params map[string]any
	fake := &fakeZabbix{handle: func(method string, next map[string]any) (any, error) {
		if method == "problem.get" {
			params = next
			return []map[string]any{{"name": "link down", "severity": 4, "hostid": "1001", "objectid": "9"}}, nil
		}
		return nil, fmt.Errorf("%s", method)
	}}
	summary, err := fetchProblems(context.Background(), fake.Call, grafanaSession{}, "ds", nil, []string{"10"})
	if err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(asStringSlice(params["groupids"])) != fmt.Sprint([]string{"10"}) {
		t.Fatalf("groupids: %#v", params["groupids"])
	}
	if _, ok := params["hostids"]; ok {
		t.Fatal("não deveria enviar hostids")
	}
	if summary["1001"].Count != 1 {
		t.Fatalf("resumo: %+v", summary["1001"])
	}
}

func TestFetchDirectMetadataCasaGrupoSemDistinguirMaiusculas(t *testing.T) {
	fake := &fakeZabbix{handle: func(method string, _ map[string]any) (any, error) {
		switch method {
		case "hostgroup.get":
			return []map[string]any{{"groupid": "10", "name": "backbone"}}, nil
		case "host.get":
			return []map[string]any{{
				"hostid":     "1",
				"host":       "host-a",
				"name":       "host-a",
				"hostgroups": []map[string]any{{"name": "backbone"}},
				"interfaces": []map[string]any{{"ip": "10.0.0.1", "main": "1"}},
			}}, nil
		default:
			return nil, fmt.Errorf("%s", method)
		}
	}}
	meta, err := fetchDirectMetadata(context.Background(), fake.Call, grafanaSession{}, "ds", []string{"Backbone"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(meta.ResolvedGroups) != fmt.Sprint([]string{"Backbone"}) {
		t.Fatalf("grupos: %v", meta.ResolvedGroups)
	}
	if len(meta.Hosts) != 1 || fmt.Sprint(meta.Hosts[0].Groups) != fmt.Sprint([]string{"Backbone"}) {
		t.Fatalf("hosts: %+v", meta.Hosts)
	}
	if meta.Hosts[0].IP != "10.0.0.1" {
		t.Fatalf("ip: %s", meta.Hosts[0].IP)
	}
}

func TestFetchStatusLastValuesGuardaZero(t *testing.T) {
	fake := &fakeZabbix{handle: func(method string, _ map[string]any) (any, error) {
		if method != "item.get" {
			return nil, fmt.Errorf("%s", method)
		}
		return []map[string]any{{"itemid": "10", "key_": "icmpping", "hostid": "10001", "lastvalue": 0, "lastclock": 1700}}, nil
	}}
	items, err := fetchStatusLastValues(context.Background(), fake.Call, grafanaSession{}, "ds", "icmpping", []string{"10001"}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].LastValue != "0" || items[0].LastClock != "1700" {
		t.Fatalf("itens: %+v", items)
	}
}

func TestFetchTrafficLastValuesParteItemidsEmLotes(t *testing.T) {
	ids := make([]string, zabbixItemGetBatch+1)
	for i := range ids {
		ids[i] = fmt.Sprintf("%d", 10000+i)
	}
	fake := &fakeZabbix{handle: func(method string, params map[string]any) (any, error) {
		if method != "item.get" {
			return nil, fmt.Errorf("%s", method)
		}
		batch := asStringSlice(params["itemids"])
		rows := make([]map[string]any, 0, len(batch))
		for _, itemid := range batch {
			rows = append(rows, map[string]any{"itemid": itemid, "key_": "vendor.metric.rx[10]", "hostid": "1", "lastvalue": "1"})
		}
		return rows, nil
	}}
	fetched, err := fetchTrafficLastValues(context.Background(), fake.Call, grafanaSession{}, "ds", ids, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	batches := fake.itemIDBatches()
	if len(batches) != 2 {
		t.Fatalf("lotes: %d", len(batches))
	}
	if len(batches[0]) != zabbixItemGetBatch {
		t.Fatalf("primeiro lote: %d", len(batches[0]))
	}
	if fetched.LastValues[ids[0]].LastValue != "1" || fetched.LastValues[ids[len(ids)-1]].LastValue != "1" {
		t.Fatalf("lastvalues: %+v", fetched.LastValues)
	}
}

func TestPollEmRegimeFazItemGetPorIds(t *testing.T) {
	fake := &fakeZabbix{handle: func(method string, _ map[string]any) (any, error) {
		if method != "item.get" {
			return nil, fmt.Errorf("%s", method)
		}
		return []map[string]any{{"itemid": "10001", "key_": "icmpping", "hostid": "1", "lastvalue": "0", "lastclock": "20"}}, nil
	}}
	snap, err := runZabbixPoll(context.Background(), fake.Call, grafanaSession{}, pollInput{
		DatasourceUID: "ds",
		GroupNames:    []string{"Backbone"},
		StatusItemKey: "icmpping",
		Previous:      previousSnapshot(),
	}, time.Now)
	if err != "" {
		t.Fatalf("erro: %s", err)
	}
	if got := fake.methods(); fmt.Sprint(got) != fmt.Sprint([]string{"item.get"}) {
		t.Fatalf("métodos: %v", got)
	}
	if snap.LastValues["10001"].LastValue != "0" {
		t.Fatalf("lastvalue: %+v", snap.LastValues["10001"])
	}
	if snap.KnownStatusItems[0].LastValue != "0" {
		t.Fatalf("status: %+v", snap.KnownStatusItems[0])
	}
}

func TestPollEmRegimeNaoRedescobreSemItemDeStatus(t *testing.T) {
	fake := &fakeZabbix{handle: func(method string, _ map[string]any) (any, error) {
		if method != "item.get" {
			return nil, fmt.Errorf("%s", method)
		}
		return []map[string]any{{"itemid": "10001", "key_": "icmpping", "hostid": "1", "lastvalue": "1", "lastclock": "20"}}, nil
	}}
	prev := previousSnapshot()
	prev.Metadata.Hosts = append(prev.Metadata.Hosts, zabbixDirectHost{HostID: "2", Host: "host-2", Name: "host-2", Groups: []string{"Backbone"}})
	snap, err := runZabbixPoll(context.Background(), fake.Call, grafanaSession{}, pollInput{
		DatasourceUID: "ds",
		GroupNames:    []string{"Backbone"},
		StatusItemKey: "icmpping",
		Previous:      prev,
	}, time.Now)
	if err != "" {
		t.Fatalf("erro: %s", err)
	}
	if got := fake.methods(); fmt.Sprint(got) != fmt.Sprint([]string{"item.get"}) {
		t.Fatalf("métodos: %v", got)
	}
	if snap.LastValues["10001"].LastValue != "1" {
		t.Fatalf("lastvalue: %+v", snap.LastValues["10001"])
	}
}

func TestPollDescobertaErroSeGrupoNaoExiste(t *testing.T) {
	fake := &fakeZabbix{handle: func(method string, _ map[string]any) (any, error) {
		if method == "hostgroup.get" {
			return []map[string]any{{"groupid": "10", "name": "Backbone"}}, nil
		}
		return nil, fmt.Errorf("%s", method)
	}}
	snap, err := runZabbixPoll(context.Background(), fake.Call, grafanaSession{}, pollInput{
		DatasourceUID: "ds",
		GroupNames:    []string{"Inexistente"},
		StatusItemKey: "icmpping",
	}, time.Now)
	if err != zabbixNoGroupsError {
		t.Fatalf("erro: %s", err)
	}
	if len(snap.Metadata.ResolvedGroups) != 0 {
		t.Fatalf("grupos: %v", snap.Metadata.ResolvedGroups)
	}
}

func TestPollDescobertaDisparaHostItemEProblemaJuntos(t *testing.T) {
	started := make(chan string, 8)
	hold := make(chan struct{})
	fake := &fakeZabbix{
		started: started,
		hold:    hold,
		handle: func(method string, params map[string]any) (any, error) {
			switch method {
			case "hostgroup.get":
				return []map[string]any{{"groupid": "10", "name": "Backbone"}}, nil
			case "host.get":
				return []map[string]any{{"hostid": "1", "host": "host-1", "name": "host-1", "hostgroups": []map[string]any{{"name": "Backbone"}}}}, nil
			case "item.get":
				if _, ok := params["itemids"]; ok {
					return []map[string]any{{"itemid": "20001", "key_": "vendor.metric.rx[10]", "hostid": "1", "lastvalue": "10"}}, nil
				}
				return []map[string]any{{"itemid": "10001", "key_": "icmpping", "hostid": "1", "lastvalue": "1"}}, nil
			case "problem.get":
				return []map[string]any{}, nil
			default:
				return nil, fmt.Errorf("%s", method)
			}
		},
	}
	done := make(chan struct{})
	var snap liveSnapshot
	var pollErr string
	go func() {
		snap, pollErr = runZabbixPoll(context.Background(), fake.Call, grafanaSession{}, pollInput{
			DatasourceUID:  "ds",
			GroupNames:     []string{"Backbone"},
			StatusItemKey:  "icmpping",
			TrafficItemIDs: []string{"20001"},
		}, time.Now)
		close(done)
	}()
	got := map[string]int{}
	deadline := time.After(2 * time.Second)
	for sum := 0; sum < 4; {
		select {
		case method := <-started:
			got[method]++
			sum++
		case <-deadline:
			t.Fatalf("timeout esperando paralelos: %v", got)
		}
	}
	if got["host.get"] != 1 || got["problem.get"] != 1 || got["item.get"] != 2 {
		t.Fatalf("paralelos: %v", got)
	}
	close(hold)
	<-done
	if pollErr != "" {
		t.Fatalf("erro: %s", pollErr)
	}
	if snap.LastValues["10001"].LastValue != "1" || snap.LastValues["20001"].LastValue != "10" {
		t.Fatalf("lastvalues: %+v", snap.LastValues)
	}
}

func TestApplyLastValuesMesclaStatus(t *testing.T) {
	items := applyLastValuesToStatusItems(
		[]interfaceItem{{ItemID: "10001", Key: "icmpping", LastValue: "1", LastClock: "10", HostID: "1"}},
		map[string]itemLastValue{"10001": {ItemID: "10001", LastValue: "0", LastClock: "20"}},
		[]interfaceItem{{ItemID: "10001", Key: "icmpping", LastValue: "0", LastClock: "20", HostID: "1"}},
	)
	if items[0].LastValue != "0" || items[0].LastClock != "20" {
		t.Fatalf("merge: %+v", items[0])
	}
}

func TestCoalesceLinkTrafficNaoApagaLastvalue(t *testing.T) {
	prev := lastValueBundle{
		LastValues:     map[string]itemLastValue{"1": {ItemID: "1", LastValue: "500"}},
		InterfaceItems: []interfaceItem{{ItemID: "1", Key: "vendor.metric.rx[10]", LastValue: "500"}},
	}
	empty := coalesceLinkTraffic(lastValueBundle{LastValues: map[string]itemLastValue{}, InterfaceItems: nil}, prev)
	if empty.LastValues["1"].LastValue != "500" {
		t.Fatalf("vazio apagou tráfego: %+v", empty.LastValues)
	}
	blank := coalesceLinkTraffic(lastValueBundle{
		LastValues:     map[string]itemLastValue{"1": {ItemID: "1", LastValue: ""}},
		InterfaceItems: []interfaceItem{{ItemID: "1", Key: "vendor.metric.rx[10]", LastValue: ""}},
	}, prev)
	if blank.LastValues["1"].LastValue != "500" || blank.InterfaceItems[0].LastValue != "500" {
		t.Fatalf("lastvalue vazio apagou tráfego: %+v %+v", blank.LastValues, blank.InterfaceItems)
	}
}

func TestResolveHostStatusFromValue(t *testing.T) {
	if got := resolveHostStatusFromValue(0, []statusValueMapping{{Value: ptr(0.0), Status: "online"}}); got != "online" {
		t.Fatalf("exato: %s", got)
	}
	if got := resolveHostStatusFromValue(5, []statusValueMapping{{From: ptr(1.0), To: ptr(5.0), Status: "alert"}}); got != "alert" {
		t.Fatalf("faixa: %s", got)
	}
	if got := resolveHostStatusFromValue(0.99, []statusValueMapping{{From: ptr(1.0), To: ptr(5.0), Status: "alert"}}); got != "" {
		t.Fatalf("fora da faixa: %s", got)
	}
}

func TestRegionStatsRedePorNetworkId(t *testing.T) {
	w := 400.0
	h := 200.0
	hosts := []compactHost{
		{HostID: "1", Host: "host-a", Name: "host-a", IP: "10.0.0.1", Status: "online"},
		{HostID: "2", Host: "host-b", Name: "host-b", IP: "10.0.0.2", Status: "offline"},
	}
	req := zabbixStatusRequest{
		StatusValueMappings: onlineMappings(),
		Nodes: []statusMapNode{
			{ID: "net1", Type: "network", X: 0, Y: 0, W: &w, H: &h},
			{ID: "h1", Type: "host", ZabbixHost: "10.0.0.1", X: 10, Y: 10, NetworkID: "net1"},
			{ID: "h2", Type: "host", ZabbixHost: "10.0.0.2", X: 80, Y: 10, NetworkID: "net1"},
		},
		Links: []statusMapLink{{From: "h1", To: "h2", FromRxItemID: "1", FromTxItemID: "2"}},
	}
	snap := liveSnapshot{
		LastValues: map[string]itemLastValue{
			"1": {ItemID: "1", LastValue: "500000000"},
			"2": {ItemID: "2", LastValue: "100000000"},
		},
	}
	stats := buildRegionStats(req, hosts, snap)
	if len(stats) != 1 {
		t.Fatalf("stats: %+v", stats)
	}
	got := stats[0]
	if got.Up != 1 || got.Down != 1 || got.Total != 2 {
		t.Fatalf("contagem: %+v", got)
	}
	if got.RxBps == nil || *got.RxBps != 500000000 || got.TxBps == nil || *got.TxBps != 100000000 {
		t.Fatalf("tráfego: %+v", got)
	}
}

func TestRegionStatsPontoNoRetanguloUsaCaixaPadrao(t *testing.T) {
	w := 400.0
	h := 200.0
	hosts := []compactHost{{HostID: "1", Host: "host-a", Name: "host-a", IP: "10.0.0.1", Status: "online"}}
	req := zabbixStatusRequest{
		Nodes: []statusMapNode{
			{ID: "net1", Type: "network", X: 0, Y: 0, W: &w, H: &h},
			{ID: "h1", Type: "host", ZabbixHost: "10.0.0.1", X: 10, Y: 10},
		},
	}
	stats := buildRegionStats(req, hosts, liveSnapshot{})
	if len(stats) != 1 || stats[0].Up != 1 || stats[0].Total != 1 {
		t.Fatalf("caixa padrão 80x40 deveria incluir o host: %+v", stats)
	}
}

func TestRegionStatsSubmapaChildHostKeys(t *testing.T) {
	hosts := []compactHost{
		{HostID: "hid1", Host: "h1", Name: "h1", IP: "10.0.0.1", Status: "online"},
		{HostID: "hid2", Host: "h2", Name: "h2", IP: "10.0.0.2", Status: "online"},
	}
	req := zabbixStatusRequest{
		Nodes:         []statusMapNode{{ID: "sm1", Type: "submap", SubmapChildMapID: "seps"}},
		ChildHostKeys: map[string][]string{"seps": {"10.0.0.1", "10.0.0.2"}},
	}
	stats := buildRegionStats(req, hosts, liveSnapshot{})
	if len(stats) != 1 || stats[0].Up != 2 || stats[0].Total != 2 {
		t.Fatalf("child map: %+v", stats)
	}
}

func TestRegionStatsProblemaViraDegradedSemMudarHost(t *testing.T) {
	hosts := []compactHost{
		{HostID: "hid1", Host: "h1", Name: "h1", IP: "10.0.0.1", Status: "online"},
		{HostID: "hid2", Host: "h2", Name: "h2", IP: "10.0.0.2", Status: "online"},
	}
	req := zabbixStatusRequest{
		Nodes:         []statusMapNode{{ID: "sm1", Type: "submap", SubmapChildMapID: "seps"}},
		ChildHostKeys: map[string][]string{"seps": {"10.0.0.1", "10.0.0.2"}},
	}
	stats := buildRegionStats(req, hosts, liveSnapshot{
		Problems: map[string]problemSummary{"hid2": {Count: 1, MaxSeverity: 2, Names: []string{"ICMP timeout"}}},
	})
	if len(stats) != 1 || stats[0].Up != 1 || stats[0].Degraded != 1 || stats[0].Total != 2 {
		t.Fatalf("problema: %+v", stats)
	}
	if hosts[1].Status != "online" {
		t.Fatalf("host row não pode mudar por problema: %s", hosts[1].Status)
	}
}

func TestRegionStatsSubmapaLoadPendingEFailed(t *testing.T) {
	pending := buildRegionStats(zabbixStatusRequest{
		Nodes: []statusMapNode{{ID: "sm1", Type: "submap"}},
	}, nil, liveSnapshot{})
	if len(pending) != 1 || !pending[0].LoadPending {
		t.Fatalf("pending: %+v", pending)
	}
	failed := buildRegionStats(zabbixStatusRequest{
		Nodes:             []statusMapNode{{ID: "sm1", Type: "submap"}},
		SubmapHostsFailed: []string{"sm1"},
	}, nil, liveSnapshot{})
	if len(failed) != 1 || !failed[0].LoadFailed {
		t.Fatalf("failed: %+v", failed)
	}
}

func TestRegionStatsSubmapaNaoSomaTrafego(t *testing.T) {
	hosts := []compactHost{
		{HostID: "1", IP: "10.0.0.1", Status: "online"},
		{HostID: "2", IP: "10.0.0.2", Status: "online"},
	}
	req := zabbixStatusRequest{
		Nodes: []statusMapNode{
			{ID: "sm1", Type: "submap"},
			{ID: "h1", Type: "host", ZabbixHost: "10.0.0.1"},
			{ID: "h2", Type: "host", ZabbixHost: "10.0.0.2"},
		},
		SubmapHosts: map[string][]string{"sm1": {"10.0.0.1", "10.0.0.2"}},
		Links:       []statusMapLink{{From: "h1", To: "h2", FromRxItemID: "1", FromTxItemID: "2"}},
	}
	stats := buildRegionStats(req, hosts, liveSnapshot{
		LastValues: map[string]itemLastValue{"1": {ItemID: "1", LastValue: "500000000"}, "2": {ItemID: "2", LastValue: "100000000"}},
	})
	if len(stats) != 1 || stats[0].RxBps != nil || stats[0].TxBps != nil {
		t.Fatalf("submapa não agrega tráfego: %+v", stats)
	}
}

func TestCacheSingleFlightEMinRefresh(t *testing.T) {
	var itemGets atomic.Int32
	hold := make(chan struct{})
	fake := &fakeZabbix{
		hold: hold,
		handle: func(method string, params map[string]any) (any, error) {
			switch method {
			case "hostgroup.get":
				return []map[string]any{{"groupid": "10", "name": "Backbone"}}, nil
			case "host.get":
				return []map[string]any{{"hostid": "1", "host": "host-1", "name": "host-1", "hostgroups": []map[string]any{{"name": "Backbone"}}, "interfaces": []map[string]any{{"ip": "10.0.0.1", "main": "1"}}}}, nil
			case "item.get":
				itemGets.Add(1)
				if _, ok := params["itemids"]; ok {
					return []map[string]any{{"itemid": "10001", "key_": "icmpping", "hostid": "1", "lastvalue": "1"}}, nil
				}
				return []map[string]any{{"itemid": "10001", "key_": "icmpping", "hostid": "1", "lastvalue": "1"}}, nil
			case "problem.get":
				return []map[string]any{}, nil
			default:
				return nil, fmt.Errorf("%s", method)
			}
		},
	}
	now := time.Unix(1_700_000_000, 0)
	svc := newZabbixStatusService()
	svc.call = fake.Call
	svc.now = func() time.Time { return now }

	req := zabbixStatusRequest{
		DatasourceUID:       "ds",
		GroupNames:          []string{"Backbone"},
		StatusItemKey:       "icmpping",
		RefreshSec:          5,
		StatusValueMappings: onlineMappings(),
		Nodes: []statusMapNode{
			{ID: "h1", Type: "host", ZabbixHost: "10.0.0.1"},
		},
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); _ = svc.handle(context.Background(), grafanaSession{}, req) }()
	go func() { defer wg.Done(); _ = svc.handle(context.Background(), grafanaSession{}, req) }()
	time.Sleep(50 * time.Millisecond)
	close(hold)
	wg.Wait()
	if itemGets.Load() != 1 {
		t.Fatalf("single-flight deveria fazer um item.get de status, fez %d", itemGets.Load())
	}

	fake.hold = nil
	second := svc.handle(context.Background(), grafanaSession{}, req)
	if itemGets.Load() != 1 {
		t.Fatalf("dentro do refresh não consulta de novo: %d", itemGets.Load())
	}
	if len(second.Hosts) != 1 || second.Hosts[0].Status != "online" {
		t.Fatalf("cache: %+v", second.Hosts)
	}

	now = now.Add(6 * time.Second)
	_ = svc.handle(context.Background(), grafanaSession{}, req)
	if itemGets.Load() < 2 {
		t.Fatalf("após refresh deveria consultar de novo: %d", itemGets.Load())
	}
}

func TestCacheUneTrafficItemIdsEntreDashboards(t *testing.T) {
	var batches [][]string
	fake := &fakeZabbix{handle: func(method string, params map[string]any) (any, error) {
		switch method {
		case "hostgroup.get":
			return []map[string]any{{"groupid": "10", "name": "Backbone"}}, nil
		case "host.get":
			return []map[string]any{{"hostid": "1", "host": "host-1", "name": "host-1", "hostgroups": []map[string]any{{"name": "Backbone"}}}}, nil
		case "item.get":
			if ids := asStringSlice(params["itemids"]); len(ids) > 0 {
				batches = append(batches, ids)
			}
			return []map[string]any{{"itemid": "10001", "key_": "icmpping", "hostid": "1", "lastvalue": "1"}}, nil
		case "problem.get":
			return []map[string]any{}, nil
		default:
			return nil, fmt.Errorf("%s", method)
		}
	}}
	now := time.Unix(1_700_000_000, 0)
	svc := newZabbixStatusService()
	svc.call = fake.Call
	svc.now = func() time.Time { return now }
	base := zabbixStatusRequest{
		DatasourceUID: "ds",
		GroupNames:    []string{"Backbone"},
		StatusItemKey: "icmpping",
		RefreshSec:    5,
	}
	a := base
	a.TrafficItemIDs = []string{"20001"}
	_ = svc.handle(context.Background(), grafanaSession{}, a)
	b := base
	b.TrafficItemIDs = []string{"20002"}
	_ = svc.handle(context.Background(), grafanaSession{}, b)
	now = now.Add(6 * time.Second)
	_ = svc.handle(context.Background(), grafanaSession{}, b)
	if len(batches) == 0 {
		t.Fatal("esperava item.get por itemids no ciclo seguinte")
	}
	last := batches[len(batches)-1]
	joined := fmt.Sprint(last)
	if !bytes.Contains([]byte(joined), []byte("20001")) || !bytes.Contains([]byte(joined), []byte("20002")) {
		t.Fatalf("união de itemids: %v", last)
	}
}

func TestHandleZabbixStatusRecusaGet(t *testing.T) {
	h := New(t.TempDir())
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/zabbix-status", nil)
	h.handleZabbixStatus(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status: %d", rec.Code)
	}
}

func TestHandleZabbixStatusEncaminhaSessao(t *testing.T) {
	var gotCookie, gotAuth, gotOrg, gotID string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotCookie = r.Header.Get("Cookie")
		gotAuth = r.Header.Get("Authorization")
		gotOrg = r.Header.Get("X-Grafana-Org-Id")
		gotID = r.Header.Get("X-Grafana-Id")
		if r.URL.Path != "/api/datasources/uid/ds/resources/zabbix-api" {
			t.Errorf("path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode([]map[string]any{{"groupid": "10", "name": "Backbone"}})
	}))
	defer upstream.Close()

	origSvc := statusService
	origClient := zabbixHTTPClient
	t.Cleanup(func() {
		statusService = origSvc
		zabbixHTTPClient = origClient
	})
	zabbixHTTPClient = upstream.Client()
	statusService = newZabbixStatusService()

	h := New(t.TempDir())
	body, _ := json.Marshal(zabbixStatusRequest{
		DatasourceUID: "ds",
		GroupNames:    []string{"Inexistente"},
		StatusItemKey: "icmpping",
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/zabbix-status", bytes.NewReader(body))
	req.Header.Set("Cookie", "grafana_session=abc")
	req.Header.Set("Authorization", "Bearer tok")
	req.Header.Set("X-Grafana-Org-Id", "1")
	req.Header.Set("X-Grafana-Id", "req-1")
	ctx := backend.WithPluginContext(req.Context(), backend.PluginContext{
		GrafanaConfig: backend.NewGrafanaCfg(map[string]string{"GF_APP_URL": upstream.URL}),
	})
	req = req.WithContext(ctx)
	h.handleZabbixStatus(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status: %d", rec.Code)
	}
	if gotCookie != "grafana_session=abc" || gotAuth != "Bearer tok" || gotOrg != "1" || gotID != "req-1" {
		t.Fatalf("sessão: cookie=%q auth=%q org=%q id=%q", gotCookie, gotAuth, gotOrg, gotID)
	}
}

func TestResourceHandlerWithStatusExpoeLicenseEStatus(t *testing.T) {
	h := New(t.TempDir())
	handler := h.ResourceHandlerWithStatus()
	if handler == nil {
		t.Fatal("handler nulo")
	}
}
