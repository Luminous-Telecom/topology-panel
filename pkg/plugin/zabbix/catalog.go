package zabbix

import (
	"context"
	"encoding/json"
	"net"
	"regexp"
	"strings"
	"sync"
)

var dottedDirectionalKey = regexp.MustCompile(`^(?i)(rx|tx)\.[^\s\[\]]+$`)

func isIPv4(value string) bool {
	ip := net.ParseIP(strings.TrimSpace(value))
	return ip != nil && ip.To4() != nil
}

func itemMatchesInterfaceKeywords(key, name string, keywords []string) bool {
	if dottedDirectionalKey.MatchString(strings.TrimSpace(key)) {
		return true
	}
	hay := strings.ToLower(key + " " + name)
	for _, keyword := range keywords {
		trimmed := strings.ToLower(strings.TrimSpace(keyword))
		if trimmed != "" && strings.Contains(hay, trimmed) {
			return true
		}
	}
	return false
}

func firstHostID(raw json.RawMessage) string {
	var rows []struct {
		HostID string `json:"hostid"`
	}
	if err := json.Unmarshal(raw, &rows); err != nil || len(rows) == 0 {
		return ""
	}
	id := asID(rows[0].HostID)
	if !isNumericID(id) {
		return ""
	}
	return id
}

func callHostID(ctx context.Context, client API, params map[string]any) (string, error) {
	raw, err := client.Call(ctx, "host.get", params, callTimeout)
	if err != nil {
		return "", err
	}
	return firstHostID(raw), nil
}

func resolveMonitoredHostID(ctx context.Context, client API, hostKey string) (string, error) {
	key := strings.TrimSpace(hostKey)
	if key == "" {
		return "", nil
	}
	monitored := map[string]any{"status": hostMonitored}
	if isIPv4(key) {
		id, err := callHostID(ctx, client, map[string]any{
			"searchInterfaces": map[string]any{"ip": key},
			"filter":           monitored,
			"output":           []string{"hostid"},
		})
		if err != nil {
			return "", err
		}
		if id != "" {
			return id, nil
		}
	}
	id, err := callHostID(ctx, client, map[string]any{
		"filter": map[string]any{"name": []string{key}, "status": hostMonitored},
		"output": []string{"hostid"},
	})
	if err != nil {
		return "", err
	}
	if id != "" {
		return id, nil
	}
	return callHostID(ctx, client, map[string]any{
		"filter": map[string]any{"host": []string{key}, "status": hostMonitored},
		"output": []string{"hostid"},
	})
}

func fetchItemsByKeySearch(ctx context.Context, client API, hostids, terms []string) ([]InterfaceItem, error) {
	scoped := make([]string, 0, len(hostids))
	for _, id := range hostids {
		id = asID(id)
		if isNumericID(id) {
			scoped = append(scoped, id)
		}
	}
	uniqueTerms := uniqueStrings(terms)
	if len(scoped) == 0 || len(uniqueTerms) == 0 {
		return nil, nil
	}
	var mu sync.Mutex
	var firstErr error
	var rows []trafficRow
	var wg sync.WaitGroup
	wg.Add(len(uniqueTerms))
	for _, term := range uniqueTerms {
		term := term
		go func() {
			defer wg.Done()
			raw, err := client.Call(ctx, "item.get", map[string]any{
				"output":  trafficOutput,
				"hostids": scoped,
				"search":  map[string]any{"key_": term},
			}, statusCallTimeout)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				if firstErr == nil {
					firstErr = err
				}
				return
			}
			var part []trafficRow
			if unmarshalErr := json.Unmarshal(raw, &part); unmarshalErr != nil {
				if firstErr == nil {
					firstErr = unmarshalErr
				}
				return
			}
			rows = append(rows, part...)
		}()
	}
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	return trafficRowsToItems(rows), nil
}

func FetchHostGroupNames(ctx context.Context, client API) ([]string, error) {
	rows, err := listHostGroups(ctx, client)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(rows))
	for _, row := range rows {
		if name := strings.TrimSpace(row.Name); name != "" {
			names = append(names, name)
		}
	}
	return uniqueStrings(names), nil
}

func uniquePreserve(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}

func FetchItemNames(ctx context.Context, client API, groupNames []string) ([]string, error) {
	wanted := uniquePreserve(groupNames)
	if len(wanted) == 0 {
		return nil, nil
	}
	resolved, err := FetchResolvedGroups(ctx, client, wanted, nil)
	if err != nil {
		return nil, err
	}
	groupIDByName := map[string]string{}
	for i, name := range resolved.ResolvedGroups {
		if i >= len(resolved.GroupIDs) {
			break
		}
		groupIDByName[strings.ToUpper(name)] = resolved.GroupIDs[i]
	}
	for _, groupName := range wanted {
		groupid := groupIDByName[strings.ToUpper(groupName)]
		if !isNumericID(groupid) {
			continue
		}
		raw, callErr := client.Call(ctx, "item.get", map[string]any{
			"groupids":  []string{groupid},
			"output":    []string{"name"},
			"monitored": true,
		}, statusCallTimeout)
		if callErr != nil {
			return nil, callErr
		}
		var rows []struct {
			Name string `json:"name"`
		}
		if unmarshalErr := json.Unmarshal(raw, &rows); unmarshalErr != nil {
			return nil, unmarshalErr
		}
		names := make([]string, 0, len(rows))
		for _, row := range rows {
			if name := strings.TrimSpace(row.Name); name != "" {
				names = append(names, name)
			}
		}
		if len(names) > 0 {
			return uniqueStrings(names), nil
		}
	}
	return nil, nil
}

func FetchHostInterfaceItems(ctx context.Context, client API, hosts []InterfaceHostRef, searchKeys []string) ([]HostInterfaceItems, error) {
	uniqueHosts := make([]HostInterfaceItems, 0, len(hosts))
	seen := map[string]struct{}{}
	for _, host := range hosts {
		hostKey := strings.TrimSpace(host.HostKey)
		if hostKey == "" {
			continue
		}
		hostid := asID(host.HostID)
		if !isNumericID(hostid) {
			resolved, err := resolveMonitoredHostID(ctx, client, hostKey)
			if err != nil {
				return nil, err
			}
			hostid = resolved
		}
		if !isNumericID(hostid) {
			continue
		}
		if _, ok := seen[hostid]; ok {
			continue
		}
		seen[hostid] = struct{}{}
		uniqueHosts = append(uniqueHosts, HostInterfaceItems{HostKey: hostKey, HostID: hostid})
	}
	terms := uniqueStrings(searchKeys)
	if len(uniqueHosts) == 0 || len(terms) == 0 {
		return uniqueHosts, nil
	}
	hostids := make([]string, 0, len(uniqueHosts))
	for _, host := range uniqueHosts {
		hostids = append(hostids, host.HostID)
	}
	items, err := fetchItemsByKeySearch(ctx, client, hostids, terms)
	if err != nil {
		return nil, err
	}
	byHost := map[string][]InterfaceItem{}
	for _, host := range uniqueHosts {
		byHost[host.HostID] = []InterfaceItem{}
	}
	for _, item := range items {
		hostid := asID(item.HostID)
		bucket, ok := byHost[hostid]
		if !ok || !itemMatchesInterfaceKeywords(item.Key, item.Name, terms) {
			continue
		}
		byHost[hostid] = append(bucket, item)
	}
	out := make([]HostInterfaceItems, len(uniqueHosts))
	for i, host := range uniqueHosts {
		out[i] = HostInterfaceItems{
			HostKey: host.HostKey,
			HostID:  host.HostID,
			Items:   byHost[host.HostID],
		}
	}
	return out, nil
}
