import { HostDisplayMap, HostMetadataMap, TopologyHostStatus, TopologyNode, TopologyPanelOptions } from '../types';
import { HostLookupRef, lookupHostDisplay, NodeLayout, resolveHostLookupKey } from '../utils';
import { panelColorWithAlpha } from './panelColors';

export interface RegionHostStats {
  total: number;
  offline: number;
  alert: number;
  online: number;
  /** Hosts do mapa sem valor/status na Query */
  unknown: number;
  loadFailed?: boolean;
}

/** Rede: texto descritivo. Submapa: parado / alerta / online. */
export function formatRegionStats(
  stats: RegionHostStats,
  queryReady = true,
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
  if (!queryReady) {
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

export function countRegionStats(
  hostNames: string[],
  hostDisplay: HostDisplayMap,
  hostMetadata?: HostMetadataMap
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
    if (st === 'offline') {
      offline++;
    } else if (st === 'alert') {
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
  hostDisplay: HostDisplayMap,
  submapHosts: Record<string, string[] | null | undefined> = {},
  hostMetadata: HostMetadataMap = {}
): Map<string, RegionHostStats> {
  const result = new Map<string, RegionHostStats>();
  const hostNodes = nodes.filter((n) => (n.type ?? 'host') === 'host');

  for (const node of nodes) {
    if (node.type === 'submap') {
      const fetched = submapHosts[node.id];
      if (fetched === undefined) {
        result.set(node.id, { total: 0, offline: 0, alert: 0, online: 0, unknown: 0 });
        continue;
      }
      if (fetched === null) {
        result.set(node.id, { total: 0, offline: 0, alert: 0, online: 0, unknown: 0, loadFailed: true });
        continue;
      }
      result.set(node.id, countRegionStats(fetched, hostDisplay, hostMetadata));
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
    result.set(node.id, countRegionStats(names, hostDisplay, hostMetadata));
  }

  return result;
}

type RegionColorOptions = Pick<
  TopologyPanelOptions,
  'colorOnline' | 'colorOffline' | 'colorAlert' | 'colorSubmap' | 'colorNetworkFill'
>;

export function regionFillColor(
  stats: RegionHostStats | undefined,
  options: RegionColorOptions,
  kind: 'network' | 'submap',
  queryReady = true
): string | undefined {
  if (kind === 'submap') {
    if (queryReady && stats && !stats.loadFailed && stats.total > 0 && stats.offline > 0) {
      return options.colorOffline;
    }
    return options.colorSubmap;
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

export function regionStatsTextColor(stats: RegionHostStats | undefined): string {
  if (!stats) {
    return '#c8e6c9';
  }
  if (stats.offline > 0) {
    return '#ffcdd2';
  }
  if (stats.alert > 0) {
    return '#ffcc80';
  }
  return '#c8e6c9';
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
  if ((node.type ?? 'host') !== 'host') {
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
