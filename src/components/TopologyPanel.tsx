import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelProps } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { TopologyCanvas } from './TopologyCanvas';
import { HostMetadataMap, HostProblemMap, HostStatusMap, TopologyMap, TopologyPanelOptions, TopologyView, defaultOptions } from '../types';
import {
  effectiveStatusMetric,
  lookupHostStatus,
} from '../utils';
import { fetchZabbixHostIcmpStatusMap, fetchZabbixHostMetadata, fetchZabbixHostProblems } from '../utils/zabbixApi';
import { fetchDashboardTopologyHosts, isIncludedInParentStats } from '../utils/submapHosts';
import { useMapHistory } from '../hooks/useMapHistory';
import { useDashboardEditMode } from '../hooks/useDashboardEditMode';
import { useDashboardVariableNav } from '../hooks/useDashboardVariableNav';
import { normalizeStoredPanelColors, resolvePanelOptionsColors } from '../utils/panelColors';

export interface Props extends PanelProps<TopologyPanelOptions> {}

const PROBLEM_REFRESH_MS = 60_000;
const ICMP_REFRESH_MS = 60_000;

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

  const mapHostNames = useMemo(() => {
    const names = new Set<string>();
    for (const node of resolvedOptions.map.nodes) {
      if ((node.type ?? 'host') === 'host' && node.zabbixHost?.trim()) {
        names.add(node.zabbixHost.trim());
      }
    }
    for (const hosts of Object.values(submapHosts)) {
      if (hosts === undefined || hosts === null) {
        continue;
      }
      for (const host of hosts) {
        const key = host.trim();
        if (key) {
          names.add(key);
        }
      }
    }
    return [...names];
  }, [resolvedOptions.map.nodes, submapHosts]);

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
    if (!uid || !mapHostNames.length) {
      setFetchedMeta({});
      return;
    }

    let cancelled = false;
    fetchZabbixHostMetadata(uid, undefined, mapHostNames).then((meta) => {
      if (!cancelled) {
        setFetchedMeta(meta);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mapHostNames, resolvedOptions.zabbixDatasourceUid]);

  useEffect(() => {
    const uid = resolvedOptions.zabbixDatasourceUid;
    if (!uid || !mapHostNames.length) {
      setIcmpStatusMap({});
      setIcmpFetchDone(false);
      return;
    }

    let cancelled = false;
    const metric = effectiveStatusMetric(resolvedOptions);
    const wanted = new Set(mapHostNames.map((h) => h.trim().toLowerCase()).filter(Boolean));

    const load = () => {
      void fetchZabbixHostIcmpStatusMap(uid, mapHostNames, metric).then((status) => {
        if (cancelled) {
          return;
        }
        setIcmpFetchDone(true);
        setIcmpStatusMap((prev) => {
          const next: HostStatusMap = { ...prev, ...status };
          for (const key of Object.keys(next)) {
            if (!wanted.has(key.toLowerCase())) {
              delete next[key];
            }
          }
          return next;
        });
      });
    };

    load();
    const timer = window.setInterval(load, ICMP_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mapHostNames, resolvedOptions.zabbixDatasourceUid, resolvedOptions.statusMetric]);

  useEffect(() => {
    const uid = resolvedOptions.zabbixDatasourceUid;
    const useProblems = resolvedOptions.useZabbixProblems !== false;
    if (!uid || !useProblems || !mapHostNames.length) {
      setProblemMap({});
      return;
    }

    let cancelled = false;

    const load = () => {
      void fetchZabbixHostProblems(uid, undefined, mapHostNames).then((problems) => {
        if (!cancelled) {
          setProblemMap(problems);
        }
      });
    };

    load();
    const timer = window.setInterval(load, PROBLEM_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mapHostNames, resolvedOptions.useZabbixProblems, resolvedOptions.zabbixDatasourceUid]);

  const hostMetadata = fetchedMeta;

  const icmpStatusForRegions = useMemo(() => {
    const display: HostStatusMap = {};
    for (const host of mapHostNames) {
      const v = lookupHostStatus(icmpStatusMap, host, hostMetadata);
      if (v !== null && v !== undefined) {
        display[host] = v;
      }
    }
    return display;
  }, [hostMetadata, icmpStatusMap, mapHostNames]);

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
