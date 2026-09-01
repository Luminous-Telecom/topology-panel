package zabbix

import (
	"context"
	"encoding/json"
	"sort"
	"strconv"
	"strings"
)

type problemRow struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Severity    any    `json:"severity"`
	ObjectID    string `json:"objectid"`
	HostID      string `json:"hostid"`
	Suppressed  any    `json:"suppressed"`
	Hosts       []struct {
		HostID string `json:"hostid"`
	} `json:"hosts"`
}

type triggerRow struct {
	TriggerID string `json:"triggerid"`
	Status    any    `json:"status"`
	Hosts     []struct {
		HostID string `json:"hostid"`
	} `json:"hosts"`
}

func problemSeverity(row problemRow) int {
	switch v := row.Severity.(type) {
	case float64:
		return int(v)
	case int:
		return v
	case string:
		return parseSeverity(v)
	default:
		return 0
	}
}

func problemIsSuppressed(row problemRow) bool {
	switch v := row.Suppressed.(type) {
	case bool:
		return v
	case float64:
		return int(v) == 1
	case string:
		return v == "1" || strings.EqualFold(v, "true")
	default:
		return false
	}
}

func problemName(row problemRow) string {
	name := strings.TrimSpace(row.Name)
	if name == "" {
		name = strings.TrimSpace(row.Description)
	}
	return name
}

func problemHostIDs(row problemRow) []string {
	ids := make([]string, 0, 2)
	add := func(raw string) {
		id := asID(raw)
		if !isNumericID(id) {
			return
		}
		for _, existing := range ids {
			if existing == id {
				return
			}
		}
		ids = append(ids, id)
	}
	add(row.HostID)
	for _, host := range row.Hosts {
		add(host.HostID)
	}
	return ids
}

func parseProblems(rows []problemRow, hostids []string) HostProblemsMap {
	wanted := map[string]struct{}{}
	for _, id := range hostids {
		id = asID(id)
		if id != "" {
			wanted[id] = struct{}{}
		}
	}
	summary := HostProblemsMap{}
	namesByHost := map[string]map[string]int{}
	for _, row := range rows {
		if problemIsSuppressed(row) {
			continue
		}
		severity := problemSeverity(row)
		if severity < problemMinSeverity {
			continue
		}
		name := problemName(row)
		for _, hostid := range problemHostIDs(row) {
			if _, ok := wanted[hostid]; !ok {
				continue
			}
			prev := summary[hostid]
			summary[hostid] = HostProblemSummary{
				Count:       prev.Count + 1,
				MaxSeverity: max(prev.MaxSeverity, severity),
			}
			if name == "" {
				continue
			}
			byName := namesByHost[hostid]
			if byName == nil {
				byName = map[string]int{}
			}
			if severity >= byName[name] {
				byName[name] = severity
			}
			namesByHost[hostid] = byName
		}
	}
	for hostid, current := range summary {
		entries := make([][2]string, 0, len(namesByHost[hostid]))
		for name, sev := range namesByHost[hostid] {
			entries = append(entries, [2]string{name, strconvItoa(sev)})
		}
		sort.Slice(entries, func(i, j int) bool {
			if entries[i][1] != entries[j][1] {
				return entries[i][1] > entries[j][1]
			}
			return entries[i][0] < entries[j][0]
		})
		if len(entries) > 0 {
			names := make([]string, len(entries))
			for i, entry := range entries {
				names[i] = entry[0]
			}
			current.Names = names
			summary[hostid] = current
		}
	}
	return summary
}

func strconvItoa(n int) string {
	return strconv.Itoa(n)
}

func triggerIsDisabled(row triggerRow) bool {
	switch v := row.Status.(type) {
	case float64:
		return int(v) == 1
	case int:
		return v == 1
	case string:
		return v == "1"
	default:
		return false
	}
}

func attachProblemHosts(ctx context.Context, client API, rows []problemRow) ([]problemRow, error) {
	triggerIDs := make([]string, 0, len(rows))
	seen := map[string]struct{}{}
	for _, row := range rows {
		id := asID(row.ObjectID)
		if !isNumericID(id) {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		triggerIDs = append(triggerIDs, id)
	}
	if len(triggerIDs) == 0 {
		return rows, nil
	}
	raw, err := client.Call(ctx, "trigger.get", map[string]any{
		"triggerids":  triggerIDs,
		"output":      []string{"triggerid", "status"},
		"filter":      map[string]any{"status": 0},
		"selectHosts": []string{"hostid"},
	}, callTimeout)
	if err != nil {
		return rows, err
	}
	var triggers []triggerRow
	if err := json.Unmarshal(raw, &triggers); err != nil {
		return rows, err
	}
	hostsByTrigger := map[string][]string{}
	for _, trigger := range triggers {
		if triggerIsDisabled(trigger) {
			continue
		}
		triggerid := asID(trigger.TriggerID)
		if !isNumericID(triggerid) {
			continue
		}
		hostids := make([]string, 0, len(trigger.Hosts))
		for _, host := range trigger.Hosts {
			id := asID(host.HostID)
			if isNumericID(id) {
				hostids = append(hostids, id)
			}
		}
		if len(hostids) > 0 {
			hostsByTrigger[triggerid] = hostids
		}
	}
	out := make([]problemRow, len(rows))
	for i, row := range rows {
		out[i] = row
		hostids := hostsByTrigger[asID(row.ObjectID)]
		if len(hostids) == 0 {
			continue
		}
		out[i].Hosts = make([]struct {
			HostID string `json:"hostid"`
		}, len(hostids))
		for j, hostid := range hostids {
			out[i].Hosts[j].HostID = hostid
		}
	}
	return out, nil
}

func FetchProblems(ctx context.Context, client API, hostids, groupids []string) (HostProblemsMap, error) {
	ids := uniqueStrings(hostids)
	groups := uniqueStrings(groupids)
	if len(ids) == 0 || len(groups) == 0 {
		return HostProblemsMap{}, nil
	}
	severities := make([]int, 0, 4)
	for sev := problemMinSeverity; sev <= 5; sev++ {
		severities = append(severities, sev)
	}
	raw, err := client.Call(ctx, "problem.get", map[string]any{
		"output":     []string{"eventid", "objectid", "name", "severity"},
		"groupids":   groups,
		"severities": severities,
		"source":     0,
		"object":     0,
		"recent":     false,
		"suppressed": false,
		"limit":      problemsLimit,
	}, callTimeout)
	if err != nil {
		return HostProblemsMap{}, err
	}
	var rows []problemRow
	if err := json.Unmarshal(raw, &rows); err != nil {
		return HostProblemsMap{}, err
	}
	withHosts, err := attachProblemHosts(ctx, client, rows)
	if err != nil {
		return HostProblemsMap{}, err
	}
	return parseProblems(withHosts, ids), nil
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
