import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyFieldOverrides, LoadingState, PanelProps } from '@grafana/data';
import { RefreshEvent, getAppEvents, locationService } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { TopologyCanvas } from './TopologyCanvas';
import {
  HostDisplayMap,
  HostMetadataMap,
  HostProblemMap,
  HostStatusMap,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
  TopologyView,
  defaultOptions,
} from '../types';
import {
  collectSubmapQueryRefIds,
  collectQueryRefIdsFromPanelData,
  collectQueryRefInfosFromPanelData,
  effectiveStatusMetric,
  extractDisplayQueryHosts,
  extractHostDisplay,
  extractHostDisplayByRefId,
  extractHostMetadataFromData,
  isIpv4,
  mergeMapWithQueryHosts,
  resolveDisplayQueryRefIds,
  resolveZabbixDatasourceUid,
  resolveZabbixGroupNamesFromPanelData,
  sameQueryRefInfos,
  sameStringList,
} from '../utils';
import { fetchZabbixHostProblems } from '../utils/zabbixApi';
import { fetchDashboardTopologyHosts, isIncludedInParentStats } from '../utils/submapHosts';
import { useMapHistory } from '../hooks/useMapHistory';
import { useDashboardEditMode } from '../hooks/useDashboardEditMode';
import { useDashboardVariableNav } from '../hooks/useDashboardVariableNav';
import { normalizeStoredPanelColors, resolvePanelOptionsColors } from '../utils/panelColors';
import { parseGrafanaRefreshSeconds, readDashboardRefreshSeconds } from '../utils/dashboardRefresh';

export interface Props extends PanelProps<TopologyPanelOptions> {}

/** Persiste nome/IP da Query no mapa salvo (migrate + rename). */
function syncMapWithQueryMeta(map: TopologyMap, meta: HostMetadataMap): TopologyMap | null {
  let changed = false;
  const nodes = map.nodes.map((node) => {
    if ((node.type ?? 'host') !== 'host') {
      return node;
    }
    const name = node.zabbixHost?.trim();
    const label = node.label?.trim();
    const subtitleIp = node.subtitle?.trim() && isIpv4(node.subtitle) ? node.subtitle.trim() : undefined;
    const entry =
      (name && meta[name]) ||
      (label && meta[label]) ||
      (subtitleIp && meta[subtitleIp]) ||
      undefined;
    if (!entry) {
      if (node.zabbixHostId) {
        changed = true;
        const { zabbixHostId: _legacy, ...rest } = node;
        return rest;
      }
      return node;
    }

    const nextName = entry.name?.trim() || name || label;
    const nextIp = entry.ip?.trim();
    const nextHostKey = nextIp && isIpv4(nextIp) ? nextIp : nextName && !isIpv4(nextName) ? nextName : name;
    const patch: typeof node = { ...node };
    let nodeChanged = false;

    if (node.zabbixHostId) {
      patch.zabbixHostId = undefined;
      nodeChanged = true;
    }
    if (nextHostKey && nextHostKey !== name) {
      patch.zabbixHost = nextHostKey;
      nodeChanged = true;
    }
    if (nextName && nextName !== (node.label?.trim() || '')) {
      patch.label = nextName;
      nodeChanged = true;
    }
    if (nextIp && nextIp !== (node.subtitle?.trim() || '')) {
      patch.subtitle = nextIp;
      nodeChanged = true;
    }

    if (nodeChanged) {
      changed = true;
      return patch;
    }
    return node;
  });

  return changed ? { ...map, nodes } : null;
}

/** Lista de hosts para agregar status do submapa (query refId ou dashboard filho). */
function submapHostListForNode(
  node: TopologyNode,
  hostDisplayByRefId: Record<string, HostDisplayMap>,
  queryReady: boolean,
  fetchedFromDashboard: string[] | null | undefined
): string[] | null | undefined {
  const refId = node.queryRefId?.trim();
  if (refId) {
    if (!queryReady) {
      return undefined;
    }
    const bucket = hostDisplayByRefId[refId] ?? hostDisplayByRefId[refId.toUpperCase()];
    if (!bucket) {
      return [];
    }
    return Object.keys(bucket).sort((a, b) => a.localeCompare(b));
  }
  return fetchedFromDashboard;
}

export function TopologyPanel({
  options,
  data,
  fieldConfig,
  replaceVariables,
  timeZone,
  width,
  height,
  onOptionsChange,
  eventBus,
}: Props) {
  const theme = useTheme2();
  const dashboardEditing = useDashboardEditMode();
  useDashboardVariableNav(options.dashboardNavVariable?.trim() || 'mapa');

  const [problemMap, setProblemMap] = useState<HostProblemMap>({});
  /** Hosts lidos do JSON do dashboard filho (submapas sem queryRefId). */
  const [fetchedSubmapHosts, setFetchedSubmapHosts] = useState<
    Record<string, string[] | null | undefined>
  >({});
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number | null>(() => readDashboardRefreshSeconds());
  const [refreshCountdown, setRefreshCountdown] = useState<number | null>(() => readDashboardRefreshSeconds());

  const latestOptionsRef = useRef(options);
  latestOptionsRef.current = options;
  const problemFetchGen = useRef(0);

  /** Aplica Thresholds / Value mappings / cor nos frames da Query. */
  const mappedData = useMemo(() => {
    if (!data?.series?.length) {
      return data;
    }
    const series = applyFieldOverrides({
      data: data.series,
      fieldConfig: fieldConfig ?? { defaults: {}, overrides: [] },
      replaceVariables: replaceVariables ?? ((v) => v),
      theme,
      timeZone: timeZone || 'browser',
    });
    return { ...data, series };
  }, [data, fieldConfig, replaceVariables, theme, timeZone]);

  const resolvedOptions = useMemo(() => {
    const merged = {
      ...defaultOptions(),
      ...options,
      ...(options.map ? { map: options.map } : {}),
    };
    const colored = resolvePanelOptionsColors(merged, theme);
    return {
      ...colored,
      statusMetric: effectiveStatusMetric(undefined, mappedData),
    };
  }, [options, theme, mappedData]);

  const hostDisplayByRefId = useMemo(() => extractHostDisplayByRefId(mappedData), [mappedData]);

  const queryRefIdsAvailable = useMemo(
    () => collectQueryRefIdsFromPanelData(mappedData),
    [mappedData]
  );

  const queryRefInfosAvailable = useMemo(
    () => collectQueryRefInfosFromPanelData(mappedData),
    [mappedData]
  );

  useEffect(() => {
    if (!onOptionsChange) {
      return;
    }
    const currentIds = latestOptionsRef.current.queryRefIdsAvailable ?? [];
    const currentInfos = latestOptionsRef.current.queryRefInfosAvailable ?? [];
    if (
      sameStringList(currentIds, queryRefIdsAvailable) &&
      sameQueryRefInfos(currentInfos, queryRefInfosAvailable)
    ) {
      return;
    }
    onOptionsChange({
      ...latestOptionsRef.current,
      queryRefIdsAvailable,
      queryRefInfosAvailable,
    });
  }, [onOptionsChange, queryRefIdsAvailable, queryRefInfosAvailable]);

  const submapQueryRefIds = useMemo(
    () => collectSubmapQueryRefIds(resolvedOptions.map),
    [resolvedOptions.map]
  );

  const displayQueryRefIds = useMemo(
    () => resolveDisplayQueryRefIds(resolvedOptions),
    [resolvedOptions.displayQueryRefIds, resolvedOptions.displayQueryRefId]
  );

  const displayQueryHosts = useMemo(
    () => extractDisplayQueryHosts(mappedData, submapQueryRefIds, displayQueryRefIds),
    [mappedData, submapQueryRefIds, displayQueryRefIds]
  );

  const dataMeta = useMemo(() => extractHostMetadataFromData(mappedData), [mappedData]);

  const hostDisplay = useMemo(() => extractHostDisplay(mappedData), [mappedData]);

  const statusMap = useMemo(() => {
    const map: HostStatusMap = {};
    for (const [host, info] of Object.entries(hostDisplay)) {
      map[host] = info.value;
    }
    return map;
  }, [hostDisplay]);

  const hostMetadata = dataMeta;

  const displayMap = useMemo(
    () => mergeMapWithQueryHosts(resolvedOptions.map, displayQueryHosts, hostMetadata),
    [resolvedOptions.map, displayQueryHosts, hostMetadata]
  );

  const zabbixDatasourceUid = useMemo(() => resolveZabbixDatasourceUid(mappedData), [mappedData]);

  const zabbixGroupNames = useMemo(
    () => resolveZabbixGroupNamesFromPanelData(mappedData, displayQueryRefIds),
    [mappedData, displayQueryRefIds]
  );

  const zabbixDatasourceUidRef = useRef(zabbixDatasourceUid);
  zabbixDatasourceUidRef.current = zabbixDatasourceUid;

  const queryReady =
    data.state === LoadingState.Done ||
    data.state === LoadingState.Streaming ||
    Object.keys(statusMap).length > 0;

  const submapNodes = useMemo(() => {
    return resolvedOptions.map.nodes.filter((n) => n.type === 'submap' && n.submapUid?.trim());
  }, [resolvedOptions.map.nodes]);

  const submapHosts = useMemo(() => {
    const result: Record<string, string[] | null | undefined> = {};
    for (const node of submapNodes) {
      result[node.id] = submapHostListForNode(
        node,
        hostDisplayByRefId,
        queryReady,
        fetchedSubmapHosts[node.id]
      );
    }
    return result;
  }, [submapNodes, hostDisplayByRefId, queryReady, fetchedSubmapHosts]);

  useEffect(() => {
    if (!onOptionsChange) {
      return;
    }
    const merged = {
      ...defaultOptions(),
      ...options,
      ...(options.map ? { map: options.map } : {}),
    };
    const { options: normalized, changed } = normalizeStoredPanelColors(merged, theme);
    if (changed) {
      onOptionsChange(normalized);
    }
  }, [options, theme, onOptionsChange]);

  const mapHostRefs = useMemo(() => {
    const hostNames = new Set<string>();
    const addHost = (raw: string) => {
      const key = raw.trim();
      if (!key) {
        return;
      }
      hostNames.add(key);
    };
    for (const node of displayMap.nodes) {
      if ((node.type ?? 'host') !== 'host') {
        continue;
      }
      const subtitle = node.subtitle?.trim();
      if (subtitle && isIpv4(subtitle)) {
        addHost(subtitle);
        continue;
      }
      const hostKey = node.zabbixHost?.trim();
      if (hostKey && isIpv4(hostKey)) {
        addHost(hostKey);
        continue;
      }
      if (hostKey) {
        addHost(hostKey);
      }
    }
    for (const host of displayQueryHosts) {
      addHost(host);
    }
    for (const hosts of Object.values(submapHosts)) {
      if (hosts === undefined || hosts === null) {
        continue;
      }
      for (const host of hosts) {
        addHost(host);
      }
    }
    return {
      hostIds: [] as string[],
      hostNames: [...hostNames].sort(),
    };
  }, [displayMap.nodes, displayQueryHosts, submapHosts]);

  const mapHostRefsRef = useRef(mapHostRefs);
  mapHostRefsRef.current = mapHostRefs;

  const mapHostRefsKey = useMemo(
    () => `${mapHostRefs.hostIds.join(',')}|${mapHostRefs.hostNames.join(',')}`,
    [mapHostRefs]
  );

  const fetchProblems = useCallback(async () => {
    const uid = zabbixDatasourceUidRef.current?.trim();
    const refs = mapHostRefsRef.current;
    const useProblems = latestOptionsRef.current.useZabbixProblems !== false;
    if (!useProblems) {
      setProblemMap({});
      return;
    }
    if (!uid || (!refs.hostIds.length && !refs.hostNames.length)) {
      return;
    }
    const gen = ++problemFetchGen.current;
    try {
      const problems = await fetchZabbixHostProblems(uid, undefined, refs.hostNames, refs.hostIds);
      if (gen !== problemFetchGen.current) {
        return;
      }
      setProblemMap(problems);
      setRefreshTick((t) => t + 1);
    } catch {
      // mantém último mapa de problemas
    }
  }, []);

  useEffect(() => {
    setRefreshTick((t) => t + 1);
  }, [mappedData]);

  useEffect(() => {
    const onRefresh = () => {
      void fetchProblems();
    };
    const subs = [
      eventBus.getStream(RefreshEvent).subscribe(onRefresh),
      getAppEvents().getStream(RefreshEvent).subscribe(onRefresh),
    ];
    return () => {
      for (const s of subs) {
        s.unsubscribe();
      }
    };
  }, [eventBus, fetchProblems]);

  useEffect(() => {
    const syncInterval = () => {
      setRefreshIntervalSec(parseGrafanaRefreshSeconds(locationService.getSearchObject().refresh));
    };
    syncInterval();
    return locationService.getHistory().listen(syncInterval);
  }, []);

  useEffect(() => {
    if (refreshIntervalSec == null) {
      setRefreshCountdown(null);
      return;
    }
    setRefreshCountdown(refreshIntervalSec);
    const id = window.setInterval(() => {
      setRefreshCountdown((c) => {
        if (c == null) {
          return refreshIntervalSec;
        }
        return c <= 1 ? refreshIntervalSec : c - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [refreshIntervalSec, refreshTick]);

  useEffect(() => {
    void fetchProblems();
    const sec = refreshIntervalSec ?? 5;
    const timer = window.setInterval(() => {
      void fetchProblems();
    }, Math.max(5, sec) * 1000);
    return () => window.clearInterval(timer);
  }, [fetchProblems, mapHostRefsKey, zabbixDatasourceUid, resolvedOptions.useZabbixProblems, refreshIntervalSec]);

  const legacySubmapFetchKey = useMemo(
    () =>
      submapNodes
        .filter((n) => !n.queryRefId?.trim())
        .map((n) => `${n.id}\0${n.submapUid}\0${isIncludedInParentStats(n) ? '1' : '0'}`)
        .join('\n'),
    [submapNodes]
  );

  useEffect(() => {
    const legacyNodes = submapNodes.filter((n) => !n.queryRefId?.trim());
    if (!legacyNodes.length) {
      setFetchedSubmapHosts({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(
        legacyNodes.map(async (node) => {
          try {
            const hosts = await fetchDashboardTopologyHosts(node.submapUid!.trim(), {
              includeNested: isIncludedInParentStats(node),
            });
            return [node.id, hosts] as const;
          } catch {
            return [node.id, null] as const;
          }
        })
      );
      if (!cancelled) {
        setFetchedSubmapHosts(Object.fromEntries(entries));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacySubmapFetchKey]);

  useEffect(() => {
    if (!onOptionsChange || !Object.keys(dataMeta).length) {
      return;
    }
    const synced = syncMapWithQueryMeta(latestOptionsRef.current.map, dataMeta);
    if (synced) {
      onOptionsChange({ ...latestOptionsRef.current, map: synced });
    }
  }, [dataMeta, onOptionsChange]);

  const applyMap = useCallback(
    (map: TopologyMap) => {
      onOptionsChange({ ...latestOptionsRef.current, map });
    },
    [onOptionsChange]
  );

  const { commitChange, undo, redo, canUndo, canRedo } = useMapHistory(resolvedOptions.map, applyMap);

  const handleViewChange = useCallback(
    (view: TopologyView) => {
      onOptionsChange({ ...latestOptionsRef.current, view });
    },
    [onOptionsChange]
  );

  const handleShowMinimapChange = useCallback(
    (show: boolean) => {
      onOptionsChange({ ...latestOptionsRef.current, showMinimap: show });
    },
    [onOptionsChange]
  );

  const handleShowLegendChange = useCallback(
    (show: boolean) => {
      onOptionsChange({ ...latestOptionsRef.current, showLegend: show });
    },
    [onOptionsChange]
  );

  if (width < 1 || height < 1) {
    return null;
  }

  return (
    <div
      style={{
        width,
        height,
        background: theme.colors.background.primary,
        overflow: 'hidden',
        overscrollBehavior: 'none',
      }}
    >
      <TopologyCanvas
        map={displayMap}
        storedMap={resolvedOptions.map}
        options={resolvedOptions}
        zabbixDatasourceUid={zabbixDatasourceUid}
        zabbixGroupNames={zabbixGroupNames}
        statusMap={statusMap}
        hostDisplay={hostDisplay}
        regionStatusMap={statusMap}
        icmpReady={queryReady}
        hostMetadata={hostMetadata}
        problemMap={problemMap}
        submapHosts={submapHosts}
        refreshCountdown={refreshCountdown}
        refreshIntervalSec={refreshIntervalSec}
        onMapChange={dashboardEditing ? commitChange : undefined}
        onViewChange={dashboardEditing ? handleViewChange : undefined}
        onShowMinimapChange={handleShowMinimapChange}
        onShowLegendChange={handleShowLegendChange}
        onUndo={dashboardEditing ? undo : undefined}
        onRedo={dashboardEditing ? redo : undefined}
        canUndo={dashboardEditing && canUndo}
        canRedo={dashboardEditing && canRedo}
      />
    </div>
  );
}
