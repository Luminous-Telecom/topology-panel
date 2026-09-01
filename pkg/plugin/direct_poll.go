package plugin

import (
	"context"
	"strings"
	"sync"
	"time"
)

var statusService = newZabbixStatusService()

type zabbixStatusService struct {
	mu       sync.Mutex
	entries  map[string]*statusCacheEntry
	inflight map[string]*statusInflight
	now      func() time.Time
	call     zabbixCallFn
}

type statusCacheEntry struct {
	snapshot    liveSnapshot
	err         string
	fetchedAt   time.Time
	trafficIDs  map[string]struct{}
	trafficKeys map[string]struct{}
}

type statusInflight struct {
	done     chan struct{}
	snapshot liveSnapshot
	err      string
}

func newZabbixStatusService() *zabbixStatusService {
	return &zabbixStatusService{
		entries:  map[string]*statusCacheEntry{},
		inflight: map[string]*statusInflight{},
		now:      time.Now,
	}
}

func (s *zabbixStatusService) rpc() zabbixCallFn {
	if s.call != nil {
		return s.call
	}
	return grafanaZabbixCall
}

func (s *zabbixStatusService) clock() time.Time {
	if s.now != nil {
		return s.now()
	}
	return time.Now()
}

func statusCacheKey(uid string, groups []string, statusKey string) string {
	return strings.TrimSpace(uid) + "\x00" + strings.Join(uniqueSorted(groups), "\x00") + "\x00" + strings.TrimSpace(statusKey)
}

func clampRefresh(sec int) time.Duration {
	if sec <= 0 {
		sec = defaultRefreshSec
	}
	if sec < minRefreshSec {
		sec = minRefreshSec
	}
	return time.Duration(sec) * time.Second
}

func (s *zabbixStatusService) handle(ctx context.Context, session grafanaSession, req zabbixStatusRequest) zabbixStatusResponse {
	resp := emptyStatusResponse()
	uid := strings.TrimSpace(req.DatasourceUID)
	if uid == "" {
		resp.Error = zabbixNoDatasourceError
		return resp
	}
	key := statusCacheKey(uid, req.GroupNames, req.StatusItemKey)
	refresh := clampRefresh(req.RefreshSec)
	s.unionTraffic(key, req.TrafficItemIDs, req.TrafficKeys)
	snap, pollErr := s.cachedSnapshot(ctx, session, key, req, refresh)
	hosts := compactHosts(snap, req.StatusValueMappings)
	resp.SavedAt = snap.SavedAt
	resp.Hosts = hosts
	resp.RegionStats = buildRegionStats(req, hosts, snap)
	if snap.Problems != nil {
		resp.Problems = snap.Problems
	}
	if snap.LastValues != nil {
		resp.LastValues = snap.LastValues
	}
	if snap.InterfaceItems != nil {
		resp.InterfaceItems = snap.InterfaceItems
	}
	resp.Error = pollErr
	return resp
}

func (s *zabbixStatusService) unionTraffic(key string, ids, keys []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry := s.entries[key]
	if entry == nil {
		entry = &statusCacheEntry{
			trafficIDs:  map[string]struct{}{},
			trafficKeys: map[string]struct{}{},
			snapshot:    emptySnapshot(),
		}
		s.entries[key] = entry
	}
	if entry.trafficIDs == nil {
		entry.trafficIDs = map[string]struct{}{}
	}
	if entry.trafficKeys == nil {
		entry.trafficKeys = map[string]struct{}{}
	}
	for _, id := range ids {
		trimmed := strings.TrimSpace(id)
		if isNumericZabbixItemID(trimmed) {
			entry.trafficIDs[trimmed] = struct{}{}
		}
	}
	for _, k := range keys {
		trimmed := strings.TrimSpace(k)
		if trimmed != "" {
			entry.trafficKeys[trimmed] = struct{}{}
		}
	}
}

func (s *zabbixStatusService) cachedSnapshot(
	ctx context.Context,
	session grafanaSession,
	key string,
	req zabbixStatusRequest,
	refresh time.Duration,
) (liveSnapshot, string) {
	s.mu.Lock()
	entry := s.entries[key]
	if entry != nil && !entry.fetchedAt.IsZero() && s.clock().Sub(entry.fetchedAt) < refresh {
		snap := entry.snapshot
		err := entry.err
		s.mu.Unlock()
		return snap, err
	}
	if inf := s.inflight[key]; inf != nil {
		s.mu.Unlock()
		select {
		case <-inf.done:
			return inf.snapshot, inf.err
		case <-ctx.Done():
			return emptySnapshot(), zabbixGenericError
		}
	}
	inf := &statusInflight{done: make(chan struct{})}
	s.inflight[key] = inf
	previous := emptySnapshot()
	trafficIDs := []string{}
	trafficKeys := []string{}
	if entry != nil {
		if !entry.fetchedAt.IsZero() {
			previous = entry.snapshot
		}
		for id := range entry.trafficIDs {
			trafficIDs = append(trafficIDs, id)
		}
		for k := range entry.trafficKeys {
			trafficKeys = append(trafficKeys, k)
		}
	}
	s.mu.Unlock()

	input := pollInput{
		DatasourceUID:  req.DatasourceUID,
		GroupNames:     req.GroupNames,
		StatusItemKey:  req.StatusItemKey,
		TrafficItemIDs: uniqueSorted(append(append([]string{}, req.TrafficItemIDs...), trafficIDs...)),
		TrafficKeys:    uniqueSorted(append(append([]string{}, req.TrafficKeys...), trafficKeys...)),
		Previous:       previous,
	}
	snap, pollErr := runZabbixPoll(ctx, s.rpc(), session, input, s.clock)

	s.mu.Lock()
	stored := s.entries[key]
	if stored == nil {
		stored = &statusCacheEntry{
			trafficIDs:  map[string]struct{}{},
			trafficKeys: map[string]struct{}{},
		}
		s.entries[key] = stored
	}
	stored.snapshot = snap
	stored.err = pollErr
	stored.fetchedAt = s.clock()
	delete(s.inflight, key)
	inf.snapshot = snap
	inf.err = pollErr
	close(inf.done)
	s.mu.Unlock()
	return snap, pollErr
}

type pollInput struct {
	DatasourceUID  string
	GroupNames     []string
	StatusItemKey  string
	TrafficItemIDs []string
	TrafficKeys    []string
	Previous       liveSnapshot
}

func hostIDs(hosts []zabbixDirectHost) []string {
	ids := make([]string, 0, len(hosts))
	for _, host := range hosts {
		ids = append(ids, host.HostID)
	}
	return ids
}

func numericItemIDs(items []interfaceItem) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(items))
	for _, item := range items {
		id := strings.TrimSpace(item.ItemID)
		if !isNumericZabbixItemID(id) {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func canRefreshByItemIDs(items []interfaceItem) bool {
	if len(items) == 0 {
		return false
	}
	return len(numericItemIDs(items)) == len(items)
}

func statusLastValuesPresent(lastValues map[string]itemLastValue, items []interfaceItem) bool {
	for _, item := range items {
		id := strings.TrimSpace(item.ItemID)
		if isNumericZabbixItemID(id) {
			if row, ok := lastValues[id]; ok && row.LastValue != "" {
				return true
			}
		}
		if item.LastValue != "" {
			return true
		}
	}
	return false
}

func applyLastValuesToStatusItems(
	items []interfaceItem,
	lastValues map[string]itemLastValue,
	interfaceItems []interfaceItem,
) []interfaceItem {
	byID := map[string]interfaceItem{}
	for _, item := range interfaceItems {
		id := strings.TrimSpace(item.ItemID)
		if isNumericZabbixItemID(id) {
			byID[id] = item
		}
	}
	out := make([]interfaceItem, 0, len(items))
	for _, item := range items {
		id := strings.TrimSpace(item.ItemID)
		if fromTraffic, ok := byID[id]; ok {
			next := item
			if fromTraffic.LastValue != "" {
				next.LastValue = fromTraffic.LastValue
			}
			if fromTraffic.LastClock != "" {
				next.LastClock = fromTraffic.LastClock
			}
			out = append(out, next)
			continue
		}
		lv, ok := lastValues[id]
		if !ok {
			out = append(out, item)
			continue
		}
		next := item
		if lv.LastValue != "" {
			next.LastValue = lv.LastValue
		}
		if lv.LastClock != "" {
			next.LastClock = lv.LastClock
		}
		out = append(out, next)
	}
	return out
}

func itemIDByKeyFromLastValues(lastValues map[string]itemLastValue) map[string]string {
	next := map[string]string{}
	for scoped, row := range lastValues {
		id := strings.TrimSpace(row.ItemID)
		if id == "" || !strings.Contains(scoped, ":") || !isNumericZabbixItemID(id) {
			continue
		}
		next[scoped] = id
	}
	return next
}

func mergeItemIDByKey(into map[string]string, items []interfaceItem) {
	for _, item := range items {
		id := strings.TrimSpace(item.ItemID)
		hostid := strings.TrimSpace(item.HostID)
		key := strings.TrimSpace(item.Key)
		if id == "" || hostid == "" || key == "" || !isNumericZabbixItemID(id) || !isNumericZabbixItemID(hostid) {
			continue
		}
		into[zabbixHostItemKey(hostid, key)] = id
	}
}

func aliasLastValuesByItemKey(lastValues map[string]itemLastValue, itemIDByKey map[string]string) map[string]itemLastValue {
	if len(itemIDByKey) == 0 {
		return lastValues
	}
	next := map[string]itemLastValue{}
	for k, v := range lastValues {
		next[k] = v
	}
	for key, itemID := range itemIDByKey {
		row, ok := next[itemID]
		if !ok {
			continue
		}
		if _, exists := next[key]; !exists {
			next[key] = row
		}
	}
	return next
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

func pendingTrafficKeys(keys []string, itemIDByKey map[string]string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0)
	for _, key := range keys {
		trimmed := strings.TrimSpace(key)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		if trafficKeyResolved(itemIDByKey, trimmed) {
			continue
		}
		out = append(out, trimmed)
	}
	return out
}

func coalesceLinkTraffic(
	incoming lastValueBundle,
	previous lastValueBundle,
) lastValueBundle {
	if len(incoming.LastValues) == 0 {
		keepIfaces := len(incoming.InterfaceItems) == 0 && len(previous.InterfaceItems) > 0
		lastValues := incoming.LastValues
		if len(previous.LastValues) > 0 {
			lastValues = previous.LastValues
		}
		ifaces := incoming.InterfaceItems
		if keepIfaces {
			ifaces = previous.InterfaceItems
		}
		return lastValueBundle{LastValues: lastValues, InterfaceItems: ifaces}
	}
	lastValues := map[string]itemLastValue{}
	for k, v := range previous.LastValues {
		lastValues[k] = v
	}
	for key, row := range incoming.LastValues {
		if row.LastValue == "" {
			continue
		}
		lastValues[key] = row
	}
	byID := map[string]interfaceItem{}
	for _, item := range previous.InterfaceItems {
		id := strings.TrimSpace(item.ItemID)
		if id != "" {
			byID[id] = item
		}
	}
	for _, item := range incoming.InterfaceItems {
		id := strings.TrimSpace(item.ItemID)
		if id == "" {
			continue
		}
		prevItem, ok := byID[id]
		if (item.LastValue == "") && ok && prevItem.LastValue != "" {
			kept := item
			kept.LastValue = prevItem.LastValue
			if kept.LastClock == "" {
				kept.LastClock = prevItem.LastClock
			}
			byID[id] = kept
			continue
		}
		byID[id] = item
	}
	ifaces := incoming.InterfaceItems
	if len(byID) > 0 {
		ifaces = make([]interfaceItem, 0, len(byID))
		for _, item := range byID {
			ifaces = append(ifaces, item)
		}
	}
	return lastValueBundle{LastValues: lastValues, InterfaceItems: ifaces}
}

type lastValueBundle struct {
	LastValues     map[string]itemLastValue
	InterfaceItems []interfaceItem
}

func snapshotFromParts(previous liveSnapshot, patch liveSnapshot, now func() time.Time) liveSnapshot {
	lastValues := patch.LastValues
	if lastValues == nil {
		lastValues = previous.LastValues
	}
	ifaces := patch.InterfaceItems
	if ifaces == nil {
		ifaces = previous.InterfaceItems
	}
	traffic := coalesceLinkTraffic(
		lastValueBundle{LastValues: lastValues, InterfaceItems: ifaces},
		lastValueBundle{LastValues: previous.LastValues, InterfaceItems: previous.InterfaceItems},
	)
	statusItems := previous.KnownStatusItems
	if patch.KnownStatusItems != nil {
		statusItems = patch.KnownStatusItems
	}
	statusItems = applyLastValuesToStatusItems(statusItems, traffic.LastValues, traffic.InterfaceItems)
	fromStatus := map[string]itemLastValue{}
	for _, item := range statusItems {
		id := strings.TrimSpace(item.ItemID)
		if !isNumericZabbixItemID(id) || item.LastValue == "" {
			continue
		}
		stored := itemLastValue{ItemID: id, LastValue: item.LastValue, LastClock: item.LastClock}
		fromStatus[id] = stored
		if item.HostID != "" && item.Key != "" {
			fromStatus[zabbixHostItemKey(item.HostID, item.Key)] = stored
		}
	}
	mergedLast := map[string]itemLastValue{}
	for k, v := range fromStatus {
		mergedLast[k] = v
	}
	for k, v := range traffic.LastValues {
		mergedLast[k] = v
	}
	metadata := previous.Metadata
	if patch.Metadata.ResolvedGroups != nil || patch.Metadata.Hosts != nil || patch.Metadata.GroupIDs != nil {
		metadata = patch.Metadata
	}
	problems := previous.Problems
	if patch.Problems != nil {
		problems = patch.Problems
	}
	stamp := time.Now()
	if now != nil {
		stamp = now()
	}
	return liveSnapshot{
		SavedAt:          stamp.UnixMilli(),
		Metadata:         metadata,
		KnownStatusItems: statusItems,
		LastValues:       mergedLast,
		InterfaceItems:   traffic.InterfaceItems,
		Problems:         problems,
	}
}

func collectNumericIDs(input pollInput, itemIDByKey map[string]string, known []interfaceItem) []string {
	ids := map[string]struct{}{}
	for _, id := range input.TrafficItemIDs {
		trimmed := strings.TrimSpace(id)
		if isNumericZabbixItemID(trimmed) {
			ids[trimmed] = struct{}{}
		}
	}
	for _, id := range itemIDByKey {
		if isNumericZabbixItemID(id) {
			ids[id] = struct{}{}
		}
	}
	for _, id := range numericItemIDs(known) {
		ids[id] = struct{}{}
	}
	out := make([]string, 0, len(ids))
	for id := range ids {
		out = append(out, id)
	}
	return uniqueSorted(out)
}

func runZabbixPoll(
	ctx context.Context,
	call zabbixCallFn,
	session grafanaSession,
	input pollInput,
	now func() time.Time,
) (liveSnapshot, string) {
	previous := input.Previous
	if previous.LastValues == nil {
		previous = emptySnapshot()
		previous.Metadata = input.Previous.Metadata
		previous.KnownStatusItems = input.Previous.KnownStatusItems
		previous.InterfaceItems = input.Previous.InterfaceItems
		previous.Problems = input.Previous.Problems
		if previous.LastValues == nil {
			previous.LastValues = map[string]itemLastValue{}
		}
	}
	itemIDByKey := itemIDByKeyFromLastValues(previous.LastValues)
	mergeItemIDByKey(itemIDByKey, previous.InterfaceItems)
	mergeItemIDByKey(itemIDByKey, previous.KnownStatusItems)
	pendingKeys := pendingTrafficKeys(input.TrafficKeys, itemIDByKey)
	hostids := hostIDs(previous.Metadata.Hosts)

	if len(previous.Metadata.ResolvedGroups) > 0 && canRefreshByItemIDs(previous.KnownStatusItems) {
		numeric := collectNumericIDs(input, itemIDByKey, previous.KnownStatusItems)
		if len(numeric) > 0 {
			fetched, err := fetchTrafficLastValues(ctx, call, session, input.DatasourceUID, numeric, pendingKeys, hostids, nil)
			if err != nil {
				return snapshotFromParts(previous, liveSnapshot{}, now), zabbixGenericError
			}
			mergeItemIDByKey(itemIDByKey, fetched.InterfaceItems)
			lastValues := aliasLastValuesByItemKey(fetched.LastValues, itemIDByKey)
			if statusLastValuesPresent(lastValues, previous.KnownStatusItems) {
				return snapshotFromParts(previous, liveSnapshot{
					LastValues:     lastValues,
					InterfaceItems: fetched.InterfaceItems,
				}, now), ""
			}
		}
	}

	var cached *zabbixResolvedGroups
	if len(previous.Metadata.ResolvedGroups) > 0 {
		cached = &zabbixResolvedGroups{
			ResolvedGroups: previous.Metadata.ResolvedGroups,
			GroupIDs:       previous.Metadata.GroupIDs,
		}
	}
	groups, err := fetchResolvedGroups(ctx, call, session, input.DatasourceUID, input.GroupNames, cached)
	if err != nil {
		return snapshotFromParts(previous, liveSnapshot{}, now), zabbixGenericError
	}
	if len(groups.ResolvedGroups) == 0 {
		return snapshotFromParts(previous, liveSnapshot{
			Metadata:         zabbixDirectMetadata{Hosts: []zabbixDirectHost{}, ResolvedGroups: []string{}, GroupIDs: []string{}},
			KnownStatusItems: []interfaceItem{},
			Problems:         map[string]problemSummary{},
		}, now), zabbixNoGroupsError
	}

	keyFilter, _ := statusItemSearch(input.StatusItemKey)
	extraInStatus := []string{}
	if keyFilter != "" {
		extraInStatus = pendingKeys
	}

	type metaRes struct {
		meta zabbixDirectMetadata
		err  error
	}
	type statusRes struct {
		items []interfaceItem
		err   error
	}
	type trafficRes struct {
		traffic trafficFetch
		err     error
	}
	type problemsRes struct {
		problems map[string]problemSummary
		err      error
	}
	metaCh := make(chan metaRes, 1)
	statusCh := make(chan statusRes, 1)
	trafficCh := make(chan trafficRes, 1)
	problemsCh := make(chan problemsRes, 1)

	cachedGroups := groups
	go func() {
		meta, err := fetchDirectMetadata(ctx, call, session, input.DatasourceUID, input.GroupNames, &cachedGroups)
		metaCh <- metaRes{meta: meta, err: err}
	}()
	go func() {
		items, err := fetchStatusLastValues(ctx, call, session, input.DatasourceUID, input.StatusItemKey, nil, extraInStatus, groups.GroupIDs)
		statusCh <- statusRes{items: items, err: err}
	}()
	go func() {
		problems, err := fetchProblems(ctx, call, session, input.DatasourceUID, nil, groups.GroupIDs)
		if err != nil {
			problemsCh <- problemsRes{problems: previous.Problems}
			return
		}
		problemsCh <- problemsRes{problems: problems}
	}()
	go func() {
		numeric := collectNumericIDs(input, itemIDByKey, previous.KnownStatusItems)
		empty := trafficFetch{LastValues: map[string]itemLastValue{}, InterfaceItems: []interfaceItem{}}
		switch {
		case len(pendingKeys) > 0 && keyFilter == "":
			t, err := fetchTrafficLastValues(ctx, call, session, input.DatasourceUID, nil, pendingKeys, nil, groups.GroupIDs)
			trafficCh <- trafficRes{traffic: t, err: err}
		case len(numeric) > 0:
			t, err := fetchTrafficLastValues(ctx, call, session, input.DatasourceUID, numeric, nil, nil, nil)
			trafficCh <- trafficRes{traffic: t, err: err}
		default:
			trafficCh <- trafficRes{traffic: empty}
		}
	}()

	metaOut := <-metaCh
	statusOut := <-statusCh
	trafficOut := <-trafficCh
	if metaOut.err != nil || statusOut.err != nil || trafficOut.err != nil {
		problemsOut := <-problemsCh
		_ = problemsOut
		return snapshotFromParts(previous, liveSnapshot{}, now), zabbixGenericError
	}

	statusItems := statusOut.items
	extraLastValues := map[string]itemLastValue{}
	extraItems := []interfaceItem{}
	if keyFilter != "" && len(extraInStatus) > 0 {
		filtered := make([]interfaceItem, 0, len(statusItems))
		for _, item := range statusItems {
			if item.Key == keyFilter {
				filtered = append(filtered, item)
				continue
			}
			extraItems = append(extraItems, item)
		}
		statusItems = filtered
		mergeItemIDByKey(itemIDByKey, extraItems)
		for _, item := range extraItems {
			id := strings.TrimSpace(item.ItemID)
			if !isNumericZabbixItemID(id) {
				continue
			}
			stored := itemLastValue{ItemID: id, LastValue: item.LastValue, LastClock: item.LastClock}
			extraLastValues[id] = stored
			if item.HostID != "" && item.Key != "" {
				extraLastValues[zabbixHostItemKey(item.HostID, item.Key)] = stored
			}
		}
	}
	if len(statusItems) == 0 && len(previous.KnownStatusItems) > 0 {
		statusItems = previous.KnownStatusItems
	}
	problemsOut := <-problemsCh
	if len(metaOut.meta.Hosts) > 0 && len(statusItems) == 0 {
		return snapshotFromParts(previous, liveSnapshot{
			Metadata: metaOut.meta,
			Problems: problemsOut.problems,
		}, now), zabbixNoStatusItemsError
	}

	mergeItemIDByKey(itemIDByKey, trafficOut.traffic.InterfaceItems)
	trafficLast := map[string]itemLastValue{}
	for k, v := range extraLastValues {
		trafficLast[k] = v
	}
	for k, v := range aliasLastValuesByItemKey(trafficOut.traffic.LastValues, itemIDByKey) {
		trafficLast[k] = v
	}
	trafficItems := append(append([]interfaceItem{}, extraItems...), trafficOut.traffic.InterfaceItems...)
	problems := problemsOut.problems
	if problems == nil {
		problems = previous.Problems
	}
	return snapshotFromParts(previous, liveSnapshot{
		Metadata:         metaOut.meta,
		KnownStatusItems: statusItems,
		LastValues:       trafficLast,
		InterfaceItems:   trafficItems,
		Problems:         problems,
	}, now), ""
}

func compactHosts(snap liveSnapshot, mappings []statusValueMapping) []compactHost {
	statusByHost := map[string]interfaceItem{}
	for _, item := range snap.KnownStatusItems {
		hostid := strings.TrimSpace(item.HostID)
		if hostid != "" {
			statusByHost[hostid] = item
		}
	}
	out := make([]compactHost, 0, len(snap.Metadata.Hosts))
	for _, host := range snap.Metadata.Hosts {
		row := compactHost{
			HostID: host.HostID,
			Host:   host.Host,
			Name:   host.Name,
			IP:     host.IP,
			Groups: host.Groups,
		}
		if item, ok := statusByHost[host.HostID]; ok {
			row.LastValue = item.LastValue
			row.LastClock = item.LastClock
			row.ItemID = item.ItemID
			if value, ok := parseFinite(item.LastValue); ok {
				row.Status = resolveHostStatusFromValue(value, mappings)
			}
		}
		if row.Groups == nil {
			row.Groups = []string{}
		}
		out = append(out, row)
	}
	return out
}
