import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoadingState, PanelProps } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { TopologyCanvas } from './TopologyCanvas';
import {
  HostDisplayMap,
  HostMetadata,
  HostMetadataMap,
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
  canonicalizeHostKeys,
  enrichHostDisplayFromMap,
  enrichHostMetadataFromMap,
  extractDisplayQueryHosts,
  extractHostDisplay,
  extractHostDisplayByRefId,
  extractHostMetadataFromData,
  extractQueryHostOptions,
  enrichQueryHostOptionsFromMap,
  isIpv4,
  mergeMapWithQueryHosts,
  resolveDisplayQueryRefIds,
  resolveHostIp,
  resolveZabbixDatasourceUid,
  sameQueryRefInfos,
  sameStringList,
} from '../utils';
import { fetchDashboardTopologyHosts, isIncludedInParentStats } from '../utils/submapHosts';
import { useMapHistory } from '../hooks/useMapHistory';
import { useDashboardEditMode } from '../hooks/useDashboardEditMode';
import { useDashboardVariableNav } from '../hooks/useDashboardVariableNav';
import { normalizeStoredPanelColors, resolvePanelOptionsColors } from '../utils/panelColors';
import { parseGrafanaRefreshSeconds, readDashboardRefreshSeconds } from '../utils/dashboardRefresh';

export interface Props extends PanelProps<TopologyPanelOptions> {}

/** Localiza metadata da Query — IP primeiro; nome só se não houver IP. */
function findQueryMetaForNode(node: TopologyNode, meta: HostMetadataMap): HostMetadata | undefined {
  const ip = resolveHostIp(node);
  if (ip) {
    const byKey = meta[ip];
    if (byKey) {
      return byKey;
    }
    for (const entry of Object.values(meta)) {
      if (entry.ip?.trim() === ip) {
        return entry;
      }
    }
  }

  const name = node.zabbixHost?.trim();
  if (name && !isIpv4(name) && meta[name]) {
    return meta[name];
  }
  const label = node.label?.trim();
  if (label && !isIpv4(label) && meta[label]) {
    return meta[label];
  }
  return undefined;
}

/** Persiste nome/IP da Query no mapa salvo (migrate + rename). Preferência: IP. */
function syncMapWithQueryMeta(map: TopologyMap, meta: HostMetadataMap): TopologyMap | null {
  let changed = false;
  const nodes = map.nodes.map((node) => {
    if ((node.type ?? 'host') !== 'host') {
      return node;
    }
    const name = node.zabbixHost?.trim();
    const label = node.label?.trim();
    const entry = findQueryMetaForNode(node, meta);
    if (!entry) {
      if (node.zabbixHostId) {
        changed = true;
        const { zabbixHostId: _legacy, ...rest } = node;
        return rest;
      }
      return node;
    }

    const nextName = entry.name?.trim() || label || (name && !isIpv4(name) ? name : undefined);
    const nextIp = entry.ip?.trim() && isIpv4(entry.ip) ? entry.ip.trim() : resolveHostIp(node);
    const nextHostKey = nextIp || (nextName && !isIpv4(nextName) ? nextName : name);
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
  fetchedFromDashboard: string[] | null | undefined,
  hostMetadata?: HostMetadataMap
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
    return canonicalizeHostKeys(Object.keys(bucket), hostMetadata);
  }
  return fetchedFromDashboard;
}

export function TopologyPanel({
  options,
  data,
  width,
  height,
  onOptionsChange,
}: Props) {
  const theme = useTheme2();
  const dashboardEditing = useDashboardEditMode();
  useDashboardVariableNav(options.dashboardNavVariable?.trim() || 'mapa');

  /** Hosts lidos do JSON do dashboard filho (submapas sem queryRefId). */
  const [fetchedSubmapHosts, setFetchedSubmapHosts] = useState<
    Record<string, string[] | null | undefined>
  >({});
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number | null>(() => readDashboardRefreshSeconds());
  const [refreshCountdown, setRefreshCountdown] = useState<number | null>(() => readDashboardRefreshSeconds());

  const latestOptionsRef = useRef(options);
  latestOptionsRef.current = options;

  const resolvedOptions = useMemo(() => {
    const merged = {
      ...defaultOptions(),
      ...options,
      ...(options.map ? { map: options.map } : {}),
    };
    const colored = resolvePanelOptionsColors(merged, theme);
    return {
      ...colored,
    };
  }, [options, theme]);

  const statusColorOptions = useMemo(
    () => ({
      colorOnline: resolvedOptions.colorOnline,
      colorOffline: resolvedOptions.colorOffline,
      colorAlert: resolvedOptions.colorAlert,
      statusValueMappings: resolvedOptions.statusValueMappings,
    }),
    [
      resolvedOptions.colorOnline,
      resolvedOptions.colorOffline,
      resolvedOptions.colorAlert,
      resolvedOptions.statusValueMappings,
    ]
  );

  const dataMeta = useMemo(
    () => enrichHostMetadataFromMap(extractHostMetadataFromData(data), resolvedOptions.map),
    [data, resolvedOptions.map]
  );

  const hostDisplayByRefId = useMemo(() => {
    const byRef = extractHostDisplayByRefId(data, statusColorOptions);
    const enriched: Record<string, HostDisplayMap> = {};
    for (const [refId, bucket] of Object.entries(byRef)) {
      enriched[refId] = enrichHostDisplayFromMap(bucket, resolvedOptions.map, dataMeta);
    }
    return enriched;
  }, [data, statusColorOptions, resolvedOptions.map, dataMeta]);

  const queryRefIdsAvailable = useMemo(
    () => collectQueryRefIdsFromPanelData(data),
    [data]
  );

  const queryRefInfosAvailable = useMemo(
    () => collectQueryRefInfosFromPanelData(data),
    [data]
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
    [resolvedOptions.displayQueryRefIds]
  );

  const displayQueryHosts = useMemo(
    () => extractDisplayQueryHosts(data, submapQueryRefIds, displayQueryRefIds),
    [data, submapQueryRefIds, displayQueryRefIds]
  );

  const hostDisplay = useMemo(
    () =>
      enrichHostDisplayFromMap(
        extractHostDisplay(data, statusColorOptions),
        resolvedOptions.map,
        dataMeta
      ),
    [data, statusColorOptions, resolvedOptions.map, dataMeta]
  );

  const zabbixDatasourceUid = useMemo(() => resolveZabbixDatasourceUid(data), [data]);

  const hostMetadata = dataMeta;

  const queryReady =
    data.state === LoadingState.Done || data.state === LoadingState.Streaming;

  const displayMap = useMemo(
    () => mergeMapWithQueryHosts(resolvedOptions.map, displayQueryHosts, hostMetadata),
    [resolvedOptions.map, displayQueryHosts, hostMetadata]
  );

  const queryHostOptions = useMemo(
    () => enrichQueryHostOptionsFromMap(extractQueryHostOptions(data), resolvedOptions.map),
    [data, resolvedOptions.map]
  );

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
        fetchedSubmapHosts[node.id],
        hostMetadata
      );
    }
    return result;
  }, [submapNodes, hostDisplayByRefId, queryReady, fetchedSubmapHosts, hostMetadata]);

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

  useEffect(() => {
    setRefreshTick((t) => t + 1);
  }, [data]);

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
        queryHostOptions={queryHostOptions}
        hostDisplay={hostDisplay}
        queryReady={queryReady}
        hostMetadata={hostMetadata}
        submapHosts={submapHosts}
        refreshCountdown={refreshCountdown}
        refreshIntervalSec={refreshIntervalSec}
        queryData={data}
        zabbixDatasourceUid={zabbixDatasourceUid}
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
