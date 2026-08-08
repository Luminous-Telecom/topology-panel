import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelProps } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { TopologyCanvas } from './TopologyCanvas';
import { HostMetadataMap, HostProblemMap, HostStatusMap, TopologyMap, TopologyPanelOptions, TopologyView, defaultOptions } from '../types';
import {
  effectiveStatusMetric,
  extractHostMetadataFromData,
  extractHostStatus,
  extractQueryHosts,
  lookupHostStatus,
  mergeMapWithQueryHosts,
  mergeStatusWithProblems,
} from '../utils';
import { fetchZabbixHostMetadata, fetchZabbixHostProblems } from '../utils/zabbixApi';
import { fetchDashboardTopologyHosts } from '../utils/submapHosts';
import { useMapHistory } from '../hooks/useMapHistory';

export interface Props extends PanelProps<TopologyPanelOptions> {}

const PROBLEM_REFRESH_MS = 60_000;

export function TopologyPanel({ options, data, width, height, onOptionsChange }: Props) {
  const theme = useTheme2();
  const [fetchedMeta, setFetchedMeta] = useState<HostMetadataMap>({});
  const [problemMap, setProblemMap] = useState<HostProblemMap>({});
  const [submapHosts, setSubmapHosts] = useState<Record<string, string[]>>({});
  const latestOptionsRef = useRef(options);
  latestOptionsRef.current = options;
  /** Mantém último status conhecido entre refreshes da query (evita flash cinza). */
  const statusCacheRef = useRef<HostStatusMap>({});

  const resolvedOptions = useMemo(() => {
    return {
      ...defaultOptions(),
      ...options,
      map: options.map ?? { width: 1200, height: 800, nodes: [], links: [] },
    };
  }, [options]);

  const queryHosts = useMemo(
    () => extractQueryHosts(data, resolvedOptions),
    [data, resolvedOptions]
  );

  const mapHostNames = useMemo(() => {
    const names = new Set<string>();
    for (const node of resolvedOptions.map.nodes) {
      if ((node.type ?? 'host') === 'host' && node.zabbixHost?.trim()) {
        names.add(node.zabbixHost.trim());
      }
    }
    for (const hosts of Object.values(submapHosts)) {
      for (const host of hosts) {
        const key = host.trim();
        if (key) {
          names.add(key);
        }
      }
    }
    for (const host of queryHosts) {
      names.add(host);
    }
    return [...names];
  }, [queryHosts, resolvedOptions.map.nodes, submapHosts]);

  const dataMeta = useMemo(
    () => extractHostMetadataFromData(data, resolvedOptions),
    [data, resolvedOptions]
  );

  const submapNodes = useMemo(() => {
    return resolvedOptions.map.nodes.filter((n) => n.type === 'submap' && n.submapUid?.trim());
  }, [resolvedOptions.map.nodes]);

  useEffect(() => {
    if (!submapNodes.length) {
      setSubmapHosts({});
      return;
    }

    let cancelled = false;

    const load = async () => {
      const entries = await Promise.all(
        submapNodes.map(async (node) => {
          const hosts = await fetchDashboardTopologyHosts(node.submapUid!.trim());
          return [node.id, hosts] as const;
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
  }, [submapNodes]);

  useEffect(() => {
    const uid = resolvedOptions.zabbixDatasourceUid;
    if (!uid || !queryHosts.length) {
      setFetchedMeta({});
      return;
    }

    let cancelled = false;
    fetchZabbixHostMetadata(uid, resolvedOptions.zabbixGroupFilter, queryHosts).then((meta) => {
      if (!cancelled) {
        setFetchedMeta(meta);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [queryHosts, resolvedOptions.zabbixDatasourceUid, resolvedOptions.zabbixGroupFilter]);

  useEffect(() => {
    const uid = resolvedOptions.zabbixDatasourceUid;
    const useProblems = resolvedOptions.useZabbixProblems !== false;
    if (!uid || !useProblems) {
      setProblemMap({});
      return;
    }

    let cancelled = false;

    const load = () => {
      const groupFilter = submapNodes.length ? undefined : resolvedOptions.zabbixGroupFilter;
      void fetchZabbixHostProblems(uid, groupFilter, mapHostNames).then((problems) => {
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
  }, [
    mapHostNames,
    resolvedOptions.useZabbixProblems,
    resolvedOptions.zabbixDatasourceUid,
    resolvedOptions.zabbixGroupFilter,
    submapNodes.length,
  ]);

  const hostMetadata = useMemo(
    () => ({ ...dataMeta, ...fetchedMeta }),
    [dataMeta, fetchedMeta]
  );

  const displayMap = useMemo(() => {
    if (resolvedOptions.showQueryHostsOnMap === false) {
      return resolvedOptions.map;
    }
    return mergeMapWithQueryHosts(resolvedOptions.map, queryHosts, hostMetadata);
  }, [resolvedOptions.map, resolvedOptions.showQueryHostsOnMap, queryHosts, hostMetadata]);

  const statusMap = useMemo(() => {
    const fromQuery = extractHostStatus(data, resolvedOptions);
    const cache = statusCacheRef.current;

    for (const [host, v] of Object.entries(fromQuery)) {
      if (v !== null && v !== undefined && !Number.isNaN(Number(v))) {
        cache[host] = v;
      }
    }

    const wanted = new Set(mapHostNames.map((h) => h.trim().toLowerCase()).filter(Boolean));
    for (const key of Object.keys(cache)) {
      if (!wanted.has(key.toLowerCase())) {
        delete cache[key];
      }
    }

    const display: HostStatusMap = { ...cache };
    for (const host of mapHostNames) {
      const v = lookupHostStatus(cache, host, hostMetadata);
      if (v !== null && v !== undefined) {
        display[host] = v;
      }
    }

    if (resolvedOptions.useZabbixProblems === false) {
      return display;
    }
    return mergeStatusWithProblems(
      display,
      problemMap,
      mapHostNames,
      resolvedOptions.offlineThreshold,
      effectiveStatusMetric(resolvedOptions)
    );
  }, [data, hostMetadata, mapHostNames, problemMap, resolvedOptions]);

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
        map={displayMap}
        storedMap={resolvedOptions.map}
        options={resolvedOptions}
        statusMap={statusMap}
        problemMap={problemMap}
        submapHosts={submapHosts}
        onMapChange={commitChange}
        onViewChange={handleViewChange}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />
    </div>
  );
}
