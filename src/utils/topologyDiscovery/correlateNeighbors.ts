import {
  HostMetadataMap,
  MetricBindingConfidence,
  TopologyInterfaceReference,
  TopologyMap,
  TopologyNetworkInterface,
  TopologyNode,
  TopologySuggestedLink,
} from '../../types';
import { resolveHostLookupKey } from '../hostLookup';
import { isHostNode } from '../topologyNodes';
import { ZabbixNeighborRecord } from '../zabbixAdapter/parseNeighborItems';

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function hostNodes(map: TopologyMap): TopologyNode[] {
  return map.nodes.filter((n) => isHostNode(n));
}

/** Índice nome/IP → nó do mapa. */
export function buildHostNodeIndex(
  map: TopologyMap,
  hostMetadata?: HostMetadataMap
): Map<string, TopologyNode> {
  const index = new Map<string, TopologyNode>();
  for (const node of hostNodes(map)) {
    const keys = new Set<string>();
    const lookup = resolveHostLookupKey(node, hostMetadata);
    if (lookup) {
      keys.add(normalizeName(lookup));
    }
    if (node.label?.trim()) {
      keys.add(normalizeName(node.label));
    }
    if (node.zabbixHost?.trim()) {
      keys.add(normalizeName(node.zabbixHost));
    }
    if (node.subtitle?.trim()) {
      keys.add(normalizeName(node.subtitle));
    }
    for (const key of keys) {
      if (!index.has(key)) {
        index.set(key, node);
      }
    }
  }
  return index;
}

function matchRemoteHost(
  remoteSysName: string | undefined,
  index: Map<string, TopologyNode>
): { node?: TopologyNode; confidence: MetricBindingConfidence } {
  if (!remoteSysName?.trim()) {
    return { confidence: 'low' };
  }
  const exact = index.get(normalizeName(remoteSysName));
  if (exact) {
    return { node: exact, confidence: 'high' };
  }
  const norm = normalizeName(remoteSysName);
  for (const [key, node] of index) {
    if (key.includes(norm) || norm.includes(key)) {
      return { node, confidence: 'medium' };
    }
  }
  return { confidence: 'low' };
}

function matchInterface(
  name: string | undefined,
  interfaces: TopologyNetworkInterface[]
): TopologyInterfaceReference | undefined {
  if (!name?.trim()) {
    return undefined;
  }
  const norm = normalizeName(name);
  const found = interfaces.find((iface) => {
    const candidates = [iface.name, iface.alias, iface.description].filter(Boolean).map((v) => normalizeName(v as string));
    return candidates.some((c) => c === norm || c.includes(norm) || norm.includes(c));
  });
  if (!found) {
    return undefined;
  }
  return { name: found.name, snmpIndex: found.snmpIndex, alias: found.alias };
}

export function suggestedLinkId(
  fromNodeId: string,
  toNodeId: string,
  localPort?: string,
  remotePort?: string
): string {
  const lp = (localPort ?? '').toLowerCase();
  const rp = (remotePort ?? '').toLowerCase();
  return `sugg-${fromNodeId}-${toNodeId}-${lp}-${rp}`;
}

export interface CorrelateNeighborsParams {
  map: TopologyMap;
  neighbors: ZabbixNeighborRecord[];
  interfacesByHost: Record<string, TopologyNetworkInterface[]>;
  hostMetadata?: HostMetadataMap;
  existingSuggested?: TopologySuggestedLink[];
}

/** Correlaciona vizinhos Zabbix com nós/interfaces do mapa — não insere links automaticamente. */
export function correlateNeighborsToSuggestions(params: CorrelateNeighborsParams): TopologySuggestedLink[] {
  const { map, neighbors, interfacesByHost, hostMetadata, existingSuggested = [] } = params;
  const hostIndex = buildHostNodeIndex(map, hostMetadata);
  const ignored = new Set(
    existingSuggested.filter((s) => s.state === 'ignored').map((s) => s.id)
  );
  const suggestions: TopologySuggestedLink[] = [];

  for (const neighbor of neighbors) {
    const sourceNode = hostNodes(map).find((n) => {
      const key = resolveHostLookupKey(n, hostMetadata);
      return key === neighbor.hostKey || normalizeName(n.label ?? '') === normalizeName(neighbor.hostKey);
    });
    if (!sourceNode) {
      continue;
    }

    const { node: targetNode, confidence: hostConfidence } = matchRemoteHost(neighbor.remoteSysName, hostIndex);
    if (!targetNode || targetNode.id === sourceNode.id) {
      continue;
    }

    const sourceHostKey = resolveHostLookupKey(sourceNode, hostMetadata) ?? neighbor.hostKey;
    const targetHostKey = resolveHostLookupKey(targetNode, hostMetadata);
    const fromIfaces = interfacesByHost[sourceHostKey] ?? [];
    const toIfaces = targetHostKey ? interfacesByHost[targetHostKey] ?? [] : [];

    const fromInterface = matchInterface(neighbor.localInterface, fromIfaces);
    const toInterface = matchInterface(neighbor.remotePort ?? neighbor.remotePortDesc, toIfaces);

    let confidence: MetricBindingConfidence = hostConfidence;
    if (fromInterface && toInterface) {
      confidence = hostConfidence === 'high' ? 'high' : 'medium';
    } else if (!fromInterface && !toInterface) {
      confidence = hostConfidence === 'high' ? 'medium' : 'low';
    } else {
      confidence = 'medium';
    }

    const id = suggestedLinkId(sourceNode.id, targetNode.id, neighbor.localInterface, neighbor.remotePort);
    if (ignored.has(id)) {
      continue;
    }

    if (map.links.some((l) => (l.from === sourceNode.id && l.to === targetNode.id) || (l.from === targetNode.id && l.to === sourceNode.id))) {
      continue;
    }

    suggestions.push({
      id,
      fromNodeId: sourceNode.id,
      toNodeId: targetNode.id,
      fromInterface,
      toInterface,
      source: neighbor.protocol,
      state: 'suggested',
      confidence,
      localPort: neighbor.localInterface,
      remotePort: neighbor.remotePort ?? neighbor.remotePortDesc,
      remoteSysName: neighbor.remoteSysName,
    });
  }

  const byId = new Map<string, TopologySuggestedLink>();
  for (const prev of existingSuggested.filter((s) => s.state === 'ignored')) {
    byId.set(prev.id, prev);
  }
  for (const sugg of suggestions) {
    if (!byId.has(sugg.id) || byId.get(sugg.id)?.state !== 'ignored') {
      byId.set(sugg.id, sugg);
    }
  }
  return [...byId.values()].filter((s) => s.state === 'suggested' || s.state === 'ignored');
}
