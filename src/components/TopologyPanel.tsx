import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelProps } from '@grafana/data';
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
import { effectiveStatusMetric, lookupHostStatus } from '../utils';
import { fetchZabbixHostIcmpStatusMap, fetchZabbixHostMetadata, fetchZabbixHostProblems } from '../utils/zabbixApi';
import { fetchDashboardTopologyHosts, isIncludedInParentStats } from '../utils/submapHosts';
import { useMapHistory } from '../hooks/useMapHistory';
import { useDashboardEditMode } from '../hooks/useDashboardEditMode';
import { useDashboardVariableNav } from '../hooks/useDashboardVariableNav';
import { normalizeStoredPanelColors, resolvePanelOptionsColors } from '../utils/panelColors';

export interface Props extends PanelProps<TopologyPanelOptions> {}

const PROBLEM_REFRESH_MS = 60_000;
const ICMP_REFRESH_MS = 60_000;

/** Persiste hostid + nome/IP atuais do Zabbix no mapa (migrate + rename). */
function syncMapWithZabbixMeta(map: TopologyMap, meta: HostMetadataMap): TopologyMap | null {
  let changed = false;
  const nodes = map.nodes.map((node) => {
    if ((node.type ?? 'host') !== 'host') {
      return node;
    }
    const name = node.zabbixHost?.trim();
    const hostId = node.zabbixHostId?.trim();
    const entry = (hostId && meta[hostId]) || (name ? meta[name] : undefined);
    if (!entry) {
      return node;
    }

    const nextId = entry.hostid?.trim() || hostId;
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

export function TopologyPanel({ options, width, height, onOptionsChange }: Props) {
  const theme = useTheme2();
  const dashboardEditing = useDashboardEditMode();
  /** Variável Grafana `$mapa` na barra do painel de controle → navega entre dashboards */
  useDashboardVariableNav(options.dashboardNavVariable?.trim() || 'mapa');
  const [fetchedMeta, setFetchedMeta] = useState<HostMetadataMap>({});
  const [icmpStatusMap, setIcmpStatusMap] = useState<HostStatusMap>({});
  const [icmpFetchDone, setIcmpFetchDone] = useState(false);
  const [problemMap, setProblemMap] = useState<HostProblemMap>({});
  const [submapHosts, setSubmapHosts] = useState<Record<string, string[] | null | undefined>>({});
  const latestOptionsRef = useRef(options);
  latestOptionsRef.current = options;

  const resolvedOptions = useMemo(() => {
    const merged = {
      ...defaultOptions(),
      ...options,
      ...(options.map ? { map: options.map } : {}),
    };
    return resolvePanelOptionsColors(merged, theme);
  }, [options, theme]);

  /** Persiste hex no dashboard quando opções ainda têm nomes da paleta (ex.: light-green). */
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
      const id = node.zabbixHostId?.trim();
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
        // extractTopologyHostNames agora pode devolver hostid ou nome
        if (/^\d+$/.test(key)) {
          hostIds.add(key);
        } else {
          hostNames.add(key);
        }
      }
    }
    return { hostIds: [...hostIds], hostNames: [...hostNames] };
  }, [resolvedOptions.map.nodes, submapHosts]);

  const mapHostKeys = useMemo(
    () => [...mapHostRefs.hostIds, ...mapHostRefs.hostNames],
    [mapHostRefs]
  );

  const submapNodes = useMemo(() => {
    return resolvedOptions.map.nodes.filter((n) => n.type === 'submap' && n.submapUid?.trim());
  }, [resolvedOptions.map.nodes]);

  /** Inclui o flag para refetch ao ligar/desligar status do submapa. */
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
            // Desativado: só hosts diretos do dashboard (ignora submapas internos)
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
    // submapFetchKey cobre uid + includeInParentStats; submapNodes traz os nós
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submapFetchKey]);

  useEffect(() => {
    const uid = resolvedOptions.zabbixDatasourceUid;
    if (!uid || (!mapHostRefs.hostIds.length && !mapHostRefs.hostNames.length)) {
      setFetchedMeta({});
      return;
    }

    let cancelled = false;
    fetchZabbixHostMetadata(uid, undefined, mapHostRefs.hostNames, mapHostRefs.hostIds).then((meta) => {
      if (!cancelled) {
        setFetchedMeta(meta);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mapHostRefs, resolvedOptions.zabbixDatasourceUid]);

  /** Migra hostid e sincroniza nome/IP quando o Zabbix renomeia o host. */
  useEffect(() => {
    if (!onOptionsChange || !Object.keys(fetchedMeta).length) {
      return;
    }
    const synced = syncMapWithZabbixMeta(latestOptionsRef.current.map, fetchedMeta);
    if (synced) {
      onOptionsChange({ ...latestOptionsRef.current, map: synced });
    }
  }, [fetchedMeta, onOptionsChange]);

  useEffect(() => {
    const uid = resolvedOptions.zabbixDatasourceUid;
    if (!uid || (!mapHostRefs.hostIds.length && !mapHostRefs.hostNames.length)) {
      setIcmpStatusMap({});
      setIcmpFetchDone(false);
      return;
    }

    let cancelled = false;
    const metric = effectiveStatusMetric(resolvedOptions);

    const load = () => {
      void fetchZabbixHostIcmpStatusMap(uid, mapHostRefs.hostNames, metric, mapHostRefs.hostIds).then(
        (status) => {
          if (cancelled) {
            return;
          }
          setIcmpFetchDone(true);
          setIcmpStatusMap(status);
        }
      );
    };

    load();
    const timer = window.setInterval(load, ICMP_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mapHostRefs, resolvedOptions.zabbixDatasourceUid, resolvedOptions.statusMetric]);

  useEffect(() => {
    const uid = resolvedOptions.zabbixDatasourceUid;
    const useProblems = resolvedOptions.useZabbixProblems !== false;
    if (!uid || !useProblems || (!mapHostRefs.hostIds.length && !mapHostRefs.hostNames.length)) {
      setProblemMap({});
      return;
    }

    let cancelled = false;

    const load = () => {
      void fetchZabbixHostProblems(uid, undefined, mapHostRefs.hostNames, mapHostRefs.hostIds).then(
        (problems) => {
          if (!cancelled) {
            setProblemMap(problems);
          }
        }
      );
    };

    load();
    const timer = window.setInterval(load, PROBLEM_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mapHostRefs, resolvedOptions.useZabbixProblems, resolvedOptions.zabbixDatasourceUid]);

  const hostMetadata = fetchedMeta;

  const icmpStatusForRegions = useMemo(() => {
    const display: HostStatusMap = {};
    for (const host of mapHostKeys) {
      const meta = hostMetadata[host];
      const v = lookupHostStatus(icmpStatusMap, host, hostMetadata, meta?.hostid);
      if (v !== null && v !== undefined) {
        display[host] = v;
      }
    }
    // Garante indexação por hostid dos nós do mapa
    for (const node of resolvedOptions.map.nodes) {
      if ((node.type ?? 'host') !== 'host') {
        continue;
      }
      const id = node.zabbixHostId?.trim();
      if (!id || display[id] !== undefined) {
        continue;
      }
      const v = lookupHostStatus(icmpStatusMap, node.zabbixHost ?? '', hostMetadata, id);
      if (v !== null && v !== undefined) {
        display[id] = v;
      }
    }
    return display;
  }, [hostMetadata, icmpStatusMap, mapHostKeys, resolvedOptions.map.nodes]);

  const statusMap = icmpStatusForRegions;
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
        statusMap={statusMap}
        regionStatusMap={icmpStatusForRegions}
        icmpReady={icmpFetchDone}
        hostMetadata={hostMetadata}
        problemMap={problemMap}
        submapHosts={submapHosts}
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
