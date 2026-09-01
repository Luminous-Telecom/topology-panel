package plugin

import (
	"context"
	"encoding/json"
	"math"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
)

var (
	statusKeyIdent   = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_.]*$`)
	statusKeyWrapped = regexp.MustCompile(`^/(.+)/[a-z]*$`)
	numericItemID    = regexp.MustCompile(`^\d+$`)
)

func isNumericZabbixItemID(value string) bool {
	return numericItemID.MatchString(strings.TrimSpace(value))
}

func zabbixHostItemKey(hostid, itemKey string) string {
	return hostid + ":" + itemKey
}

func uniqueSorted(values []string) []string {
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
	slices.Sort(out)
	return out
}

func asItemString(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(v)
	case json.Number:
		return strings.TrimSpace(v.String())
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return ""
		}
		if v == float64(int64(v)) {
			return strconv.FormatInt(int64(v), 10)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case float32:
		return asItemString(float64(v))
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case int32:
		return strconv.FormatInt(int64(v), 10)
	case json.RawMessage:
		var inner any
		if err := json.Unmarshal(v, &inner); err != nil {
			return strings.TrimSpace(string(v))
		}
		return asItemString(inner)
	case bool:
		if v {
			return "true"
		}
		return "false"
	default:
		return stringifyUnknown(v)
	}
}

func stringifyUnknown(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		return strings.TrimSpace("")
	}
	var inner any
	if err := json.Unmarshal(raw, &inner); err != nil {
		return strings.TrimSpace(string(raw))
	}
	if _, ok := inner.(string); ok {
		return asItemString(inner)
	}
	if _, ok := inner.(float64); ok {
		return asItemString(inner)
	}
	return strings.TrimSpace(string(raw))
}

func asNumber(value any) float64 {
	switch v := value.(type) {
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0
		}
		return v
	case float32:
		return asNumber(float64(v))
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case json.Number:
		n, err := v.Float64()
		if err != nil || math.IsNaN(n) || math.IsInf(n, 0) {
			return 0
		}
		return n
	case string:
		n, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err != nil || math.IsNaN(n) || math.IsInf(n, 0) {
			return 0
		}
		return n
	default:
		s := asItemString(v)
		if s == "" {
			return 0
		}
		n, err := strconv.ParseFloat(s, 64)
		if err != nil || math.IsNaN(n) || math.IsInf(n, 0) {
			return 0
		}
		return n
	}
}

func parseFinite(raw string) (float64, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return 0, false
	}
	n, err := strconv.ParseFloat(trimmed, 64)
	if err != nil || math.IsNaN(n) || math.IsInf(n, 0) {
		return 0, false
	}
	return n, true
}

func rowString(row map[string]any, key string) string {
	if row == nil {
		return ""
	}
	return asItemString(row[key])
}

func statusItemSearch(statusItemKey string) (keyFilter, nameFilter string) {
	trimmed := strings.TrimSpace(statusItemKey)
	if wrapped := statusKeyWrapped.FindStringSubmatch(trimmed); len(wrapped) > 1 {
		trimmed = strings.TrimSpace(wrapped[1])
	}
	if trimmed == "" {
		return "", ""
	}
	if statusKeyIdent.MatchString(trimmed) {
		return trimmed, ""
	}
	return "", trimmed
}

func pickMainIP(ifaces []any) string {
	if len(ifaces) == 0 {
		return ""
	}
	for _, raw := range ifaces {
		iface, _ := raw.(map[string]any)
		main := asItemString(iface["main"])
		if main == "1" || strings.EqualFold(main, "true") {
			if ip := asItemString(iface["ip"]); ip != "" {
				return ip
			}
		}
	}
	for _, raw := range ifaces {
		iface, _ := raw.(map[string]any)
		if ip := asItemString(iface["ip"]); ip != "" {
			return ip
		}
	}
	return ""
}

func rowsToInterfaceItems(rows []map[string]any) []interfaceItem {
	items := make([]interfaceItem, 0, len(rows))
	for _, row := range rows {
		key := strings.TrimSpace(rowString(row, "key_"))
		if key == "" {
			continue
		}
		hostid := asItemString(row["hostid"])
		itemid := asItemString(row["itemid"])
		if itemid == "" {
			itemid = zabbixHostItemKey(hostid, key)
		}
		item := interfaceItem{
			ItemID:    itemid,
			Key:       key,
			Name:      strings.TrimSpace(rowString(row, "name")),
			HostID:    hostid,
			LastValue: asItemString(row["lastvalue"]),
			LastClock: asItemString(row["lastclock"]),
		}
		items = append(items, item)
	}
	return items
}

func indexLastValues(rows []map[string]any) (map[string]itemLastValue, map[string]string) {
	lastValues := map[string]itemLastValue{}
	itemIDByKey := map[string]string{}
	for _, row := range rows {
		itemid := asItemString(row["itemid"])
		if !isNumericZabbixItemID(itemid) {
			continue
		}
		stored := itemLastValue{
			ItemID:    itemid,
			LastValue: asItemString(row["lastvalue"]),
			LastClock: asItemString(row["lastclock"]),
		}
		lastValues[itemid] = stored
		key := strings.TrimSpace(rowString(row, "key_"))
		hostid := asItemString(row["hostid"])
		if key != "" && isNumericZabbixItemID(hostid) {
			scoped := zabbixHostItemKey(hostid, key)
			lastValues[scoped] = stored
			if _, ok := itemIDByKey[scoped]; !ok {
				itemIDByKey[scoped] = itemid
			}
		}
	}
	return lastValues, itemIDByKey
}

func fetchResolvedGroups(
	ctx context.Context,
	call zabbixCallFn,
	session grafanaSession,
	datasourceUID string,
	groupNames []string,
	cached *zabbixResolvedGroups,
) (zabbixResolvedGroups, error) {
	wanted := uniqueSorted(groupNames)
	if len(wanted) == 0 {
		return zabbixResolvedGroups{ResolvedGroups: []string{}, GroupIDs: []string{}}, nil
	}
	if cached != nil && len(cached.GroupIDs) > 0 {
		return *cached, nil
	}
	wantedKeys := map[string]string{}
	for _, name := range wanted {
		wantedKeys[strings.ToUpper(name)] = name
	}
	matchRows := func(rows []map[string]any) zabbixResolvedGroups {
		resolved := make([]string, 0, len(wanted))
		ids := make([]string, 0, len(wanted))
		seen := map[string]struct{}{}
		for _, row := range rows {
			name := strings.TrimSpace(rowString(row, "name"))
			groupid := strings.TrimSpace(rowString(row, "groupid"))
			canonical, ok := wantedKeys[strings.ToUpper(name)]
			if !ok || !isNumericZabbixItemID(groupid) {
				continue
			}
			upper := strings.ToUpper(canonical)
			if _, dup := seen[upper]; dup {
				continue
			}
			seen[upper] = struct{}{}
			resolved = append(resolved, canonical)
			ids = append(ids, groupid)
		}
		return zabbixResolvedGroups{ResolvedGroups: resolved, GroupIDs: ids}
	}
	filtered, err := zabbixRPC[[]map[string]any](ctx, call, session, datasourceUID, "hostgroup.get", map[string]any{
		"output": []string{"groupid", "name"},
		"filter": map[string]any{"name": wanted},
	})
	if err != nil {
		return zabbixResolvedGroups{}, err
	}
	matched := matchRows(filtered)
	if len(matched.GroupIDs) == len(wanted) {
		return matched, nil
	}
	all, err := zabbixRPC[[]map[string]any](ctx, call, session, datasourceUID, "hostgroup.get", map[string]any{
		"output": []string{"groupid", "name"},
	})
	if err != nil {
		return zabbixResolvedGroups{}, err
	}
	return matchRows(all), nil
}

func fetchDirectMetadata(
	ctx context.Context,
	call zabbixCallFn,
	session grafanaSession,
	datasourceUID string,
	groupNames []string,
	cached *zabbixResolvedGroups,
) (zabbixDirectMetadata, error) {
	groups, err := fetchResolvedGroups(ctx, call, session, datasourceUID, groupNames, cached)
	if err != nil {
		return zabbixDirectMetadata{}, err
	}
	if len(groups.ResolvedGroups) == 0 {
		return zabbixDirectMetadata{
			Hosts:          []zabbixDirectHost{},
			ResolvedGroups: groups.ResolvedGroups,
			GroupIDs:       groups.GroupIDs,
		}, nil
	}
	wantedByUpper := map[string]string{}
	for _, name := range groups.ResolvedGroups {
		wantedByUpper[strings.ToUpper(strings.TrimSpace(name))] = name
	}
	rows, err := zabbixRPC[[]map[string]any](ctx, call, session, datasourceUID, "host.get", map[string]any{
		"groupids":         groups.GroupIDs,
		"output":           []string{"hostid", "host", "name", "description"},
		"selectInterfaces": []string{"ip", "main", "type"},
		"selectHostGroups": []string{"name"},
		"selectTags":       []string{"tag", "value"},
		"filter":           map[string]any{"status": hostMonitored},
		"monitored_hosts":  true,
	})
	if err != nil {
		return zabbixDirectMetadata{}, err
	}
	hosts := make([]zabbixDirectHost, 0, len(rows))
	for _, row := range rows {
		hostid := strings.TrimSpace(rowString(row, "hostid"))
		technical := strings.TrimSpace(rowString(row, "host"))
		visible := strings.TrimSpace(rowString(row, "name"))
		if visible == "" {
			visible = technical
		}
		if !isNumericZabbixItemID(hostid) || visible == "" {
			continue
		}
		rawGroups := append(asObjectSlice(row["hostgroups"]), asObjectSlice(row["groups"])...)
		hostGroups := make([]string, 0)
		seenGroup := map[string]struct{}{}
		for _, group := range rawGroups {
			name := strings.TrimSpace(asItemString(group["name"]))
			if name == "" {
				continue
			}
			canonical, ok := wantedByUpper[strings.ToUpper(name)]
			if !ok {
				continue
			}
			key := strings.ToUpper(canonical)
			if _, dup := seenGroup[key]; dup {
				continue
			}
			seenGroup[key] = struct{}{}
			hostGroups = append(hostGroups, canonical)
		}
		var ifaces []any
		if raw, ok := row["interfaces"].([]any); ok {
			ifaces = raw
		}
		hosts = append(hosts, zabbixDirectHost{
			HostID: hostid,
			Host:   technical,
			Name:   visible,
			IP:     pickMainIP(ifaces),
			Groups: hostGroups,
		})
	}
	return zabbixDirectMetadata{
		Hosts:          hosts,
		ResolvedGroups: groups.ResolvedGroups,
		GroupIDs:       groups.GroupIDs,
	}, nil
}

func asObjectSlice(value any) []map[string]any {
	switch v := value.(type) {
	case []map[string]any:
		return v
	case []any:
		out := make([]map[string]any, 0, len(v))
		for _, item := range v {
			if obj, ok := item.(map[string]any); ok {
				out = append(out, obj)
			}
		}
		return out
	default:
		return nil
	}
}

func fetchStatusLastValues(
	ctx context.Context,
	call zabbixCallFn,
	session grafanaSession,
	datasourceUID, statusItemKey string,
	hostids, extraKeys, groupids []string,
) ([]interfaceItem, error) {
	keyFilter, nameFilter := statusItemSearch(statusItemKey)
	extra := uniqueSorted(extraKeys)
	filter := map[string]any{}
	if keyFilter != "" {
		keys := uniqueSorted(append([]string{keyFilter}, extra...))
		if len(keys) == 1 {
			filter["key_"] = keys[0]
		} else {
			filter["key_"] = keys
		}
	} else if nameFilter != "" {
		filter["name"] = nameFilter
	}
	scopedHosts := numericIDs(hostids)
	scopedGroups := numericIDs(groupids)
	if len(filter) == 0 || (len(scopedHosts) == 0 && len(scopedGroups) == 0) {
		return []interfaceItem{}, nil
	}
	params := map[string]any{
		"output": trafficOutput,
		"filter": filter,
	}
	if len(scopedHosts) > 0 {
		params["hostids"] = scopedHosts
	} else {
		params["groupids"] = scopedGroups
	}
	rows, err := zabbixRPC[[]map[string]any](ctx, call, session, datasourceUID, "item.get", params)
	if err != nil {
		return nil, err
	}
	return rowsToInterfaceItems(rows), nil
}

func fetchTrafficLastValues(
	ctx context.Context,
	call zabbixCallFn,
	session grafanaSession,
	datasourceUID string,
	itemIDs, itemKeys, hostids, groupids []string,
) (trafficFetch, error) {
	ids := numericIDs(uniqueSorted(itemIDs))
	keys := uniqueSorted(itemKeys)
	empty := trafficFetch{
		LastValues:     map[string]itemLastValue{},
		ItemIDByKey:    map[string]string{},
		InterfaceItems: []interfaceItem{},
	}
	if len(ids) == 0 && len(keys) == 0 {
		return empty, nil
	}
	var rows []map[string]any
	if len(ids) > 0 {
		for offset := 0; offset < len(ids); offset += zabbixItemGetBatch {
			end := offset + zabbixItemGetBatch
			if end > len(ids) {
				end = len(ids)
			}
			batch := ids[offset:end]
			part, err := zabbixRPC[[]map[string]any](ctx, call, session, datasourceUID, "item.get", map[string]any{
				"itemids": batch,
				"output":  trafficOutput,
			})
			if err != nil {
				return empty, err
			}
			rows = append(rows, part...)
		}
	} else {
		scopedHosts := numericIDs(hostids)
		scopedGroups := numericIDs(groupids)
		params := map[string]any{
			"output": trafficOutput,
			"filter": map[string]any{"key_": keys},
		}
		if len(scopedHosts) > 0 {
			params["hostids"] = scopedHosts
		} else if len(scopedGroups) > 0 {
			params["groupids"] = scopedGroups
		}
		part, err := zabbixRPC[[]map[string]any](ctx, call, session, datasourceUID, "item.get", params)
		if err != nil {
			return empty, err
		}
		rows = part
	}
	lastValues, itemIDByKey := indexLastValues(rows)
	return trafficFetch{
		LastValues:     lastValues,
		ItemIDByKey:    itemIDByKey,
		InterfaceItems: rowsToInterfaceItems(rows),
	}, nil
}

func numericIDs(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if isNumericZabbixItemID(trimmed) {
			out = append(out, trimmed)
		}
	}
	return out
}

func numericIDsFromAny(values []any) []string {
	raw := make([]string, 0, len(values))
	for _, value := range values {
		raw = append(raw, asItemString(value))
	}
	return numericIDs(uniqueSorted(raw))
}

func problemIsSuppressed(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case float64:
		return v == 1
	case json.Number:
		n, err := v.Int64()
		return err == nil && n == 1
	case string:
		trimmed := strings.TrimSpace(v)
		return trimmed == "1" || strings.EqualFold(trimmed, "true")
	default:
		s := asItemString(value)
		return s == "1" || strings.EqualFold(s, "true")
	}
}

func triggerIsDisabled(value any) bool {
	if n, ok := value.(float64); ok {
		return n == 1
	}
	return asItemString(value) == "1"
}

func problemHostIDs(row map[string]any) []string {
	ids := make([]string, 0, 2)
	add := func(raw any) {
		id := asItemString(raw)
		if !isNumericZabbixItemID(id) {
			return
		}
		if slices.Contains(ids, id) {
			return
		}
		ids = append(ids, id)
	}
	add(row["hostid"])
	for _, host := range asObjectSlice(row["hosts"]) {
		add(host["hostid"])
	}
	return ids
}

func mergeProblemHosts(row map[string]any, hostids []string) map[string]any {
	if len(hostids) == 0 || len(problemHostIDs(row)) > 0 {
		return row
	}
	hosts := make([]any, 0, len(hostids))
	for _, hostid := range hostids {
		hosts = append(hosts, map[string]any{"hostid": hostid})
	}
	next := cloneRow(row)
	next["hosts"] = hosts
	return next
}

func cloneRow(row map[string]any) map[string]any {
	next := make(map[string]any, len(row)+1)
	for k, v := range row {
		next[k] = v
	}
	return next
}

func attachHostsFromEvents(
	ctx context.Context,
	call zabbixCallFn,
	session grafanaSession,
	datasourceUID string,
	rows []map[string]any,
) ([]map[string]any, error) {
	eventids := make([]string, 0, len(rows))
	for _, row := range rows {
		eventids = append(eventids, asItemString(row["eventid"]))
	}
	eventids = numericIDs(uniqueSorted(eventids))
	if len(eventids) == 0 {
		return rows, nil
	}
	events, err := zabbixRPC[[]map[string]any](ctx, call, session, datasourceUID, "event.get", map[string]any{
		"eventids":    eventids,
		"output":      []string{"eventid"},
		"selectHosts": []string{"hostid"},
		"source":      0,
		"object":      0,
	})
	if err != nil {
		return nil, err
	}
	hostsByEvent := map[string][]string{}
	for _, event := range events {
		eventid := asItemString(event["eventid"])
		hostids := numericIDsFromAny(hostIDValues(event["hosts"]))
		if eventid != "" && len(hostids) > 0 {
			hostsByEvent[eventid] = hostids
		}
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, mergeProblemHosts(row, hostsByEvent[asItemString(row["eventid"])]))
	}
	return out, nil
}

func hostIDValues(raw any) []any {
	hosts := asObjectSlice(raw)
	out := make([]any, 0, len(hosts))
	for _, host := range hosts {
		out = append(out, host["hostid"])
	}
	return out
}

func attachHostsFromTriggers(
	ctx context.Context,
	call zabbixCallFn,
	session grafanaSession,
	datasourceUID string,
	rows []map[string]any,
) ([]map[string]any, error) {
	missing := make([]map[string]any, 0)
	for _, row := range rows {
		if len(problemHostIDs(row)) == 0 {
			missing = append(missing, row)
		}
	}
	triggerIDs := make([]string, 0, len(missing))
	for _, row := range missing {
		triggerIDs = append(triggerIDs, asItemString(row["objectid"]))
	}
	triggerIDs = numericIDs(uniqueSorted(triggerIDs))
	if len(triggerIDs) == 0 {
		return rows, nil
	}
	triggers, err := zabbixRPC[[]map[string]any](ctx, call, session, datasourceUID, "trigger.get", map[string]any{
		"triggerids":  triggerIDs,
		"output":      []string{"triggerid", "status"},
		"filter":      map[string]any{"status": 0},
		"selectHosts": []string{"hostid"},
	})
	if err != nil {
		return nil, err
	}
	hostsByTrigger := map[string][]string{}
	for _, trigger := range triggers {
		if triggerIsDisabled(trigger["status"]) {
			continue
		}
		triggerid := asItemString(trigger["triggerid"])
		hostids := numericIDsFromAny(hostIDValues(trigger["hosts"]))
		if triggerid != "" && len(hostids) > 0 {
			hostsByTrigger[triggerid] = hostids
		}
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, mergeProblemHosts(row, hostsByTrigger[asItemString(row["objectid"])]))
	}
	return out, nil
}

func attachProblemHosts(
	ctx context.Context,
	call zabbixCallFn,
	session grafanaSession,
	datasourceUID string,
	rows []map[string]any,
) ([]map[string]any, error) {
	// problem.get não tem selectHosts. O host do evento sai de event.get;
	// trigger.get é reserva quando o eventid não veio, o evento não trouxe
	// host, ou o event.get falhou.
	fromEvents, err := attachHostsFromEvents(ctx, call, session, datasourceUID, rows)
	if err != nil {
		return attachHostsFromTriggers(ctx, call, session, datasourceUID, rows)
	}
	for _, row := range fromEvents {
		if len(problemHostIDs(row)) == 0 {
			return attachHostsFromTriggers(ctx, call, session, datasourceUID, fromEvents)
		}
	}
	return fromEvents, nil
}

// Descarta problema cujo trigger está desativado — o event.get ainda traz o host.
func keepProblemsFromEnabledTriggers(
	ctx context.Context,
	call zabbixCallFn,
	session grafanaSession,
	datasourceUID string,
	rows []map[string]any,
) []map[string]any {
	triggerIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		triggerIDs = append(triggerIDs, asItemString(row["objectid"]))
	}
	triggerIDs = numericIDs(uniqueSorted(triggerIDs))
	if len(triggerIDs) == 0 {
		return rows
	}
	triggers, err := zabbixRPC[[]map[string]any](ctx, call, session, datasourceUID, "trigger.get", map[string]any{
		"triggerids": triggerIDs,
		"output":     []string{"triggerid", "status"},
		"filter":     map[string]any{"status": 0},
	})
	if err != nil {
		return rows
	}
	enabled := map[string]struct{}{}
	for _, trigger := range triggers {
		if triggerIsDisabled(trigger["status"]) {
			continue
		}
		id := asItemString(trigger["triggerid"])
		if isNumericZabbixItemID(id) {
			enabled[id] = struct{}{}
		}
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if _, ok := enabled[asItemString(row["objectid"])]; ok {
			out = append(out, row)
		}
	}
	return out
}

func parseProblems(rows []map[string]any, hostids []string) map[string]problemSummary {
	wanted := map[string]struct{}{}
	for _, id := range hostids {
		trimmed := strings.TrimSpace(id)
		if trimmed != "" {
			wanted[trimmed] = struct{}{}
		}
	}
	summary := map[string]problemSummary{}
	namesByHost := map[string]map[string]float64{}
	for _, row := range rows {
		if problemIsSuppressed(row["suppressed"]) {
			continue
		}
		severity := asNumber(row["severity"])
		if severity < zabbixProblemMinSeverity {
			continue
		}
		name := strings.TrimSpace(rowString(row, "name"))
		if name == "" {
			name = strings.TrimSpace(rowString(row, "description"))
		}
		for _, hostid := range problemHostIDs(row) {
			if len(wanted) > 0 {
				if _, ok := wanted[hostid]; !ok {
					continue
				}
			}
			prev := summary[hostid]
			maxSev := prev.MaxSeverity
			if severity > maxSev {
				maxSev = severity
			}
			summary[hostid] = problemSummary{
				Count:       prev.Count + 1,
				MaxSeverity: maxSev,
				Names:       prev.Names,
			}
			if name == "" {
				continue
			}
			byName := namesByHost[hostid]
			if byName == nil {
				byName = map[string]float64{}
				namesByHost[hostid] = byName
			}
			if current, ok := byName[name]; !ok || severity >= current {
				byName[name] = severity
			}
		}
	}
	for hostid, current := range summary {
		entries := make([]nameSev, 0, len(namesByHost[hostid]))
		for name, sev := range namesByHost[hostid] {
			entries = append(entries, nameSev{name: name, sev: sev})
		}
		sort.Slice(entries, func(i, j int) bool {
			if entries[i].sev != entries[j].sev {
				return entries[i].sev > entries[j].sev
			}
			return entries[i].name < entries[j].name
		})
		if len(entries) > 0 {
			names := make([]string, 0, len(entries))
			for _, entry := range entries {
				names = append(names, entry.name)
			}
			current.Names = names
			summary[hostid] = current
		}
	}
	return summary
}

type nameSev struct {
	name string
	sev  float64
}

func fetchProblems(
	ctx context.Context,
	call zabbixCallFn,
	session grafanaSession,
	datasourceUID string,
	hostids, groupids []string,
) (map[string]problemSummary, error) {
	ids := numericIDs(uniqueSorted(hostids))
	gids := numericIDs(uniqueSorted(groupids))
	if len(ids) == 0 && len(gids) == 0 {
		return map[string]problemSummary{}, nil
	}
	severities := make([]int, 0, 4)
	for sev := zabbixProblemMinSeverity; sev <= 5; sev++ {
		severities = append(severities, sev)
	}
	// problem.get não aceita selectHosts — o Zabbix recusa e o proxy responde 500.
	// trigger.get (status 0) descarta trigger desativado; sem hostid, o host sai de event.get.
	params := map[string]any{
		"output":     []string{"eventid", "objectid", "name", "severity"},
		"severities": severities,
		"source":     0,
		"object":     0,
		"recent":     false,
		"suppressed": false,
		"limit":      problemsLimit,
	}
	if len(ids) > 0 {
		params["hostids"] = ids
	} else {
		params["groupids"] = gids
	}
	rows, err := zabbixRPC[[]map[string]any](ctx, call, session, datasourceUID, "problem.get", params)
	if err != nil {
		return nil, err
	}
	active := keepProblemsFromEnabledTriggers(ctx, call, session, datasourceUID, rows)
	needsHost := false
	for _, row := range active {
		if len(problemHostIDs(row)) == 0 {
			needsHost = true
			break
		}
	}
	withHosts := active
	if needsHost && len(active) > 0 {
		withHosts, err = attachProblemHosts(ctx, call, session, datasourceUID, active)
		if err != nil {
			return nil, err
		}
	}
	return parseProblems(withHosts, ids), nil
}

func resolveHostStatusFromValue(value float64, mappings []statusValueMapping) string {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return ""
	}
	pick := func(exact bool) string {
		for _, entry := range mappings {
			if (entry.Value != nil) != exact {
				continue
			}
			if !mappingMatchesValue(entry, value) {
				continue
			}
			switch entry.Status {
			case "online", "offline", "alert":
				return entry.Status
			}
		}
		return ""
	}
	if status := pick(true); status != "" {
		return status
	}
	if status := pick(false); status != "" {
		return status
	}
	if value == 0 {
		return "offline"
	}
	return ""
}

func mappingMatchesValue(entry statusValueMapping, value float64) bool {
	if entry.Value != nil {
		return value == *entry.Value
	}
	from := math.Inf(-1)
	to := math.Inf(1)
	hasFrom := entry.From != nil
	hasTo := entry.To != nil
	if hasFrom {
		from = *entry.From
	}
	if hasTo {
		to = *entry.To
	}
	// Faixa aberta "acima de 0" não inclui Down.
	if hasFrom && !hasTo && from == 0 && value == 0 {
		return false
	}
	return value >= from && value <= to
}
