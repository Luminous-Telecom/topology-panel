package zabbix

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"sync"
)

type pingScriptIDs struct {
	Panel      string
	Continuous string
}

var pingScriptCache sync.Map

func boolPtr(value bool) *bool { return &value }

func floatPtr(value float64) *float64 { return &value }

func parseFloatOrNil(raw string) *float64 {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	n, err := strconv.ParseFloat(trimmed, 64)
	if err != nil {
		return nil
	}
	return &n
}

func lookupHostsByIP(ctx context.Context, client API, ip string, withInterfaces bool) (string, error) {
	output := []string{"hostid", "host", "name"}
	params := map[string]any{
		"searchInterfaces": map[string]any{"ip": ip},
		"filter":           map[string]any{"status": hostMonitored},
		"output":           output,
	}
	if withInterfaces {
		params["selectInterfaces"] = []string{"ip", "main", "type"}
	}
	id, err := callHostID(ctx, client, params)
	if err == nil && id != "" {
		return id, nil
	}
	fallback := map[string]any{
		"filter": map[string]any{"ip": []string{ip}, "status": hostMonitored},
		"output": output,
	}
	if withInterfaces {
		fallback["selectInterfaces"] = []string{"ip", "main", "type"}
	}
	return callHostID(ctx, client, fallback)
}

func resolvePingHostID(ctx context.Context, client API, hostName string) (string, error) {
	name := strings.TrimSpace(hostName)
	if name == "" {
		return "", nil
	}
	if isNumericID(name) {
		id, err := callHostID(ctx, client, map[string]any{
			"hostids": []string{name},
			"output":  []string{"hostid"},
		})
		if err != nil {
			return "", err
		}
		if id != "" {
			return id, nil
		}
	}
	if isIPv4(name) {
		id, err := lookupHostsByIP(ctx, client, name, false)
		if err != nil {
			return "", err
		}
		if id != "" {
			return id, nil
		}
	}
	id, err := callHostID(ctx, client, map[string]any{
		"filter": map[string]any{"name": []string{name}},
		"output": []string{"hostid"},
	})
	if err != nil {
		return "", err
	}
	if id != "" {
		return id, nil
	}
	return callHostID(ctx, client, map[string]any{
		"filter": map[string]any{"host": []string{name}},
		"output": []string{"hostid"},
	})
}

func fetchPingScriptIDs(ctx context.Context, client API, cacheKey string) (pingScriptIDs, error) {
	if cached, ok := pingScriptCache.Load(cacheKey); ok {
		return cached.(pingScriptIDs), nil
	}
	raw, err := client.Call(ctx, "script.get", map[string]any{
		"output": []string{"scriptid", "name"},
	}, callTimeout)
	if err != nil {
		return pingScriptIDs{}, err
	}
	var rows []struct {
		ScriptID string `json:"scriptid"`
		Name     string `json:"name"`
	}
	if err := json.Unmarshal(raw, &rows); err != nil {
		return pingScriptIDs{}, err
	}
	byName := func(wanted string) string {
		target := strings.ToLower(strings.TrimSpace(wanted))
		for _, row := range rows {
			if strings.ToLower(strings.TrimSpace(row.Name)) == target {
				return strings.TrimSpace(row.ScriptID)
			}
		}
		return ""
	}
	ids := pingScriptIDs{
		Panel:      byName("Ping rápido"),
		Continuous: byName("Ping"),
	}
	if ids.Panel == "" {
		ids.Panel = byName("Ping")
	}
	pingScriptCache.Store(cacheKey, ids)
	return ids, nil
}

func fetchIcmpByHostID(ctx context.Context, client API, hostID string) (*IcmpStatus, error) {
	raw, err := client.Call(ctx, "item.get", map[string]any{
		"hostids":     []string{hostID},
		"output":      []string{"itemid", "key_", "lastvalue", "lastclock", "value_type"},
		"search":      map[string]any{"key_": "icmpping"},
		"searchByAny": true,
	}, callTimeout)
	if err != nil {
		return nil, err
	}
	var rows []struct {
		Key       string `json:"key_"`
		LastValue string `json:"lastvalue"`
		LastClock string `json:"lastclock"`
	}
	if err := json.Unmarshal(raw, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return &IcmpStatus{Error: "Itens ICMP (icmpping) não encontrados neste host"}, nil
	}
	status := &IcmpStatus{}
	var lastClock float64
	for _, row := range rows {
		key := strings.ToLower(row.Key)
		if clock := parseFloatOrNil(row.LastClock); clock != nil && *clock > lastClock {
			lastClock = *clock
			status.LastClock = clock
		}
		if strings.Contains(key, "icmppingloss") {
			status.LossPct = parseFloatOrNil(row.LastValue)
			continue
		}
		if strings.Contains(key, "icmppingsec") {
			if sec := parseFloatOrNil(row.LastValue); sec != nil {
				status.RttMs = floatPtr(*sec * 1000)
			}
			continue
		}
		if strings.HasPrefix(key, "icmpping") {
			if n := parseFloatOrNil(row.LastValue); n != nil {
				status.Reachable = boolPtr(*n >= 1)
			}
		}
	}
	if status.Reachable == nil {
		if status.RttMs != nil && *status.RttMs > 0 {
			status.Reachable = boolPtr(true)
		} else if status.LossPct != nil {
			status.Reachable = boolPtr(*status.LossPct < 100)
		}
	} else if status.RttMs != nil && *status.RttMs > 0 {
		status.Reachable = boolPtr(true)
	} else if status.LossPct != nil && *status.LossPct < 100 {
		status.Reachable = boolPtr(true)
	}
	return status, nil
}

func executePingScript(ctx context.Context, client API, cacheKey, hostID, mode string) PingResult {
	ids, err := fetchPingScriptIDs(ctx, client, cacheKey)
	if err != nil {
		return PingResult{Error: "Falha ao executar o ping no Zabbix."}
	}
	scriptID := ids.Panel
	if mode == "continuous" {
		scriptID = ids.Continuous
	}
	if scriptID == "" {
		return PingResult{Error: "Script Ping não encontrado no Zabbix (Alerts → Scripts)"}
	}
	raw, err := client.Call(ctx, "script.execute", map[string]any{
		"scriptid": scriptID,
		"hostid":   hostID,
	}, statusCallTimeout)
	if err != nil {
		return PingResult{Error: "Falha ao executar o ping no Zabbix."}
	}
	var result struct {
		Response string `json:"response"`
		Value    string `json:"value"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return PingResult{Error: "Falha ao executar o ping no Zabbix."}
	}
	output := strings.TrimSpace(result.Value)
	if result.Response == "success" && output != "" {
		return PingResult{Success: true, Output: output}
	}
	if output != "" {
		return PingResult{Success: result.Response == "success", Output: output}
	}
	return PingResult{Error: "Ping executado, mas sem saída. Verifique permissões de script no Zabbix."}
}

func RunPing(ctx context.Context, client API, cacheKey, hostName, mode string) PingResult {
	name := strings.TrimSpace(hostName)
	if strings.TrimSpace(cacheKey) == "" || name == "" {
		return PingResult{Error: "Host ou datasource Zabbix não configurado"}
	}
	hostID, err := resolvePingHostID(ctx, client, name)
	if err != nil {
		return PingResult{Error: "Falha ao executar o ping no Zabbix."}
	}
	if hostID == "" {
		return PingResult{Error: `Host "` + name + `" não encontrado no Zabbix`}
	}
	result := executePingScript(ctx, client, cacheKey, hostID, mode)
	icmp, icmpErr := fetchIcmpByHostID(ctx, client, hostID)
	if icmpErr == nil {
		result.ICMP = icmp
	}
	return result
}
