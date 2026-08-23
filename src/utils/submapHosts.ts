import { HostDisplayMap, HostMetadataMap, TopologyLinkPeerHost, TopologyMap, TopologyNode } from '../types';
import { canonicalizeHostKeys, resolveHostLookupKey } from './hostLookup';
import { findHostDisplayBucket, flattenHostDisplayByRefId, submapQueryRefIds } from './queryHosts';
import { isHostNode } from './topologyNodes';

/** Chaves canônicas (IP ou nome) dos hosts type=host já desenhados neste mapa. */
export function parentMapHostKeys(map: TopologyMap, hostMetadata?: HostMetadataMap): Set<string> {
  const keys = new Set<string>();
  for (const node of map.nodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const key = resolveHostLookupKey(node, hostMetadata);
    if (key) {
      keys.add(key.toLowerCase());
    }
  }
  return keys;
}

/**
 * Lista de hosts para agregar status do submapa (host group da query refId).
 * Remove hosts já desenhados como nó no mapa pai — um host compartilhado (ex.: link entre
 * redes) não deve contar como parte do submapa só porque também está no host group da query B.
 */
export function submapHostListForNode(
  node: TopologyNode,
  hostDisplayByRefId: Record<string, HostDisplayMap>,
  queryHostsByRefId: Record<string, string[]>,
  queryReady: boolean,
  parentHostKeys: Set<string>,
  hostMetadata?: HostMetadataMap
): string[] | undefined {
  const refIds = submapQueryRefIds(node);
  if (!refIds.length) {
    return [];
  }
  if (!queryReady) {
    return undefined;
  }
  const fromLabels: string[] = [];
  const buckets: Record<string, HostDisplayMap> = {};
  for (const refId of refIds) {
    const normalized = refId.trim().toUpperCase();
    for (const host of queryHostsByRefId[normalized] ?? queryHostsByRefId[refId] ?? []) {
      fromLabels.push(host);
    }
    const bucket = findHostDisplayBucket(hostDisplayByRefId, refId);
    if (bucket) {
      buckets[normalized] = bucket;
    }
  }
  const merged = flattenHostDisplayByRefId(buckets);
  const raw = fromLabels.length > 0 ? fromLabels : Object.keys(merged);
  const keys = canonicalizeHostKeys(raw, hostMetadata);
  if (!parentHostKeys.size) {
    return keys;
  }
  return keys.filter((key) => !parentHostKeys.has(key.toLowerCase()));
}

/** Mapa interno apontado pelo nó de submapa, se existir. */
export function submapChildMap(
  node: TopologyNode,
  childMaps?: Record<string, TopologyMap | undefined>
): TopologyMap | undefined {
  if (node.type !== 'submap') {
    return undefined;
  }
  const childId = node.submapChildMapId?.trim();
  return childId ? childMaps?.[childId] : undefined;
}

/** Hosts type=host desenhados no mapa interno do submapa. */
export function innerHostsForSubmapNode(
  node: TopologyNode,
  childMaps?: Record<string, TopologyMap | undefined>
): TopologyNode[] {
  const child = submapChildMap(node, childMaps);
  if (!child) {
    return [];
  }
  return child.nodes.filter(isHostNode);
}

export function innerHostLabel(node: TopologyNode): string {
  return node.label?.trim() || node.zabbixHost?.trim() || node.id;
}

export function linkPeerHostFromNode(node: TopologyNode): TopologyLinkPeerHost {
  const peer: TopologyLinkPeerHost = { nodeId: node.id };
  const zabbixHost = node.zabbixHost?.trim();
  const label = node.label?.trim();
  if (zabbixHost) {
    peer.zabbixHost = zabbixHost;
  }
  if (label) {
    peer.label = label;
  }
  return peer;
}

export function resolveInnerHost(
  hosts: TopologyNode[],
  peer?: TopologyLinkPeerHost
): TopologyNode | undefined {
  if (!hosts.length) {
    return undefined;
  }
  if (peer) {
    const byId = hosts.find((host) => host.id === peer.nodeId);
    if (byId) {
      return byId;
    }
    if (peer.zabbixHost?.trim()) {
      const key = peer.zabbixHost.trim();
      const byKey = hosts.find((host) => host.zabbixHost?.trim() === key);
      if (byKey) {
        return byKey;
      }
    }
  }
  return hosts.length === 1 ? hosts[0] : undefined;
}

/**
 * Abre o modal de interface quando os dois lados são host (e há Zabbix) ou quando
 * pelo menos um lado é submapa com host interno — para escolher o peer e a interface.
 */
export function shouldOpenLinkInterfaceModal(
  fromNode: TopologyNode,
  toNode: TopologyNode,
  childMaps: Record<string, TopologyMap | undefined> | undefined,
  hasZabbixDatasource: boolean
): boolean {
  if (innerHostsForSubmapNode(fromNode, childMaps).length > 0) {
    return true;
  }
  if (innerHostsForSubmapNode(toNode, childMaps).length > 0) {
    return true;
  }
  return isHostNode(fromNode) && isHostNode(toNode) && hasZabbixDatasource;
}
