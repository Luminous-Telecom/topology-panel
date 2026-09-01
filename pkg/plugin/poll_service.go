package plugin

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Luminous-Telecom/topology-panel/pkg/plugin/zabbix"
)

const (
	minRefreshSec     = 5
	defaultRefreshSec = 30
)

type PollRequest struct {
	DatasourceUID  string   `json:"datasourceUid"`
	GroupNames     []string `json:"groupNames"`
	StatusItemKey  string   `json:"statusItemKey"`
	TrafficItemIDs []string `json:"trafficItemIds"`
	TrafficKeys    []string `json:"trafficKeys"`
	RefreshSec     int      `json:"refreshSec"`
}

type PollResponse struct {
	Snapshot zabbix.LiveSnapshot `json:"snapshot"`
	Ready    bool                `json:"ready"`
	Loading  bool                `json:"loading"`
	Error    string              `json:"error,omitempty"`
}

type pollClock struct {
	lastStart time.Time
	inFlight  bool
}

type pollSession struct {
	metadata         zabbix.DirectMetadata
	knownStatusItems []zabbix.InterfaceItem
	itemIDByKey      map[string]string
	triedTrafficKeys map[string]struct{}
	lastTraffic      zabbix.TrafficFetchResult
	problems         zabbix.HostProblemsMap
	savedAt          int64
}

type pollService struct {
	mu       sync.Mutex
	clocks   map[string]*pollClock
	sessions map[string]*pollSession
	snapshots *snapshotCache
}

func newPollService(snapshots *snapshotCache) *pollService {
	return &pollService{
		clocks:    map[string]*pollClock{},
		sessions:  map[string]*pollSession{},
		snapshots: snapshots,
	}
}

func snapshotKey(datasourceUID string, groupNames []string, statusItemKey string) string {
	groups := make([]string, 0, len(groupNames))
	seen := map[string]struct{}{}
	for _, name := range groupNames {
		trimmed := strings.TrimSpace(name)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		groups = append(groups, trimmed)
	}
	return datasourceUID + "\u0000" + strings.Join(groups, "\u0001") + "\u0000" + strings.TrimSpace(statusItemKey)
}

func clampRefreshSec(value int) int {
	if value < minRefreshSec {
		return defaultRefreshSec
	}
	return value
}

func (s *pollService) loadSession(key string) *pollSession {
	if session, ok := s.sessions[key]; ok {
		return session
	}
	if body, ok := s.snapshots.get(key); ok {
		var snap zabbix.LiveSnapshot
		if err := json.Unmarshal(body, &snap); err == nil {
			session := sessionFromSnapshot(snap)
			s.sessions[key] = session
			return session
		}
	}
	return &pollSession{
		itemIDByKey:      map[string]string{},
		triedTrafficKeys: map[string]struct{}{},
		lastTraffic: zabbix.TrafficFetchResult{
			LastValues:  map[string]zabbix.ItemLastValue{},
			ItemIDByKey: map[string]string{},
		},
		problems: zabbix.HostProblemsMap{},
	}
}

func sessionReady(session *pollSession) bool {
	if len(session.metadata.ResolvedGroups) == 0 {
		return false
	}
	if len(session.metadata.Hosts) == 0 {
		return true
	}
	return len(session.knownStatusItems) > 0
}

func sessionPollStart(session *pollSession, now time.Time) time.Time {
	if session.savedAt > 0 {
		return time.UnixMilli(session.savedAt)
	}
	return now
}

func sessionFromSnapshot(snap zabbix.LiveSnapshot) *pollSession {
	itemIDByKey := map[string]string{}
	zabbix.MergeItemIDByKeyPublic(itemIDByKey, snap.KnownStatusItems)
	zabbix.MergeItemIDByKeyPublic(itemIDByKey, snap.InterfaceItems)
	return &pollSession{
		metadata:         snap.Metadata,
		knownStatusItems: append([]zabbix.InterfaceItem(nil), snap.KnownStatusItems...),
		itemIDByKey:      itemIDByKey,
		triedTrafficKeys: map[string]struct{}{},
		lastTraffic: zabbix.TrafficFetchResult{
			LastValues:     cloneLastValues(snap.LastValues),
			ItemIDByKey:    itemIDByKey,
			InterfaceItems: append([]zabbix.InterfaceItem(nil), snap.InterfaceItems...),
		},
		problems: cloneProblems(snap.Problems),
		savedAt:  snap.SavedAt,
	}
}

func cloneLastValues(src map[string]zabbix.ItemLastValue) map[string]zabbix.ItemLastValue {
	out := make(map[string]zabbix.ItemLastValue, len(src))
	for key, value := range src {
		out[key] = value
	}
	return out
}

func cloneProblems(src zabbix.HostProblemsMap) zabbix.HostProblemsMap {
	out := make(zabbix.HostProblemsMap, len(src))
	for key, value := range src {
		out[key] = value
	}
	return out
}

func (s *pollService) shouldFetchZabbix(clock *pollClock, session *pollSession, refreshSec int, now time.Time) bool {
	if !sessionReady(session) {
		return true
	}
	if clock.lastStart.IsZero() {
		return false
	}
	return now.Sub(clock.lastStart) >= time.Duration(refreshSec)*time.Second
}

func (s *pollService) cachedResponse(key string, session *pollSession, ready bool) PollResponse {
	snap := s.buildSnapshot(session)
	return PollResponse{
		Snapshot: snap,
		Ready:    ready,
		Loading:  false,
	}
}

func (s *pollService) buildSnapshot(session *pollSession) zabbix.LiveSnapshot {
	savedAt := session.savedAt
	if savedAt <= 0 {
		savedAt = time.Now().UnixMilli()
	}
	return zabbix.LiveSnapshot{
		SavedAt:          savedAt,
		Metadata:         session.metadata,
		KnownStatusItems: append([]zabbix.InterfaceItem(nil), session.knownStatusItems...),
		LastValues:       cloneLastValues(session.lastTraffic.LastValues),
		InterfaceItems:   append([]zabbix.InterfaceItem(nil), session.lastTraffic.InterfaceItems...),
		Problems:         cloneProblems(session.problems),
	}
}

func (s *pollService) persist(key string, session *pollSession) {
	snap := s.buildSnapshot(session)
	body, err := json.Marshal(snap)
	if err != nil {
		return
	}
	_ = s.snapshots.put(key, body)
}

func (s *pollService) Handle(ctx context.Context, r *http.Request, req PollRequest) PollResponse {
	key := snapshotKey(req.DatasourceUID, req.GroupNames, req.StatusItemKey)
	refreshSec := clampRefreshSec(req.RefreshSec)
	now := time.Now()

	s.mu.Lock()
	session := s.loadSession(key)
	clock := s.clocks[key]
	if clock == nil {
		clock = &pollClock{}
		s.clocks[key] = clock
	}
	if clock.inFlight {
		s.mu.Unlock()
		return s.cachedResponse(key, session, sessionReady(session))
	}
	if !s.shouldFetchZabbix(clock, session, refreshSec, now) {
		if clock.lastStart.IsZero() && sessionReady(session) {
			clock.lastStart = sessionPollStart(session, now)
		}
		s.mu.Unlock()
		return s.cachedResponse(key, session, sessionReady(session))
	}
	clock.inFlight = true
	clock.lastStart = now
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		if clock := s.clocks[key]; clock != nil {
			clock.inFlight = false
		}
		s.mu.Unlock()
	}()

	client, err := zabbix.NewClient(ctx, r, req.DatasourceUID)
	if err != nil {
		return PollResponse{Loading: false, Error: "Falha ao consultar o Zabbix. Verifique o datasource e os grupos configurados."}
	}

	pollErr := s.runPoll(ctx, client, session, req)
	s.mu.Lock()
	session.savedAt = time.Now().UnixMilli()
	s.sessions[key] = session
	s.persist(key, session)
	s.mu.Unlock()

	if pollErr != nil {
		return PollResponse{
			Snapshot: s.buildSnapshot(session),
			Ready:    false,
			Loading:  false,
			Error:    pollErr.Error(),
		}
	}
	if len(session.metadata.ResolvedGroups) == 0 {
		return PollResponse{
			Snapshot: s.buildSnapshot(session),
			Ready:    false,
			Loading:  false,
			Error:    "Nenhum dos grupos configurados existe no Zabbix.",
		}
	}
	if len(session.metadata.Hosts) > 0 && len(session.knownStatusItems) == 0 {
		return PollResponse{
			Snapshot: s.buildSnapshot(session),
			Ready:    false,
			Loading:  false,
			Error:    "Nenhum host dos grupos respondeu com o item de status. Confira o nome do item em \"Item de status\".",
		}
	}
	return s.cachedResponse(key, session, true)
}

func (s *pollService) runPoll(ctx context.Context, client *zabbix.Client, session *pollSession, req PollRequest) error {
	pendingKeys := pendingTrafficKeys(req.TrafficKeys, session.itemIDByKey, session.triedTrafficKeys)
	hostids := hostIDs(session.metadata.Hosts)

	if len(session.metadata.ResolvedGroups) > 0 && zabbix.StatusItemsCoverHostsPublic(session.knownStatusItems, hostids) {
		if err := s.publishByItemIDs(ctx, client, session, req, hostids, pendingKeys); err != nil {
			return err
		}
		if len(session.knownStatusItems) > 0 {
			return nil
		}
	}

	groups, err := zabbix.FetchResolvedGroups(ctx, client, req.GroupNames, &zabbix.ResolvedGroups{
		ResolvedGroups: session.metadata.ResolvedGroups,
		GroupIDs:       session.metadata.GroupIDs,
	})
	if err != nil {
		return err
	}
	if len(groups.ResolvedGroups) == 0 {
		session.metadata = zabbix.DirectMetadata{ResolvedGroups: groups.ResolvedGroups, GroupIDs: groups.GroupIDs}
		return nil
	}

	meta, err := zabbix.FetchDirectMetadata(ctx, client, req.GroupNames, &groups)
	if err != nil {
		return err
	}
	session.metadata = meta
	hostids = hostIDs(meta.Hosts)

	problems, err := zabbix.FetchProblems(ctx, client, hostids, meta.GroupIDs)
	if err == nil {
		session.problems = problems
	}

	if err := s.publishByItemIDs(ctx, client, session, req, hostids, pendingKeys); err != nil {
		return err
	}
	if len(session.knownStatusItems) > 0 {
		return nil
	}

	pendingKeys = pendingTrafficKeys(req.TrafficKeys, session.itemIDByKey, session.triedTrafficKeys)
	keyFilter := zabbix.StatusItemSearchPublic(req.StatusItemKey)
	extraInStatus := pendingKeys
	if keyFilter == "" {
		extraInStatus = nil
	}
	fetched, err := zabbix.FetchStatusLastValues(ctx, client, req.StatusItemKey, hostids, extraInStatus)
	if err != nil {
		return err
	}
	statusItems := absorbTrafficFromStatusFetch(session, fetched, extraInStatus, keyFilter)
	if len(statusItems) == 0 && len(session.knownStatusItems) > 0 {
		statusItems = session.knownStatusItems
	}
	session.knownStatusItems = statusItems

	if len(pendingKeys) > 0 && keyFilter == "" {
		if err := s.fetchPendingKeyTraffic(ctx, client, session, hostids, pendingKeys); err != nil {
			return err
		}
	}

	if len(pendingKeys) == 0 && hasNumericTrafficIDs(req.TrafficItemIDs) {
		traffic, err := s.fetchTrafficLastValues(ctx, client, session, req, hostids)
		if err != nil {
			return err
		}
		session.lastTraffic = zabbix.CoalesceTrafficPublic(traffic, session.lastTraffic)
		session.knownStatusItems = zabbix.ApplyLastValuesToStatusItemsPublic(
			session.knownStatusItems,
			session.lastTraffic.LastValues,
			session.lastTraffic.InterfaceItems,
		)
	}
	return nil
}

func hostIDs(hosts []zabbix.DirectHost) []string {
	out := make([]string, 0, len(hosts))
	for _, host := range hosts {
		out = append(out, host.HostID)
	}
	return out
}

func pendingTrafficKeys(keys []string, itemIDByKey map[string]string, tried map[string]struct{}) []string {
	out := make([]string, 0, len(keys))
	for _, key := range keys {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if zabbix.TrafficKeyResolvedPublic(itemIDByKey, key) {
			continue
		}
		if _, ok := tried[key]; ok {
			continue
		}
		out = append(out, key)
	}
	return out
}

func hasNumericTrafficIDs(ids []string) bool {
	for _, id := range ids {
		if zabbix.IsNumericIDPublic(strings.TrimSpace(id)) {
			return true
		}
	}
	return false
}

func (s *pollService) publishByItemIDs(
	ctx context.Context,
	client *zabbix.Client,
	session *pollSession,
	req PollRequest,
	hostids []string,
	pendingKeys []string,
) error {
	if !zabbix.StatusItemsCoverHostsPublic(session.knownStatusItems, hostids) {
		return nil
	}
	traffic, err := s.fetchTrafficLastValues(ctx, client, session, req, hostids)
	if err != nil {
		return err
	}
	if !zabbix.StatusLastValuesPresentPublic(traffic.LastValues, session.knownStatusItems) {
		return nil
	}
	session.lastTraffic = zabbix.CoalesceTrafficPublic(traffic, session.lastTraffic)
	if len(pendingKeys) > 0 {
		if err := s.fetchPendingKeyTraffic(ctx, client, session, hostids, pendingKeys); err != nil {
			return err
		}
	}
	session.knownStatusItems = zabbix.ApplyLastValuesToStatusItemsPublic(
		session.knownStatusItems,
		session.lastTraffic.LastValues,
		session.lastTraffic.InterfaceItems,
	)
	return nil
}

func (s *pollService) fetchTrafficLastValues(
	ctx context.Context,
	client *zabbix.Client,
	session *pollSession,
	req PollRequest,
	hostids []string,
) (zabbix.TrafficFetchResult, error) {
	numeric := make([]string, 0, len(req.TrafficItemIDs)+len(session.itemIDByKey))
	seen := map[string]struct{}{}
	for _, id := range req.TrafficItemIDs {
		id = strings.TrimSpace(id)
		if !zabbix.IsNumericIDPublic(id) {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		numeric = append(numeric, id)
	}
	for _, id := range session.itemIDByKey {
		id = strings.TrimSpace(id)
		if !zabbix.IsNumericIDPublic(id) {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		numeric = append(numeric, id)
	}
	for _, id := range zabbix.NumericStatusItemIDsPublic(session.knownStatusItems) {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		numeric = append(numeric, id)
	}
	pending := pendingTrafficKeys(req.TrafficKeys, session.itemIDByKey, session.triedTrafficKeys)
	if len(numeric) == 0 && len(pending) == 0 {
		return session.lastTraffic, nil
	}
	fetched, err := zabbix.FetchTrafficLastValues(ctx, client, numeric, pending, hostids)
	if err != nil {
		return zabbix.TrafficFetchResult{}, err
	}
	for key, value := range fetched.ItemIDByKey {
		session.itemIDByKey[key] = value
	}
	zabbix.MergeItemIDByKeyPublic(session.itemIDByKey, fetched.InterfaceItems)
	if len(pending) > 0 {
		for _, key := range pending {
			session.triedTrafficKeys[key] = struct{}{}
		}
	}
	return zabbix.TrafficFetchResult{
		LastValues:     zabbix.AliasLastValuesByItemKeyPublic(fetched.LastValues, session.itemIDByKey),
		ItemIDByKey:    session.itemIDByKey,
		InterfaceItems: fetched.InterfaceItems,
	}, nil
}

func (s *pollService) fetchPendingKeyTraffic(ctx context.Context, client *zabbix.Client, session *pollSession, hostids, keys []string) error {
	if len(keys) == 0 {
		return nil
	}
	fetched, err := zabbix.FetchTrafficLastValues(ctx, client, nil, keys, hostids)
	if err != nil {
		return err
	}
	for key, value := range fetched.ItemIDByKey {
		session.itemIDByKey[key] = value
	}
	zabbix.MergeItemIDByKeyPublic(session.itemIDByKey, fetched.InterfaceItems)
	session.lastTraffic = zabbix.CoalesceTrafficPublic(zabbix.TrafficFetchResult{
		LastValues:     zabbix.AliasLastValuesByItemKeyPublic(fetched.LastValues, session.itemIDByKey),
		InterfaceItems: fetched.InterfaceItems,
	}, session.lastTraffic)
	for _, key := range keys {
		session.triedTrafficKeys[key] = struct{}{}
	}
	return nil
}

func absorbTrafficFromStatusFetch(session *pollSession, fetched []zabbix.InterfaceItem, extraKeys []string, statusKey string) []zabbix.InterfaceItem {
	statusItems := fetched
	if statusKey != "" && len(extraKeys) > 0 {
		filtered := make([]zabbix.InterfaceItem, 0, len(fetched))
		trafficItems := make([]zabbix.InterfaceItem, 0, len(fetched))
		for _, item := range fetched {
			if item.Key == statusKey {
				filtered = append(filtered, item)
			} else {
				trafficItems = append(trafficItems, item)
			}
		}
		statusItems = filtered
		zabbix.MergeItemIDByKeyPublic(session.itemIDByKey, trafficItems)
		lastValues := map[string]zabbix.ItemLastValue{}
		for _, item := range trafficItems {
			id := strings.TrimSpace(item.ItemID)
			if !zabbix.IsNumericIDPublic(id) {
				continue
			}
			stored := zabbix.ItemLastValue{ItemID: id, LastValue: item.LastValue, LastClock: item.LastClock}
			lastValues[id] = stored
			if hostid := strings.TrimSpace(item.HostID); hostid != "" && item.Key != "" {
				lastValues[hostid+":"+item.Key] = stored
			}
		}
		session.lastTraffic = zabbix.CoalesceTrafficPublic(zabbix.TrafficFetchResult{
			LastValues:     lastValues,
			InterfaceItems: trafficItems,
		}, session.lastTraffic)
		for _, key := range extraKeys {
			session.triedTrafficKeys[key] = struct{}{}
		}
	}
	return statusItems
}
