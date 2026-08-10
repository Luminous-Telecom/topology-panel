import { HostDisplayMap, HostMetadataMap, TopologyNode, TopologyPanelOptions } from '../types';
import { lookupHostDisplay, NodeLayout, resolveHostLookupKey } from '../utils';

export interface RegionHostStats {
  total: number;
  /** Hosts do mapa sem valor na Query */
  unknown: number;
  loadFailed?: boolean;
}

export function formatRegionStats(
  stats: RegionHostStats,
  queryReady = true,
  kind: 'network' | 'submap' = 'network'
): string {
  if (stats.loadFailed) {
    return 'Mapa indisponível';
  }
  if (stats.total === 0) {
    return '';
  }
  if (!queryReady) {
    return 'Carregando…';
  }
  if (kind === 'submap') {
    return `${stats.total} hosts`;
  }
  if (stats.unknown > 0) {
    return `${stats.unknown} sem query · ${stats.total} hosts`;
  }
  return `${stats.total} hosts`;
}

function hostStatusKey(node: TopologyNode, metadata?: HostMetadataMap): string | undefined {
  return resolveHostLookupKey(node, metadata);
}

export function countRegionStats(
  hostNames: string[],
  hostDisplay: HostDisplayMap,
  hostMetadata?: HostMetadataMap
): RegionHostStats {
  let unknown = 0;
  const seen = new Set<string>();

  for (const raw of hostNames) {
    const key = raw.trim();
    if (!key || seen.has(key.toLowerCase())) {
      continue;
    }
    seen.add(key.toLowerCase());

    const display = lookupHostDisplay(hostDisplay, { zabbixHost: key }, hostMetadata);
    if (!display?.color) {
      unknown++;
    }
  }

  return {
    total: seen.size,
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
        result.set(node.id, { total: 0, unknown: 0 });
        continue;
      }
      if (fetched === null) {
        result.set(node.id, { total: 0, unknown: 0, loadFailed: true });
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

export function regionFillColor(
  _stats: RegionHostStats | undefined,
  options: Pick<TopologyPanelOptions, 'colorSubmap' | 'colorNetworkFill'>,
  kind: 'network' | 'submap'
): string | undefined {
  if (kind === 'submap') {
    return options.colorSubmap;
  }
  return options.colorNetworkFill;
}
