import { HostDisplayMap, HostMetadataMap, LinkRuntimeMetrics, LinkRuntimeMetricsMap, TopologyHostStatus, TopologyLink, TopologyMap, TopologyNode, TopologyPanelOptions } from '../types';
import { HostLookupRef, resolveHostLookupKey, enrichHostDisplayFromMap } from './hostLookup';
import { linkKey } from './mapLinkEdits';
import { resolveLinkMapTrafficMetrics } from './linkMetricsRuntime';
import { NodeLayout } from './nodeLayout';
import { findHostDisplayBucket, flattenHostDisplayByRefId, lookupHostDisplay, submapQueryRefIds } from './queryHosts';
import { isHostNode } from './topologyNodes';
import { panelColorWithAlpha } from './panelColors';
import { formatBitsPerSecond } from './zabbixAdapter/formatTraffic';
import { HostProblemsMap, ZABBIX_PROBLEM_MIN_SEVERITY } from './noc/types';

export interface RegionHostStats {
  total: number;
  offline: number;
  alert: number;
  online: number;
  /** Hosts do mapa sem valor/status na Query */
  unknown: number;
  loadFailed?: boolean;
  /** Hosts do submapa ainda não resolvidos (query refId). */
  loadPending?: boolean;
  /** Tráfego agregado dos links que tocam a região (bps). */
  rxBps?: number;
  txBps?: number;
}

/** Sufixo ↓/↑ quando há tráfego agregado na região. */
function formatRegionTrafficSuffix(stats: RegionHostStats): string | undefined {
  const rx = formatBitsPerSecond(stats.rxBps);
  const tx = formatBitsPerSecond(stats.txBps);
  if (!rx && !tx) {
    return undefined;
  }
  const parts: string[] = [];
  if (rx) {
    parts.push(`↓ ${rx}`);
  }
  if (tx) {
    parts.push(`↑ ${tx}`);
  }
  return parts.join(' ');
}

/** Rede: texto descritivo. Submapa: parado / alerta / online (sem tráfego — já vai nas interfaces). */
export function formatRegionStats(
  stats: RegionHostStats,
  queryReady = true,
  kind: 'network' | 'submap' = 'network'
): string {
  const traffic = formatRegionTrafficSuffix(stats);
  const withTraffic = (base: string): string => (traffic ? `${base} · ${traffic}` : base);

  if (kind === 'submap') {
    if (stats.loadFailed) {
      return 'Mapa indisponível';
    }
    if (stats.loadPending) {
      return 'Carregando…';
    }
    if (!queryReady) {
      if (stats.total > 0) {
        return `${stats.total} hosts`;
      }
      return '0 / 0 / 0';
    }
    if (stats.total === 0) {
      return '0 / 0 / 0';
    }
    return `${stats.offline} / ${stats.alert} / ${stats.online}`;
  }
  if (stats.loadFailed) {
    return 'Mapa indisponível';
  }
  if (stats.total === 0) {
    return traffic ?? '';
  }
  if (!queryReady) {
    return 'Carregando…';
  }
  if (stats.offline > 0) {
    const n = stats.offline;
    return withTraffic(`${n} parado${n > 1 ? 's' : ''} · ${stats.total} hosts`);
  }
  if (stats.alert > 0) {
    const n = stats.alert;
    return withTraffic(`${n} alerta${n > 1 ? 's' : ''} · ${stats.total} hosts`);
  }
  if (traffic) {
    return withTraffic(`${stats.total} hosts · OK`);
  }
  return `${stats.total} hosts · OK`;
}

function hostStatusKey(node: TopologyNode, metadata?: HostMetadataMap): string | undefined {
  return resolveHostLookupKey(node, metadata);
}

function resolveRegionHostStatus(
  host: string,
  hostDisplay: HostDisplayMap,
  hostMetadata?: HostMetadataMap
): TopologyHostStatus | 'unknown' {
  const key = host.trim();
  if (!key) {
    return 'unknown';
  }
  const display = lookupHostDisplay(hostDisplay, { zabbixHost: key }, hostMetadata);
  if (!display?.status) {
    return 'unknown';
  }
  return display.status;
}

function hostKeyHasZabbixProblem(
  hostKey: string,
  hostMetadata?: HostMetadataMap,
  hostProblems?: HostProblemsMap
): boolean {
  if (!hostProblems) {
    return false;
  }
  const meta = hostMetadata?.[hostKey];
  const candidates = [meta?.hostid, hostKey, meta?.name, meta?.ip];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) {
      continue;
    }
    const summary = hostProblems[trimmed];
    if (summary && summary.count > 0 && summary.maxSeverity >= ZABBIX_PROBLEM_MIN_SEVERITY) {
      return true;
    }
  }
  return false;
}

function countRegionStats(
  hostNames: string[],
  hostDisplay: HostDisplayMap,
  hostMetadata?: HostMetadataMap,
  hostProblems?: HostProblemsMap
): RegionHostStats {
  let offline = 0;
  let alert = 0;
  let online = 0;
  let unknown = 0;
  const seen = new Set<string>();

  for (const raw of hostNames) {
    const key = raw.trim();
    if (!key || seen.has(key.toLowerCase())) {
      continue;
    }
    seen.add(key.toLowerCase());

    const st = resolveRegionHostStatus(key, hostDisplay, hostMetadata);
    const hasProblem = hostKeyHasZabbixProblem(key, hostMetadata, hostProblems);
    if (st === 'offline') {
      offline++;
    } else if (st === 'alert' || hasProblem) {
      alert++;
    } else if (st === 'online') {
      online++;
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

function hostsInsideNetwork(
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
  hostDisplay: HostDisplayMap,
  submapHosts: Record<string, string[] | null | undefined> = {},
  hostMetadata: HostMetadataMap = {},
  /** Status por refId — submapa com queryRefId só olha a própria consulta (não o mapa pai). */
  hostDisplayByRefId: Record<string, HostDisplayMap> = {},
  childMaps?: Record<string, TopologyMap | undefined>,
  hostProblems?: HostProblemsMap
): Map<string, RegionHostStats> {
  const result = new Map<string, RegionHostStats>();
  const hostNodes = nodes.filter((n) => isHostNode(n));

  for (const node of nodes) {
    if (node.type === 'submap') {
      const childId = node.submapChildMapId?.trim();
      const childMap = childId ? childMaps?.[childId] : undefined;
      if (childMap) {
        const keys = childMapHostKeys(childMap, hostMetadata);
        const enriched = enrichHostDisplayFromMap(hostDisplay, childMap, hostMetadata);
        result.set(
          node.id,
          countRegionStats(keys, enriched, hostMetadata, hostProblems)
        );
        continue;
      }

      const fetched = submapHosts[node.id];
      if (fetched === undefined) {
        result.set(node.id, {
          total: 0,
          offline: 0,
          alert: 0,
          online: 0,
          unknown: 0,
          loadPending: true,
        });
        continue;
      }
      if (fetched === null) {
        result.set(node.id, { total: 0, offline: 0, alert: 0, online: 0, unknown: 0, loadFailed: true });
        continue;
      }
      const refIds = submapQueryRefIds(node);
      const buckets: Record<string, HostDisplayMap> = {};
      for (const refId of refIds) {
        const bucket = findHostDisplayBucket(hostDisplayByRefId, refId);
        if (bucket) {
          buckets[refId] = bucket;
        }
      }
      const statusMap = refIds.length ? flattenHostDisplayByRefId(buckets) : hostDisplay;
      result.set(node.id, countRegionStats(fetched, statusMap, hostMetadata, hostProblems));
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
    const names = inside.map((h) => hostStatusKey(h, hostMetadata)).filter(Boolean) as string[];
    result.set(node.id, countRegionStats(names, hostDisplay, hostMetadata, hostProblems));
  }

  return result;
}

/** Chaves de host (IP ou nome) dos nós host de um mapa interno — para agregar status do submapa. */
export function childMapHostKeys(childMap: TopologyMap, hostMetadata?: HostMetadataMap): string[] {
  const keys: string[] = [];
  for (const node of childMap.nodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const key = resolveHostLookupKey(node, hostMetadata);
    if (key) {
      keys.push(key);
    }
  }
  return keys;
}

type RegionColorOptions = Pick<
  TopologyPanelOptions,
  'colorOnline' | 'colorOffline' | 'colorAlert' | 'colorSubmap' | 'colorUnknown' | 'colorNetworkFill'
>;

export function regionFillColor(
  stats: RegionHostStats | undefined,
  options: RegionColorOptions,
  kind: 'network' | 'submap',
  queryReady = true
): string | undefined {
  if (kind === 'submap') {
    if (!queryReady || !stats || stats.loadFailed || stats.loadPending || stats.total === 0) {
      return options.colorUnknown;
    }
    if (stats.offline > 0) {
      return options.colorOffline;
    }
    if (stats.alert > 0) {
      return options.colorAlert;
    }
    if (stats.online > 0) {
      return options.colorSubmap;
    }
    return options.colorUnknown;
  }
  if (!stats || stats.loadFailed || stats.total === 0 || !queryReady) {
    return options.colorNetworkFill;
  }
  if (stats.offline > 0) {
    return panelColorWithAlpha(options.colorOffline, 0.22);
  }
  if (stats.alert > 0) {
    return panelColorWithAlpha(options.colorAlert, 0.18);
  }
  if (stats.online > 0) {
    return panelColorWithAlpha(options.colorOnline, 0.07);
  }
  return options.colorNetworkFill;
}

export function regionStrokeColor(
  stats: RegionHostStats | undefined,
  options: Pick<TopologyPanelOptions, 'colorOnline' | 'colorOffline' | 'colorAlert' | 'colorNetworkBorder'>,
  queryReady = true,
  fallbackBorder?: string
): string {
  const networkAlert = Boolean(
    queryReady && stats && !stats.loadFailed && stats.total > 0 && stats.offline === 0 && stats.alert > 0
  );
  const networkOnline = Boolean(
    queryReady &&
      stats &&
      !stats.loadFailed &&
      stats.total > 0 &&
      stats.offline === 0 &&
      stats.alert === 0 &&
      stats.online > 0
  );
  if (stats && stats.offline > 0) {
    return options.colorOffline;
  }
  if (networkAlert) {
    return options.colorAlert;
  }
  if (networkOnline) {
    return options.colorOnline;
  }
  return fallbackBorder ?? options.colorNetworkBorder;
}

export function regionHasOfflineHosts(
  stats: RegionHostStats | undefined,
  queryReady = true
): boolean {
  return Boolean(queryReady && stats && !stats.loadFailed && stats.total > 0 && stats.offline > 0);
}

export function resolveHostNodeStatus(
  node: TopologyNode,
  hostDisplay: HostDisplayMap | undefined,
  hostMetadata?: HostMetadataMap
): TopologyHostStatus | 'unknown' | undefined {
  if (!isHostNode(node)) {
    return undefined;
  }
  const lookupRef: HostLookupRef = {
    zabbixHost: node.zabbixHost,
    subtitle: node.subtitle,
    label: node.label,
  };
  const display = lookupHostDisplay(hostDisplay, lookupRef, hostMetadata);
  if (!display?.status) {
    return 'unknown';
  }
  return display.status;
}

function trafficFromLinkMetrics(link: TopologyLink, metrics?: LinkRuntimeMetrics): { rxBps?: number; txBps?: number } {
  const display = resolveLinkMapTrafficMetrics(link, metrics);
  return {
    rxBps: display.rxBps,
    txBps: display.txBps,
  };
}

function addTrafficTotals(
  current: { rxBps?: number; txBps?: number },
  delta: { rxBps?: number; txBps?: number }
): { rxBps?: number; txBps?: number } {
  const rxBps =
    current.rxBps !== undefined || delta.rxBps !== undefined
      ? (current.rxBps ?? 0) + (delta.rxBps ?? 0)
      : undefined;
  const txBps =
    current.txBps !== undefined || delta.txBps !== undefined
      ? (current.txBps ?? 0) + (delta.txBps ?? 0)
      : undefined;
  return { rxBps, txBps };
}

function regionNodeIdsForLink(
  link: TopologyLink,
  regionNodeIds: Set<string>
): boolean {
  return regionNodeIds.has(link.from) || regionNodeIds.has(link.to);
}

/** Soma RX/TX dos links que tocam cada rede. Submapa não agrega — o tráfego já vai nas interfaces. */
export function mergeRegionTrafficStats(
  regionStats: Map<string, RegionHostStats>,
  map: TopologyMap,
  nodeLayouts: Map<string, NodeLayout & TopologyNode>,
  linkMetricsByLink: LinkRuntimeMetricsMap
): Map<string, RegionHostStats> {
  if (!map.links.length || !Object.keys(linkMetricsByLink).length) {
    return regionStats;
  }

  const hostNodes = map.nodes.filter((node) => isHostNode(node));
  const trafficByRegion = new Map<string, { rxBps?: number; txBps?: number }>();

  for (const node of map.nodes) {
    if (node.type !== 'network') {
      continue;
    }

    const layout = nodeLayouts.get(node.id);
    if (!layout) {
      continue;
    }

    const inside = hostsInsideNetwork(node.id, layout, hostNodes, nodeLayouts);
    if (!inside.length) {
      continue;
    }

    const nodeIds = new Set(inside.map((host) => host.id));
    trafficByRegion.set(node.id, { rxBps: 0, txBps: 0 });
    for (const link of map.links) {
      if (!regionNodeIdsForLink(link, nodeIds)) {
        continue;
      }
      const totals = trafficFromLinkMetrics(link, linkMetricsByLink[linkKey(link)]);
      const prev = trafficByRegion.get(node.id) ?? {};
      trafficByRegion.set(node.id, addTrafficTotals(prev, totals));
    }
  }

  if (!trafficByRegion.size) {
    return regionStats;
  }

  const merged = new Map(regionStats);
  for (const [regionId, traffic] of trafficByRegion) {
    const stats = merged.get(regionId);
    if (!stats) {
      continue;
    }
    merged.set(regionId, { ...stats, ...traffic });
  }
  return merged;
}
