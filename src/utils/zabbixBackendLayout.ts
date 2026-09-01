import { TopologyMap, TopologyNode } from '../types';
import { childMapHostKeys } from './networkStats';
import { isHostNode } from './topologyNodes';

export interface BackendLayoutNode {
  id: string;
  type?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  networkId?: string;
  zabbixHost?: string;
  label?: string;
  subtitle?: string;
  submapChildMapId?: string;
  queryRefIds?: string[];
}

export interface BackendLayoutLink {
  from: string;
  to: string;
  fromRxItemId?: string;
  fromTxItemId?: string;
  toRxItemId?: string;
  toTxItemId?: string;
}

export interface ZabbixBackendPollLayout {
  nodes: BackendLayoutNode[];
  links: BackendLayoutLink[];
  childHostKeys?: Record<string, string[]>;
  submapHosts?: Record<string, string[] | null | undefined>;
  submapHostsFailed?: string[];
}

function compactNode(node: TopologyNode): BackendLayoutNode {
  return {
    id: node.id,
    type: node.type,
    x: node.x,
    y: node.y,
    w: node.width,
    h: node.height,
    networkId: node.networkId,
    zabbixHost: node.zabbixHost,
    label: node.label,
    subtitle: node.subtitle,
    submapChildMapId: node.submapChildMapId,
    queryRefIds: node.queryRefIds,
  };
}

function metricId(ref?: { itemId?: string }): string | undefined {
  const id = ref?.itemId?.trim();
  return id || undefined;
}

export function compactPollLayout(
  map: TopologyMap,
  childMaps?: Record<string, TopologyMap | undefined>
): Pick<ZabbixBackendPollLayout, 'nodes' | 'links' | 'childHostKeys'> {
  const nodes = map.nodes
    .filter((node) => isHostNode(node) || node.type === 'network' || node.type === 'submap')
    .map(compactNode);
  const links: BackendLayoutLink[] = map.links.map((link) => ({
    from: link.from,
    to: link.to,
    fromRxItemId: metricId(link.fromInterface?.metrics?.rx),
    fromTxItemId: metricId(link.fromInterface?.metrics?.tx),
    toRxItemId: metricId(link.toInterface?.metrics?.rx),
    toTxItemId: metricId(link.toInterface?.metrics?.tx),
  }));
  const childHostKeys: Record<string, string[]> = {};
  for (const node of map.nodes) {
    if (node.type !== 'submap') {
      continue;
    }
    const childId = node.submapChildMapId?.trim();
    if (!childId) {
      continue;
    }
    const child = childMaps?.[childId];
    if (!child) {
      continue;
    }
    const keys = childMapHostKeys(child);
    childHostKeys[node.id] = keys;
    childHostKeys[childId] = keys;
  }
  return { nodes, links, childHostKeys };
}

export function regionLayoutKeyFromMap(map: TopologyMap): string {
  return map.nodes
    .filter((node) => node.type === 'network' || node.type === 'submap')
    .map((node) => node.id)
    .sort()
    .join('\u0001');
}
