import { HostProblemMap, HostStatusMap, TopologyNode, TopologyPanelOptions, TopologyStatusMetric } from '../types';
import {
  effectiveStatusMetric,
  NodeLayout,
  lookupHostStatus,
  lookupProblemCount,
  resolveNodeStatus,
  resolveStatusFromValue,
} from '../utils';

export interface RegionHostStats {
  total: number;
  offline: number;
  online: number;
  unknown: number;
}

export function formatRegionStats(stats: RegionHostStats): string {
  if (stats.total === 0) {
    return 'Sem hosts';
  }
  if (stats.offline > 0) {
    const n = stats.offline;
    return `${n} parado${n > 1 ? 's' : ''} · ${stats.total} hosts`;
  }
  return `${stats.total} hosts · OK`;
}

function hostStatusKey(node: TopologyNode): string | undefined {
  const key = node.zabbixHost?.trim() || node.label?.trim();
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

/** Status de um host da topologia — match exato no Zabbix, mesma regra do mapa. */
function resolveTopologyHostStatus(
  host: string,
  statusMap: HostStatusMap,
  problemMap: HostProblemMap,
  threshold: number,
  metric: TopologyStatusMetric
): 'online' | 'offline' | 'unknown' {
  const key = host.trim();
  if (!key) {
    return 'unknown';
  }

  if (lookupProblemCount(problemMap, key) > 0) {
    return 'offline';
  }

  return resolveNodeStatus({ zabbixHost: key, type: 'host' }, statusMap, threshold, metric);
}

export function countRegionStats(
  hostNames: string[],
  statusMap: HostStatusMap,
  threshold: number,
  options?: {
    topologyStats?: boolean;
    problemMap?: HostProblemMap;
    metric?: TopologyStatusMetric;
  }
): RegionHostStats {
  let offline = 0;
  let online = 0;
  let unknown = 0;
  const seen = new Set<string>();
  const problemMap = options?.problemMap ?? {};
  const metric = options?.metric ?? 'icmp_rtt';

  for (const raw of hostNames) {
    const key = raw.trim();
    if (!key || seen.has(key.toLowerCase())) {
      continue;
    }
    seen.add(key.toLowerCase());

    const st = options?.topologyStats
      ? resolveTopologyHostStatus(key, statusMap, problemMap, threshold, metric)
      : classifyHost(key, statusMap, threshold, metric);
    if (st === 'offline') {
      offline++;
    } else if (st === 'online') {
      online++;
    } else {
      unknown++;
    }
  }
  return { total: seen.size, offline, online, unknown };
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
  options: Pick<TopologyPanelOptions, 'offlineThreshold' | 'statusMetric' | 'statusValueField'>,
  problemMap: HostProblemMap = {},
  submapHosts: Record<string, string[]> = {}
): Map<string, RegionHostStats> {
  const result = new Map<string, RegionHostStats>();
  const hostNodes = nodes.filter((n) => (n.type ?? 'host') === 'host');
  const metric = effectiveStatusMetric(options);
  const threshold = options.offlineThreshold ?? (metric === 'packet_loss' ? 1 : 0);
  const statsOptions = { topologyStats: true, problemMap, metric };

  for (const node of nodes) {
    if (node.type !== 'network' && node.type !== 'submap') {
      continue;
    }

    const liveSubmapHosts = submapHosts[node.id]?.map((h) => h.trim()).filter(Boolean);
    const mapHosts = liveSubmapHosts?.length
      ? liveSubmapHosts
      : node.statsHosts?.map((h) => h.trim()).filter(Boolean);
    if (mapHosts?.length) {
      result.set(
        node.id,
        countRegionStats(mapHosts, statusMap, threshold, statsOptions)
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
    result.set(
      node.id,
      countRegionStats(names, statusMap, threshold, statsOptions)
    );
  }

  return result;
}

export function regionFillColor(
  stats: RegionHostStats | undefined,
  options: Pick<TopologyPanelOptions, 'colorOnline' | 'colorOffline' | 'colorSubmap' | 'colorNetworkFill'>,
  kind: 'network' | 'submap'
): string | undefined {
  if (!stats || stats.total === 0) {
    return undefined;
  }
  if (stats.offline > 0) {
    return kind === 'submap' ? options.colorOffline : 'rgba(198,40,40,0.22)';
  }
  if (stats.online > 0) {
    return kind === 'submap' ? options.colorOnline : 'rgba(46,125,50,0.18)';
  }
  return kind === 'submap' ? options.colorSubmap : options.colorNetworkFill;
}
