import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelProps } from '@grafana/data';
import { RefreshEvent, getAppEvents, locationService } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { TopologyCanvas } from './TopologyCanvas';
import {
  HostMetadataMap,
  HostProblemMap,
  HostStatusMap,
  TopologyMap,
  TopologyPanelOptions,
  TopologyView,
  defaultOptions,
} from '../types';
import { effectiveStatusMetric } from '../utils';
import { fetchZabbixHostIcmpStatusMap, fetchZabbixHostMetadata, fetchZabbixHostProblems } from '../utils/zabbixApi';
import { fetchDashboardTopologyHosts, isIncludedInParentStats } from '../utils/submapHosts';
import { useMapHistory } from '../hooks/useMapHistory';
import { useDashboardEditMode } from '../hooks/useDashboardEditMode';
import { useDashboardVariableNav } from '../hooks/useDashboardVariableNav';
import { normalizeStoredPanelColors, resolvePanelOptionsColors } from '../utils/panelColors';
import { parseGrafanaRefreshSeconds, readDashboardRefreshSeconds } from '../utils/dashboardRefresh';

export interface Props extends PanelProps<TopologyPanelOptions> {}

/** Persiste hostid + nome/IP atuais do Zabbix no mapa (migrate + rename). */
function syncMapWithZabbixMeta(map: TopologyMap, meta: HostMetadataMap): TopologyMap | null {
  let changed = false;
  const nodes = map.nodes.map((node) => {
    if ((node.type ?? 'host') !== 'host') {
      return node;
    }
    const name = node.zabbixHost?.trim();
    const hostId = node.zabbixHostId != null ? String(node.zabbixHostId).trim() : '';
    const entry = (hostId && meta[hostId]) || (name ? meta[name] : undefined);
    if (!entry) {
      return node;
    }

    const nextId = (entry.hostid != null ? String(entry.hostid).trim() : '') || hostId;
    const nextName = entry.name?.trim() || name;
    const nextIp = entry.ip?.trim();
    const patch: typeof node = { ...node };
    let nodeChanged = false;

    if (nextId && nextId !== hostId) {
      patch.zabbixHostId = nextId;
      nodeChanged = true;
    }
    if (nextName && nextName !== name) {
      patch.zabbixHost = nextName;
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

export function TopologyPanel({ options, width, height, onOptionsChange, eventBus }: Props) {
  const theme = useTheme2();
  const dashboardEditing = useDashboardEditMode();
  useDashboardVariableNav(options.dashboardNavVariable?.trim() || 'mapa');

  const [fetchedMeta, setFetchedMeta] = useState<HostMetadataMap>({});
  const [icmpStatusMap, setIcmpStatusMap] = useState<HostStatusMap>({});
  const [icmpFetchDone, setIcmpFetchDone] = useState(false);
  const [problemMap, setProblemMap] = useState<HostProblemMap>({});
  const [submapHosts, setSubmapHosts] = useState<Record<string, string[] | null | undefined>>({});
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number | null>(() => readDashboardRefreshSeconds());
  const [refreshCountdown, setRefreshCountdown] = useState<number | null>(() => readDashboardRefreshSeconds());

  const latestOptionsRef = useRef(options);
  latestOptionsRef.current = options;
  const statusFetchGen = useRef(0);

  const resolvedOptions = useMemo(() => {
    const merged = {
      ...defaultOptions(),
      ...options,
      ...(options.map ? { map: options.map } : {}),
    };
    return resolvePanelOptionsColors(merged, theme);
  }, [options, theme]);

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
    const hostIds = new Set<string>();
    const hostNames = new Set<string>();
    for (const node of resolvedOptions.map.nodes) {
      if ((node.type ?? 'host') !== 'host') {
        continue;
      }
      const id = node.zabbixHostId != null ? String(node.zabbixHostId).trim() : '';
      const name = node.zabbixHost?.trim();
      if (id) {
        hostIds.add(id);
      }
      if (name) {
        hostNames.add(name);
      }
    }
    for (const hosts of Object.values(submapHosts)) {
      if (hosts === undefined || hosts === null) {
        continue;
      }
      for (const host of hosts) {
        const key = host.trim();
        if (!key) {
          continue;
        }
        if (/^\d+$/.test(key)) {
          hostIds.add(key);
        } else {
          hostNames.add(key);
        }
      }
    }
    return {
      hostIds: [...hostIds].sort(),
      hostNames: [...hostNames].sort(),
    };
  }, [resolvedOptions.map.nodes, submapHosts]);

  const mapHostRefsRef = useRef(mapHostRefs);
  mapHostRefsRef.current = mapHostRefs;

  const mapHostRefsKey = useMemo(
    () => `${mapHostRefs.hostIds.join(',')}|${mapHostRefs.hostNames.join(',')}`,
    [mapHostRefs]
  );

  /** Lê ICMP + problemas no Zabbix agora (botão Atualizar, auto-refresh ou timer). */
  const fetchLiveStatus = useCallback(async () => {
    const uid = latestOptionsRef.current.zabbixDatasourceUid?.trim();
    const refs = mapHostRefsRef.current;
    if (!uid || (!refs.hostIds.length && !refs.hostNames.length)) {
      return;
    }
    const gen = ++statusFetchGen.current;
    const metric = effectiveStatusMetric(latestOptionsRef.current);
    const useProblems = latestOptionsRef.current.useZabbixProblems !== false;

    try {
      const [status, problems] = await Promise.all([
        fetchZabbixHostIcmpStatusMap(uid, refs.hostNames, metric, refs.hostIds),
        useProblems
          ? fetchZabbixHostProblems(uid, undefined, refs.hostNames, refs.hostIds)
          : Promise.resolve({} as HostProblemMap),
      ]);
      if (gen !== statusFetchGen.current) {
        return;
      }
      setIcmpFetchDone(true);
      if (Object.keys(status).length > 0) {
        // Substitui o mapa: evita ficar vermelho com valor antigo se o fetch atual omitir o host
        setIcmpStatusMap(status);
      }
      setProblemMap(useProblems ? problems : {});
      setRefreshTick((t) => t + 1);
    } catch {
      // mantém último status conhecido
    }
  }, []);

  // Botão Atualizar + auto-refresh do Grafana
  useEffect(() => {
    const onRefresh = () => {
      void fetchLiveStatus();
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
  }, [eventBus, fetchLiveStatus]);

  // Intervalo do seletor (?refresh=5s)
  useEffect(() => {
    const syncInterval = () => {
      setRefreshIntervalSec(parseGrafanaRefreshSeconds(locationService.getSearchObject().refresh));
    };
    syncInterval();
    return locationService.getHistory().listen(syncInterval);
  }, []);

  // Contagem regressiva na legenda
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

  // Carga inicial + polling contínuo (intervalo do dashboard ou 5s)
  useEffect(() => {
    void fetchLiveStatus();
    const sec = refreshIntervalSec ?? 5;
    const timer = window.setInterval(() => {
      void fetchLiveStatus();
    }, Math.max(5, sec) * 1000);
    return () => window.clearInterval(timer);
  }, [
    fetchLiveStatus,
    mapHostRefsKey,
    resolvedOptions.zabbixDatasourceUid,
    resolvedOptions.statusMetric,
    resolvedOptions.useZabbixProblems,
    refreshIntervalSec,
  ]);

  const submapNodes = useMemo(() => {
    return resolvedOptions.map.nodes.filter((n) => n.type === 'submap' && n.submapUid?.trim());
  }, [resolvedOptions.map.nodes]);

  const submapFetchKey = useMemo(
    () =>
      submapNodes
        .map((n) => `${n.id}\0${n.submapUid}\0${isIncludedInParentStats(n) ? '1' : '0'}`)
        .join('\n'),
    [submapNodes]
  );

  useEffect(() => {
    if (!submapNodes.length) {
      setSubmapHosts({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(
        submapNodes.map(async (node) => {
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
        setSubmapHosts(Object.fromEntries(entries));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submapFetchKey]);

  useEffect(() => {
    const uid = resolvedOptions.zabbixDatasourceUid;
    if (!uid || (!mapHostRefs.hostIds.length && !mapHostRefs.hostNames.length)) {
      setFetchedMeta({});
      return;
    }
    let cancelled = false;
    void fetchZabbixHostMetadata(uid, undefined, mapHostRefs.hostNames, mapHostRefs.hostIds).then(
      (meta) => {
        if (!cancelled) {
          setFetchedMeta(meta);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [mapHostRefsKey, mapHostRefs.hostIds, mapHostRefs.hostNames, resolvedOptions.zabbixDatasourceUid, refreshTick]);

  useEffect(() => {
    if (!onOptionsChange || !Object.keys(fetchedMeta).length) {
      return;
    }
    const synced = syncMapWithZabbixMeta(latestOptionsRef.current.map, fetchedMeta);
    if (synced) {
      onOptionsChange({ ...latestOptionsRef.current, map: synced });
    }
  }, [fetchedMeta, onOptionsChange]);

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
        map={resolvedOptions.map}
        storedMap={resolvedOptions.map}
        options={resolvedOptions}
        statusMap={icmpStatusMap}
        regionStatusMap={icmpStatusMap}
        icmpReady={icmpFetchDone}
        hostMetadata={fetchedMeta}
        problemMap={problemMap}
        submapHosts={submapHosts}
        refreshCountdown={refreshCountdown}
        refreshIntervalSec={refreshIntervalSec}
        onMapChange={dashboardEditing ? commitChange : undefined}
        onViewChange={dashboardEditing ? handleViewChange : undefined}
        onUndo={dashboardEditing ? undo : undefined}
        onRedo={dashboardEditing ? redo : undefined}
        canUndo={dashboardEditing && canUndo}
        canRedo={dashboardEditing && canRedo}
      />
    </div>
  );
}
