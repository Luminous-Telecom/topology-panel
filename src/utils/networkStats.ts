import { HostMetadataMap, HostProblemMap, HostStatusMap, TopologyNode, TopologyPanelOptions, TopologyStatusMetric } from '../types';
import {
  effectiveStatusMetric,
  NodeLayout,
  lookupProblemCount,
  offlineThresholdForMetric,
  resolveNodeStatus,
} from '../utils';

export interface RegionHostStats {
  total: number;
  offline: number;
  /** Hosts online no ICMP com problema Zabbix ativo */
  alert: number;
  online: number;
  unknown: number;
  /** Falha ao carregar hosts do dashboard filho. */
  loadFailed?: boolean;
}

/** Rede: texto descritivo. Submapa: parado / alerta / online. */
export function formatRegionStats(
  stats: RegionHostStats,
  icmpReady = true,
  kind: 'network' | 'submap' = 'network'
): string {
  if (kind === 'submap') {
    if (stats.loadFailed) {
      return 'Mapa indisponível';
    }
    return `${stats.offline} / ${stats.alert} / ${stats.online}`;
  }
  if (stats.loadFailed) {
    return 'Mapa indisponível';
  }
  if (stats.total === 0) {
    return '';
  }
  if (!icmpReady) {
    return 'Carregando…';
  }
  if (stats.offline > 0) {
    const n = stats.offline;
    return `${n} parado${n > 1 ? 's' : ''} · ${stats.total} hosts`;
  }
  if (stats.alert > 0) {
    const n = stats.alert;
    return `${n} alerta${n > 1 ? 's' : ''} · ${stats.total} hosts`;
  }
  return `${stats.total} hosts · OK`;
}

function hostStatusKey(node: TopologyNode): string | undefined {
  const hostId = node.zabbixHostId?.trim();
  if (hostId) {
    return hostId;
  }
  const key = node.zabbixHost?.trim();
  return key || undefined;
}

/** Status agregado da região — só ICMP (parado = sem resposta), não alertas Zabbix. */
function resolveRegionHostStatus(
  host: string,
  statusMap: HostStatusMap,
  threshold: number,
  metric: TopologyStatusMetric,
  hostMetadata?: HostMetadataMap
): 'online' | 'offline' | 'unknown' {
  const key = host.trim();
  if (!key) {
    return 'unknown';
  }
  return resolveNodeStatus({ zabbixHost: key, zabbixHostId: key, type: 'host' }, statusMap, threshold, metric, hostMetadata);
}

export function countRegionStats(
  hostNames: string[],
  statusMap: HostStatusMap,
  threshold: number,
  options?: {
    metric?: TopologyStatusMetric;
    hostMetadata?: HostMetadataMap;
    problemMap?: HostProblemMap;
  }
): RegionHostStats {
  let offline = 0;
  let alert = 0;
  let online = 0;
  let unknown = 0;
  const seen = new Set<string>();
  const metric = options?.metric ?? 'icmp_rtt';
  const problemMap = options?.problemMap ?? {};

  for (const raw of hostNames) {
    const key = raw.trim();
    if (!key || seen.has(key.toLowerCase())) {
      continue;
    }
    seen.add(key.toLowerCase());

    const st = resolveRegionHostStatus(key, statusMap, threshold, metric, options?.hostMetadata);
    const meta = options?.hostMetadata?.[key];
    const hasAlert = lookupProblemCount(problemMap, key, meta?.hostid) > 0;

    if (st === 'offline') {
      offline++;
    } else if (st === 'online') {
      if (hasAlert) {
        alert++;
      } else {
        online++;
      }
    } else if (hasAlert) {
      // Sem ICMP, mas com problema ativo → conta como alerta
      alert++;
    } else {
      unknown++;
    }
  }
  return {
    total: seen.size,
    offline,
    alert,
    online,
    unknown,
  };
}

function pointInRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

export function hostsInsideNetwork(
  networkId: string,
  networkLayout: NodeLayout & { x: number; y: number },
  hostNodes: TopologyNode[],
  nodeLayouts: Map<string, NodeLayout & TopologyNode>
): TopologyNode[] {
  return hostNodes.filter((host) => {
    if (host.networkId?.trim() === networkId) {
      return true;
    }
    const layout = nodeLayouts.get(host.id);
    if (!layout) {
      return false;
    }
    const cx = layout.x + layout.w / 2;
    const cy = layout.y + layout.h / 2;
    return pointInRect(cx, cy, networkLayout.x, networkLayout.y, networkLayout.w, networkLayout.h);
  });
}

export function buildRegionStatsMap(
  nodes: TopologyNode[],
  nodeLayouts: Map<string, NodeLayout & TopologyNode>,
  statusMap: HostStatusMap,
  options: Pick<TopologyPanelOptions, 'statusMetric' | 'useZabbixProblems'>,
  submapHosts: Record<string, string[] | null | undefined> = {},
  hostMetadata: HostMetadataMap = {},
  problemMap: HostProblemMap = {}
): Map<string, RegionHostStats> {
  const result = new Map<string, RegionHostStats>();
  const hostNodes = nodes.filter((n) => (n.type ?? 'host') === 'host');
  const metric = effectiveStatusMetric(options);
  const threshold = offlineThresholdForMetric(metric);
  const problems = options.useZabbixProblems === false ? {} : problemMap;
  const baseStatsOptions = { metric, hostMetadata, problemMap: problems };

  for (const node of nodes) {
    if (node.type === 'submap') {
      const fetched = submapHosts[node.id];
      if (fetched === undefined) {
        // Carregando (query ou dashboard filho)
        result.set(node.id, { total: 0, offline: 0, alert: 0, online: 0, unknown: 0 });
        continue;
      }
      if (fetched === null) {
        result.set(node.id, { total: 0, offline: 0, alert: 0, online: 0, unknown: 0, loadFailed: true });
        continue;
      }
      result.set(node.id, countRegionStats(fetched, statusMap, threshold, baseStatsOptions));
      continue;
    }

    if (node.type !== 'network') {
      continue;
    }

    const layout = nodeLayouts.get(node.id);
    if (!layout) {
      continue;
    }

    const inside = hostsInsideNetwork(node.id, layout, hostNodes, nodeLayouts);
    const names = inside.map((h) => hostStatusKey(h)).filter(Boolean) as string[];
    result.set(node.id, countRegionStats(names, statusMap, threshold, baseStatsOptions));
  }

  return result;
}

export function regionFillColor(
  stats: RegionHostStats | undefined,
  options: Pick<TopologyPanelOptions, 'colorOnline' | 'colorOffline' | 'colorAlert' | 'colorSubmap' | 'colorNetworkFill'>,
  kind: 'network' | 'submap',
  icmpReady = true
): string | undefined {
  if (kind === 'submap') {
    // OK / sem dados → cor submapa; com hosts parados → cor offline.
    if (icmpReady && stats && !stats.loadFailed && stats.total > 0 && stats.offline > 0) {
      return options.colorOffline;
    }
    return options.colorSubmap;
  }
  if (!stats || stats.loadFailed) {
    return options.colorNetworkFill;
  }
  if (stats.total === 0) {
    return options.colorNetworkFill;
  }
  if (!icmpReady) {
    return options.colorNetworkFill;
  }
  if (stats.offline > 0) {
    return 'rgba(198,40,40,0.22)';
  }
  if (stats.alert > 0) {
    return 'rgba(239,108,0,0.18)';
  }
  if (stats.online > 0) {
    return 'rgba(46,125,50,0.07)';
  }
  return options.colorNetworkFill;
}
