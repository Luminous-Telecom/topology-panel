import { HostMetadataMap, HostStatusMap, TopologyNode, TopologyPanelOptions, TopologyStatusMetric } from '../types';
import {
  effectiveStatusMetric,
  NodeLayout,
  lookupHostStatus,
  offlineThresholdForMetric,
  resolveNodeStatus,
  resolveStatusFromValue,
} from '../utils';

export interface RegionHostStats {
  total: number;
  offline: number;
  online: number;
  unknown: number;
  /** Falha ao carregar hosts do dashboard filho (não usar statsHosts embutido). */
  loadFailed?: boolean;
}

export function formatRegionStats(stats: RegionHostStats, icmpReady = true): string {
  if (stats.loadFailed) {
    return 'Mapa indisponível';
  }
  if (stats.total === 0) {
    return icmpReady ? 'Sem hosts monitorados' : 'Carregando…';
  }
  if (!icmpReady) {
    return 'Carregando…';
  }
  if (stats.offline > 0) {
    const n = stats.offline;
    return `${n} parado${n > 1 ? 's' : ''} · ${stats.total} hosts`;
  }
  return `${stats.total} hosts · OK`;
}

function hostStatusKey(node: TopologyNode): string | undefined {
  const key = node.zabbixHost?.trim();
  return key || undefined;
}

function classifyHost(
  name: string,
  statusMap: HostStatusMap,
  threshold: number,
  metric: TopologyStatusMetric
): 'online' | 'offline' | 'unknown' {
  const v = lookupHostStatus(statusMap, name);
  if (v === null || v === undefined) {
    return 'unknown';
  }
  return resolveStatusFromValue(v, threshold, metric);
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
  return resolveNodeStatus({ zabbixHost: key, type: 'host' }, statusMap, threshold, metric, hostMetadata);
}

export function countRegionStats(
  hostNames: string[],
  statusMap: HostStatusMap,
  threshold: number,
  options?: {
    topologyStats?: boolean;
    metric?: TopologyStatusMetric;
    hostMetadata?: HostMetadataMap;
    /** Overview/submapa: ignora hosts sem ICMP na contagem de parados (não reduz o total). */
    monitoredOnly?: boolean;
  }
): RegionHostStats {
  let offline = 0;
  let online = 0;
  let unknown = 0;
  const seen = new Set<string>();
  const metric = options?.metric ?? 'icmp_rtt';

  for (const raw of hostNames) {
    const key = raw.trim();
    if (!key || seen.has(key.toLowerCase())) {
      continue;
    }
    seen.add(key.toLowerCase());

    const st = options?.topologyStats
      ? resolveRegionHostStatus(key, statusMap, threshold, metric, options.hostMetadata)
      : classifyHost(key, statusMap, threshold, metric);

    if (options?.monitoredOnly && st === 'unknown') {
      continue;
    }

    if (st === 'offline') {
      offline++;
    } else if (st === 'online') {
      online++;
    } else {
      unknown++;
    }
  }
  const configuredTotal = seen.size;
  return {
    total: configuredTotal,
    offline,
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
  options: Pick<TopologyPanelOptions, 'statusMetric'>,
  submapHosts: Record<string, string[] | null | undefined> = {},
  hostMetadata: HostMetadataMap = {}
): Map<string, RegionHostStats> {
  const result = new Map<string, RegionHostStats>();
  const hostNodes = nodes.filter((n) => (n.type ?? 'host') === 'host');
  const metric = effectiveStatusMetric(options);
  const threshold = offlineThresholdForMetric(metric);
  const baseStatsOptions = { topologyStats: true, metric, hostMetadata };

  for (const node of nodes) {
    if (node.type === 'submap') {
      const fetched = submapHosts[node.id];
      if (fetched === undefined) {
        continue;
      }
      if (fetched === null) {
        result.set(node.id, { total: 0, offline: 0, online: 0, unknown: 0, loadFailed: true });
        continue;
      }
      result.set(
        node.id,
        countRegionStats(fetched, statusMap, threshold, baseStatsOptions)
      );
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
  options: Pick<TopologyPanelOptions, 'colorOnline' | 'colorOffline' | 'colorSubmap' | 'colorNetworkFill'>,
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
  if (stats.online > 0) {
    return 'rgba(46,125,50,0.18)';
  }
  return options.colorNetworkFill;
}
