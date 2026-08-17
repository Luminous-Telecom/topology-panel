import { HostDisplayMap, HostMetadataMap, TopologyMap, TopologyNode } from '../types';
import { canonicalizeHostKeys, resolveHostLookupKey } from './hostLookup';
import { findHostDisplayBucket } from './queryHosts';
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
  const refId = node.queryRefId?.trim();
  if (!refId) {
    return [];
  }
  if (!queryReady) {
    return undefined;
  }
  const normalized = refId.toUpperCase();
  const fromLabels = queryHostsByRefId[normalized] ?? queryHostsByRefId[refId] ?? [];
  const bucket = findHostDisplayBucket(hostDisplayByRefId, refId);
  const raw = fromLabels.length > 0 ? fromLabels : bucket ? Object.keys(bucket) : [];
  const keys = canonicalizeHostKeys(raw, hostMetadata);
  if (!parentHostKeys.size) {
    return keys;
  }
  return keys.filter((key) => !parentHostKeys.has(key.toLowerCase()));
}
