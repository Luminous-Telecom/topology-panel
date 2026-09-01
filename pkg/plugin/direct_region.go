package plugin

import (
	"strconv"
	"strings"
)

func nodeSize(node statusMapNode) (w, h float64) {
	w = defaultNodeWidth
	h = defaultNodeHeight
	if node.W != nil && *node.W > 0 {
		w = *node.W
	}
	if node.H != nil && *node.H > 0 {
		h = *node.H
	}
	return w, h
}

func pointInRect(px, py, x, y, w, h float64) bool {
	return px >= x && px <= x+w && py >= y && py <= y+h
}

func hostsInsideNetwork(networkID string, network statusMapNode, hostNodes []statusMapNode, byID map[string]statusMapNode) []statusMapNode {
	nw, nh := nodeSize(network)
	inside := make([]statusMapNode, 0)
	for _, host := range hostNodes {
		if strings.TrimSpace(host.NetworkID) == networkID {
			inside = append(inside, host)
			continue
		}
		layout, ok := byID[host.ID]
		if !ok {
			continue
		}
		hw, hh := nodeSize(layout)
		cx := layout.X + hw/2
		cy := layout.Y + hh/2
		if pointInRect(cx, cy, network.X, network.Y, nw, nh) {
			inside = append(inside, host)
		}
	}
	return inside
}

func hostLookupKey(node statusMapNode) string {
	zabbixHost := strings.TrimSpace(node.ZabbixHost)
	label := strings.TrimSpace(node.Label)
	subtitle := strings.TrimSpace(node.Subtitle)
	if isIPv4(subtitle) {
		return subtitle
	}
	if isIPv4(zabbixHost) {
		return zabbixHost
	}
	if zabbixHost != "" && !isIPv4(zabbixHost) {
		return zabbixHost
	}
	if label != "" && !isIPv4(label) {
		return label
	}
	if zabbixHost != "" {
		return zabbixHost
	}
	return label
}

func hostLookupCandidates(node statusMapNode) []string {
	out := make([]string, 0, 4)
	add := func(value string) {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return
		}
		for _, existing := range out {
			if existing == trimmed {
				return
			}
		}
		out = append(out, trimmed)
	}
	key := hostLookupKey(node)
	add(key)
	add(node.ZabbixHost)
	add(node.Subtitle)
	add(node.Label)
	return out
}

type compactHostIndex struct {
	byAlias  map[string]*compactHost
	problems map[string]problemSummary
}

func indexCompactHosts(hosts []compactHost, problems map[string]problemSummary) compactHostIndex {
	idx := compactHostIndex{
		byAlias:  map[string]*compactHost{},
		problems: problems,
	}
	if idx.problems == nil {
		idx.problems = map[string]problemSummary{}
	}
	put := func(key string, host *compactHost) {
		trimmed := strings.TrimSpace(key)
		if trimmed == "" {
			return
		}
		idx.byAlias[trimmed] = host
		idx.byAlias[strings.ToLower(trimmed)] = host
	}
	for i := range hosts {
		host := &hosts[i]
		put(host.HostID, host)
		put(host.Host, host)
		put(host.Name, host)
		put(host.IP, host)
	}
	return idx
}

func (idx compactHostIndex) lookup(key string) *compactHost {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return nil
	}
	if host := idx.byAlias[trimmed]; host != nil {
		return host
	}
	return idx.byAlias[strings.ToLower(trimmed)]
}

func (idx compactHostIndex) lookupNode(node statusMapNode) *compactHost {
	for _, key := range hostLookupCandidates(node) {
		if host := idx.lookup(key); host != nil {
			return host
		}
	}
	return nil
}

func hostHasProblem(idx compactHostIndex, key string, host *compactHost) bool {
	candidates := []string{key}
	if host != nil {
		candidates = append(candidates, host.HostID, host.Host, host.Name, host.IP)
	}
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		trimmed := strings.TrimSpace(candidate)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		if summary, ok := idx.problems[trimmed]; ok && summary.Count > 0 && summary.MaxSeverity >= zabbixProblemMinSeverity {
			return true
		}
	}
	return false
}

func hostInQueryGroups(host *compactHost, queryRefIDs []string) bool {
	if len(queryRefIDs) == 0 || host == nil {
		return true
	}
	wanted := map[string]struct{}{}
	for _, id := range queryRefIDs {
		trimmed := strings.TrimSpace(id)
		if trimmed != "" {
			wanted[strings.ToUpper(trimmed)] = struct{}{}
		}
	}
	if len(wanted) == 0 {
		return true
	}
	for _, group := range host.Groups {
		if _, ok := wanted[strings.ToUpper(strings.TrimSpace(group))]; ok {
			return true
		}
	}
	return false
}

func countRegionStats(keys []string, idx compactHostIndex, queryRefIDs []string) regionStat {
	var up, down, degraded, unknown int
	seen := map[string]struct{}{}
	for _, raw := range keys {
		key := strings.TrimSpace(raw)
		if key == "" {
			continue
		}
		lower := strings.ToLower(key)
		if _, ok := seen[lower]; ok {
			continue
		}
		seen[lower] = struct{}{}
		host := idx.lookup(key)
		status := ""
		if host != nil && hostInQueryGroups(host, queryRefIDs) {
			status = host.Status
		}
		hasProblem := hostHasProblem(idx, key, host)
		switch {
		case status == "offline":
			down++
		case status == "alert" || hasProblem:
			degraded++
		case status == "online":
			up++
		default:
			unknown++
		}
	}
	return regionStat{
		Up:       up,
		Down:     down,
		Degraded: degraded,
		Unknown:  unknown,
		Total:    len(seen),
	}
}

func failedSet(ids []string) map[string]struct{} {
	out := map[string]struct{}{}
	for _, id := range ids {
		trimmed := strings.TrimSpace(id)
		if trimmed != "" {
			out[trimmed] = struct{}{}
		}
	}
	return out
}

func childKeysFor(node statusMapNode, childHostKeys map[string][]string) ([]string, bool) {
	if childHostKeys == nil {
		return nil, false
	}
	childID := strings.TrimSpace(node.SubmapChildMapID)
	if childID != "" {
		if keys, ok := childHostKeys[childID]; ok {
			return keys, true
		}
	}
	if keys, ok := childHostKeys[node.ID]; ok {
		return keys, true
	}
	return nil, false
}

func buildRegionStats(req zabbixStatusRequest, hosts []compactHost, snap liveSnapshot) []regionStat {
	idx := indexCompactHosts(hosts, snap.Problems)
	byID := map[string]statusMapNode{}
	hostNodes := make([]statusMapNode, 0)
	for _, node := range req.Nodes {
		byID[node.ID] = node
		if node.Type == "host" {
			hostNodes = append(hostNodes, node)
		}
	}
	failed := failedSet(req.SubmapHostsFailed)
	out := make([]regionStat, 0)
	for _, node := range req.Nodes {
		switch node.Type {
		case "submap":
			stat := regionStat{NodeID: node.ID}
			if keys, ok := childKeysFor(node, req.ChildHostKeys); ok {
				counted := countRegionStats(keys, idx, nil)
				counted.NodeID = node.ID
				out = append(out, counted)
				continue
			}
			if _, ok := failed[node.ID]; ok {
				stat.LoadFailed = true
				out = append(out, stat)
				continue
			}
			if req.SubmapHosts != nil {
				if keys, ok := req.SubmapHosts[node.ID]; ok {
					counted := countRegionStats(keys, idx, node.QueryRefIDs)
					counted.NodeID = node.ID
					out = append(out, counted)
					continue
				}
			}
			stat.LoadPending = true
			out = append(out, stat)
		case "network":
			inside := hostsInsideNetwork(node.ID, node, hostNodes, byID)
			names := make([]string, 0, len(inside))
			for _, host := range inside {
				if key := hostLookupKey(host); key != "" {
					names = append(names, key)
				}
			}
			counted := countRegionStats(names, idx, nil)
			counted.NodeID = node.ID
			out = append(out, counted)
		}
	}
	return mergeRegionTrafficStats(out, req, byID, hostNodes, snap.LastValues)
}

func parseTrafficBps(lastValues map[string]itemLastValue, itemID string) *float64 {
	id := strings.TrimSpace(itemID)
	if id == "" || lastValues == nil {
		return nil
	}
	row, ok := lastValues[id]
	if !ok {
		return nil
	}
	raw := strings.TrimSpace(row.LastValue)
	if raw == "" {
		return nil
	}
	n, err := strconv.ParseFloat(raw, 64)
	if err != nil || n < 0 {
		return nil
	}
	return &n
}

func linkMapTraffic(link statusMapLink, lastValues map[string]itemLastValue) (rx, tx *float64) {
	fromHas := strings.TrimSpace(link.FromRxItemID) != "" || strings.TrimSpace(link.FromTxItemID) != ""
	toHas := strings.TrimSpace(link.ToRxItemID) != "" || strings.TrimSpace(link.ToTxItemID) != ""
	if fromHas {
		return parseTrafficBps(lastValues, link.FromRxItemID), parseTrafficBps(lastValues, link.FromTxItemID)
	}
	if toHas {
		// Só o destino monitorado: inverte a leitura (RX do mapa = TX do destino).
		return parseTrafficBps(lastValues, link.ToTxItemID), parseTrafficBps(lastValues, link.ToRxItemID)
	}
	return nil, nil
}

func addTraffic(currentRx, currentTx, deltaRx, deltaTx *float64) (*float64, *float64) {
	sum := func(a, b *float64) *float64 {
		if a == nil && b == nil {
			return nil
		}
		var total float64
		if a != nil {
			total += *a
		}
		if b != nil {
			total += *b
		}
		return &total
	}
	return sum(currentRx, deltaRx), sum(currentTx, deltaTx)
}

func mergeRegionTrafficStats(
	stats []regionStat,
	req zabbixStatusRequest,
	byID map[string]statusMapNode,
	hostNodes []statusMapNode,
	lastValues map[string]itemLastValue,
) []regionStat {
	if len(req.Links) == 0 {
		return stats
	}
	hasMetric := false
	for _, link := range req.Links {
		if strings.TrimSpace(link.FromRxItemID) != "" || strings.TrimSpace(link.FromTxItemID) != "" ||
			strings.TrimSpace(link.ToRxItemID) != "" || strings.TrimSpace(link.ToTxItemID) != "" {
			hasMetric = true
			break
		}
	}
	if !hasMetric {
		return stats
	}

	type traffic struct {
		rx *float64
		tx *float64
	}
	trafficByRegion := map[string]*traffic{}
	regionByHostID := map[string][]string{}
	for _, node := range req.Nodes {
		if node.Type != "network" {
			continue
		}
		inside := hostsInsideNetwork(node.ID, node, hostNodes, byID)
		if len(inside) == 0 {
			continue
		}
		zero := 0.0
		trafficByRegion[node.ID] = &traffic{rx: new(float64), tx: new(float64)}
		*trafficByRegion[node.ID].rx = zero
		*trafficByRegion[node.ID].tx = zero
		for _, host := range inside {
			regionByHostID[host.ID] = append(regionByHostID[host.ID], node.ID)
		}
	}
	if len(trafficByRegion) == 0 {
		return stats
	}
	for _, link := range req.Links {
		regions := map[string]struct{}{}
		for _, id := range regionByHostID[link.From] {
			regions[id] = struct{}{}
		}
		for _, id := range regionByHostID[link.To] {
			regions[id] = struct{}{}
		}
		if len(regions) == 0 {
			continue
		}
		rx, tx := linkMapTraffic(link, lastValues)
		for regionID := range regions {
			prev := trafficByRegion[regionID]
			if prev == nil {
				continue
			}
			prev.rx, prev.tx = addTraffic(prev.rx, prev.tx, rx, tx)
		}
	}
	out := make([]regionStat, len(stats))
	copy(out, stats)
	for i := range out {
		traffic, ok := trafficByRegion[out[i].NodeID]
		if !ok || traffic == nil {
			continue
		}
		out[i].RxBps = traffic.rx
		out[i].TxBps = traffic.tx
	}
	return out
}
