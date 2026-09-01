package zabbix

import (
	"context"
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

const (
	hostMonitored      = "0"
	problemMinSeverity = 2
	problemsLimit      = 1001
)

var trafficOutput = []string{"itemid", "key_", "name", "hostid", "lastvalue", "lastclock"}

type hostGroupRow struct {
	GroupID string `json:"groupid"`
	Name    string `json:"name"`
}

type hostRow struct {
	HostID      string `json:"hostid"`
	Host        string `json:"host"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Interfaces  []struct {
		IP   string `json:"ip"`
		Main string `json:"main"`
		Type string `json:"type"`
	} `json:"interfaces"`
	HostGroups []struct {
		Name string `json:"name"`
	} `json:"hostgroups"`
	Groups []struct {
		Name string `json:"name"`
	} `json:"groups"`
	Tags []struct {
		Tag   string `json:"tag"`
		Value string `json:"value"`
	} `json:"tags"`
}

type trafficRow struct {
	ItemID    string `json:"itemid"`
	Key       string `json:"key_"`
	Name      string `json:"name"`
	HostID    string `json:"hostid"`
	LastValue string `json:"lastvalue"`
	LastClock string `json:"lastclock"`
}

func asID(raw string) string {
	return strings.TrimSpace(raw)
}

func isNumericID(id string) bool {
	if id == "" {
		return false
	}
	for _, ch := range id {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

func hostItemKey(hostid, key string) string {
	return hostid + ":" + key
}

func uniqueStrings(values []string) []string {
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
	sort.Strings(out)
	return out
}

func statusItemSearch(statusItemKey string) (keyFilter string, nameFilter string) {
	trimmed := strings.TrimSpace(statusItemKey)
	re := regexp.MustCompile(`^/(.+)/[a-z]*$`)
	if match := re.FindStringSubmatch(trimmed); len(match) > 1 {
		trimmed = strings.TrimSpace(match[1])
	}
	if trimmed == "" {
		return "", ""
	}
	if regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_.]*$`).MatchString(trimmed) {
		return trimmed, ""
	}
	return "", trimmed
}

func pickMainIP(interfaces []struct {
	IP   string `json:"ip"`
	Main string `json:"main"`
	Type string `json:"type"`
}) string {
	for _, iface := range interfaces {
		if iface.Main == "1" || iface.Main == "true" {
			ip := strings.TrimSpace(iface.IP)
			if ip != "" {
				return ip
			}
		}
	}
	for _, iface := range interfaces {
		ip := strings.TrimSpace(iface.IP)
		if ip != "" {
			return ip
		}
	}
	return ""
}

func listHostGroups(ctx context.Context, client API) ([]hostGroupRow, error) {
	raw, err := client.Call(ctx, "hostgroup.get", map[string]any{
		"output": []string{"groupid", "name"},
	}, callTimeout)
	if err != nil {
		return nil, err
	}
	var rows []hostGroupRow
	if err := json.Unmarshal(raw, &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

func FetchResolvedGroups(ctx context.Context, client API, groupNames []string, cached *ResolvedGroups) (ResolvedGroups, error) {
	wanted := uniqueStrings(groupNames)
	if len(wanted) == 0 {
		return ResolvedGroups{}, nil
	}
	if cached != nil && len(cached.GroupIDs) > 0 {
		return *cached, nil
	}
	rows, err := listHostGroups(ctx, client)
	if err != nil {
		return ResolvedGroups{}, err
	}
	wantedKeys := make(map[string]string, len(wanted))
	for _, name := range wanted {
		wantedKeys[strings.ToUpper(name)] = name
	}
	resolved := ResolvedGroups{}
	for _, row := range rows {
		name := strings.TrimSpace(row.Name)
		groupid := asID(row.GroupID)
		if name == "" || !isNumericID(groupid) {
			continue
		}
		if canonical, ok := wantedKeys[strings.ToUpper(name)]; ok {
			resolved.ResolvedGroups = append(resolved.ResolvedGroups, canonical)
			resolved.GroupIDs = append(resolved.GroupIDs, groupid)
		}
	}
	return resolved, nil
}

func FetchDirectMetadata(ctx context.Context, client API, groupNames []string, cached *ResolvedGroups) (DirectMetadata, error) {
	groups, err := FetchResolvedGroups(ctx, client, groupNames, cached)
	if err != nil {
		return DirectMetadata{}, err
	}
	if len(groups.ResolvedGroups) == 0 {
		return DirectMetadata{ResolvedGroups: groups.ResolvedGroups, GroupIDs: groups.GroupIDs}, nil
	}
	wanted := make(map[string]struct{}, len(groups.ResolvedGroups))
	for _, name := range groups.ResolvedGroups {
		wanted[name] = struct{}{}
	}
	raw, err := client.Call(ctx, "host.get", map[string]any{
		"groupids":         groups.GroupIDs,
		"output":           []string{"hostid", "host", "name", "description"},
		"selectInterfaces": []string{"ip", "main", "type"},
		"selectHostGroups": []string{"name"},
		"selectTags":       []string{"tag", "value"},
		"filter":           map[string]any{"status": hostMonitored},
		"monitored_hosts":  true,
	}, statusCallTimeout)
	if err != nil {
		return DirectMetadata{}, err
	}
	var rows []hostRow
	if err := json.Unmarshal(raw, &rows); err != nil {
		return DirectMetadata{}, err
	}
	hosts := make([]DirectHost, 0, len(rows))
	for _, row := range rows {
		hostid := asID(row.HostID)
		technical := strings.TrimSpace(row.Host)
		visible := strings.TrimSpace(row.Name)
		if visible == "" {
			visible = technical
		}
		if !isNumericID(hostid) || visible == "" {
			continue
		}
		rawGroups := row.HostGroups
		if len(rawGroups) == 0 {
			rawGroups = row.Groups
		}
		groupNamesForHost := make([]string, 0, len(rawGroups))
		for _, group := range rawGroups {
			name := strings.TrimSpace(group.Name)
			if name == "" {
				continue
			}
			if _, ok := wanted[name]; ok {
				groupNamesForHost = append(groupNamesForHost, name)
			}
		}
		tags := make([]HostTag, 0, len(row.Tags))
		for _, tag := range row.Tags {
			t := strings.TrimSpace(tag.Tag)
			if t == "" {
				continue
			}
			tags = append(tags, HostTag{Tag: t, Value: strings.TrimSpace(tag.Value)})
		}
		hosts = append(hosts, DirectHost{
			HostID:      hostid,
			Host:        technical,
			Name:        visible,
			IP:          pickMainIP(row.Interfaces),
			Description: strings.TrimSpace(row.Description),
			Groups:      groupNamesForHost,
			Tags:        tags,
		})
	}
	return DirectMetadata{
		Hosts:          hosts,
		ResolvedGroups: groups.ResolvedGroups,
		GroupIDs:       groups.GroupIDs,
	}, nil
}

func trafficRowsToItems(rows []trafficRow) []InterfaceItem {
	items := make([]InterfaceItem, 0, len(rows))
	for _, row := range rows {
		key := strings.TrimSpace(row.Key)
		if key == "" {
			continue
		}
		hostid := asID(row.HostID)
		itemid := asID(row.ItemID)
		if itemid == "" {
			itemid = hostItemKey(hostid, key)
		}
		item := InterfaceItem{
			ItemID: itemid,
			Key:    key,
			Name:   strings.TrimSpace(row.Name),
			HostID: hostid,
		}
		if row.LastValue != "" {
			item.LastValue = row.LastValue
		}
		if clock := strings.TrimSpace(row.LastClock); clock != "" {
			item.LastClock = clock
		}
		items = append(items, item)
	}
	return items
}

func indexTrafficRows(rows []trafficRow) (map[string]ItemLastValue, map[string]string) {
	lastValues := map[string]ItemLastValue{}
	itemIDByKey := map[string]string{}
	for _, row := range rows {
		itemid := asID(row.ItemID)
		if !isNumericID(itemid) {
			continue
		}
		stored := ItemLastValue{ItemID: itemid}
		if row.LastValue != "" {
			stored.LastValue = row.LastValue
		}
		if clock := strings.TrimSpace(row.LastClock); clock != "" {
			stored.LastClock = clock
		}
		lastValues[itemid] = stored
		key := strings.TrimSpace(row.Key)
		hostid := asID(row.HostID)
		if key != "" && isNumericID(hostid) {
			scoped := hostItemKey(hostid, key)
			lastValues[scoped] = stored
			if _, ok := itemIDByKey[scoped]; !ok {
				itemIDByKey[scoped] = itemid
			}
		}
	}
	return lastValues, itemIDByKey
}

func FetchStatusLastValues(ctx context.Context, client API, statusItemKey string, hostids []string, extraKeys []string) ([]InterfaceItem, error) {
	keyFilter, nameFilter := statusItemSearch(statusItemKey)
	extra := uniqueStrings(extraKeys)
	filter := map[string]any{}
	if keyFilter != "" {
		if len(extra) > 0 {
			keys := append([]string{keyFilter}, extra...)
			keys = uniqueStrings(keys)
			if len(keys) == 1 {
				filter["key_"] = keys[0]
			} else {
				filter["key_"] = keys
			}
		} else {
			filter["key_"] = keyFilter
		}
	} else if nameFilter != "" {
		filter["name"] = nameFilter
	}
	scoped := make([]string, 0, len(hostids))
	for _, id := range hostids {
		id = asID(id)
		if isNumericID(id) {
			scoped = append(scoped, id)
		}
	}
	if len(filter) == 0 || len(scoped) == 0 {
		return nil, nil
	}
	raw, err := client.Call(ctx, "item.get", map[string]any{
		"output":  trafficOutput,
		"hostids": scoped,
		"filter":  filter,
	}, statusCallTimeout)
	if err != nil {
		return nil, err
	}
	var rows []trafficRow
	if err := json.Unmarshal(raw, &rows); err != nil {
		return nil, err
	}
	return trafficRowsToItems(rows), nil
}

type TrafficFetchResult struct {
	LastValues     map[string]ItemLastValue
	ItemIDByKey    map[string]string
	InterfaceItems []InterfaceItem
}

func FetchTrafficLastValues(ctx context.Context, client API, itemIDs, itemKeys, hostids []string) (TrafficFetchResult, error) {
	ids := make([]string, 0, len(itemIDs))
	for _, id := range uniqueStrings(itemIDs) {
		if isNumericID(id) {
			ids = append(ids, id)
		}
	}
	keys := uniqueStrings(itemKeys)
	if len(ids) == 0 && len(keys) == 0 {
		return TrafficFetchResult{
			LastValues:     map[string]ItemLastValue{},
			ItemIDByKey:    map[string]string{},
			InterfaceItems: nil,
		}, nil
	}
	var rows []trafficRow
	var err error
	if len(ids) > 0 {
		raw, callErr := client.Call(ctx, "item.get", map[string]any{
			"itemids": ids,
			"output":  trafficOutput,
		}, statusCallTimeout)
		if callErr != nil {
			return TrafficFetchResult{}, callErr
		}
		if err = json.Unmarshal(raw, &rows); err != nil {
			return TrafficFetchResult{}, err
		}
	} else {
		scoped := make([]string, 0, len(hostids))
		for _, id := range hostids {
			id = asID(id)
			if isNumericID(id) {
				scoped = append(scoped, id)
			}
		}
		params := map[string]any{
			"output": trafficOutput,
			"filter": map[string]any{"key_": keys},
		}
		if len(scoped) > 0 {
			params["hostids"] = scoped
		}
		raw, callErr := client.Call(ctx, "item.get", params, statusCallTimeout)
		if callErr != nil {
			return TrafficFetchResult{}, callErr
		}
		if err = json.Unmarshal(raw, &rows); err != nil {
			return TrafficFetchResult{}, err
		}
	}
	lastValues, itemIDByKey := indexTrafficRows(rows)
	return TrafficFetchResult{
		LastValues:     lastValues,
		ItemIDByKey:    itemIDByKey,
		InterfaceItems: trafficRowsToItems(rows),
	}, nil
}

func numericStatusItemIDs(items []InterfaceItem) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(items))
	for _, item := range items {
		id := asID(item.ItemID)
		if !isNumericID(id) {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

func statusItemsCoverHosts(items []InterfaceItem, hostids []string) bool {
	if len(hostids) == 0 || len(items) == 0 {
		return false
	}
	ids := numericStatusItemIDs(items)
	if len(ids) != len(items) {
		return false
	}
	covered := map[string]struct{}{}
	for _, item := range items {
		if id := asID(item.HostID); id != "" {
			covered[id] = struct{}{}
		}
	}
	for _, hostid := range hostids {
		if _, ok := covered[asID(hostid)]; !ok {
			return false
		}
	}
	return true
}

func statusLastValuesPresent(lastValues map[string]ItemLastValue, items []InterfaceItem) bool {
	for _, item := range items {
		id := asID(item.ItemID)
		if isNumericID(id) && lastValues[id].LastValue != "" {
			return true
		}
		if item.LastValue != "" {
			return true
		}
	}
	return false
}

func applyLastValuesToStatusItems(items []InterfaceItem, lastValues map[string]ItemLastValue, interfaceItems []InterfaceItem) []InterfaceItem {
	byID := map[string]InterfaceItem{}
	for _, item := range interfaceItems {
		id := asID(item.ItemID)
		if isNumericID(id) {
			byID[id] = item
		}
	}
	out := make([]InterfaceItem, len(items))
	for i, item := range items {
		id := asID(item.ItemID)
		if fromTraffic, ok := byID[id]; ok {
			merged := item
			if fromTraffic.LastValue != "" {
				merged.LastValue = fromTraffic.LastValue
			}
			if fromTraffic.LastClock != "" {
				merged.LastClock = fromTraffic.LastClock
			}
			out[i] = merged
			continue
		}
		if lv, ok := lastValues[id]; ok {
			merged := item
			if lv.LastValue != "" {
				merged.LastValue = lv.LastValue
			}
			if lv.LastClock != "" {
				merged.LastClock = lv.LastClock
			}
			out[i] = merged
			continue
		}
		out[i] = item
	}
	return out
}

func mergeItemIDByKey(dst map[string]string, items []InterfaceItem) {
	for _, item := range items {
		hostid := asID(item.HostID)
		key := strings.TrimSpace(item.Key)
		itemid := asID(item.ItemID)
		if !isNumericID(hostid) || key == "" || !isNumericID(itemid) {
			continue
		}
		scoped := hostItemKey(hostid, key)
		if _, ok := dst[scoped]; !ok {
			dst[scoped] = itemid
		}
	}
}

func trafficKeyResolved(itemIDByKey map[string]string, key string) bool {
	if _, ok := itemIDByKey[key]; ok {
		return true
	}
	suffix := ":" + key
	for scoped := range itemIDByKey {
		if strings.HasSuffix(scoped, suffix) {
			return true
		}
	}
	return false
}

func aliasLastValuesByItemKey(lastValues map[string]ItemLastValue, itemIDByKey map[string]string) map[string]ItemLastValue {
	if len(itemIDByKey) == 0 {
		return lastValues
	}
	out := make(map[string]ItemLastValue, len(lastValues))
	for key, value := range lastValues {
		out[key] = value
	}
	for scoped, itemid := range itemIDByKey {
		if lv, ok := lastValues[itemid]; ok {
			out[scoped] = lv
		}
	}
	return out
}

func coalesceTraffic(incoming TrafficFetchResult, previous TrafficFetchResult) TrafficFetchResult {
	if len(incoming.LastValues) == 0 && len(incoming.InterfaceItems) == 0 {
		return previous
	}
	lastValues := map[string]ItemLastValue{}
	for key, value := range previous.LastValues {
		lastValues[key] = value
	}
	for key, value := range incoming.LastValues {
		lastValues[key] = value
	}
	items := append([]InterfaceItem{}, previous.InterfaceItems...)
	seen := map[string]struct{}{}
	for _, item := range previous.InterfaceItems {
		seen[asID(item.ItemID)] = struct{}{}
	}
	for _, item := range incoming.InterfaceItems {
		id := asID(item.ItemID)
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		items = append(items, item)
	}
	itemIDByKey := map[string]string{}
	for key, value := range previous.ItemIDByKey {
		itemIDByKey[key] = value
	}
	for key, value := range incoming.ItemIDByKey {
		itemIDByKey[key] = value
	}
	return TrafficFetchResult{
		LastValues:     lastValues,
		ItemIDByKey:    itemIDByKey,
		InterfaceItems: items,
	}
}

func parseSeverity(raw string) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0
	}
	return n
}
