import { TopologyLink, TopologyLinkMedium, TopologyMap, TopologyNode } from '../types';
import { hostToNodeId, inferLinkMedium, upsertHostLayout } from '../utils';

export function toggleMapLock(map: TopologyMap): TopologyMap {
  return { ...map, locked: !map.locked };
}

export function toggleNetworksLock(map: TopologyMap): TopologyMap {
  const locked = map.networksLocked !== false;
  return { ...map, networksLocked: !locked };
}

export function areNetworksLocked(map: TopologyMap): boolean {
  return map.networksLocked !== false;
}

export function addSubmapAt(map: TopologyMap, x: number, y: number): TopologyMap {
  const submaps = map.nodes.filter((n) => n.type === 'submap');
  const id = `submap-${submaps.length + 1}`;
  const node: TopologyNode = {
    id,
    label: `Submapa ${submaps.length + 1}`,
    type: 'submap',
    x: Math.round(x),
    y: Math.round(y),
  };
  return { ...map, nodes: [...map.nodes, node] };
}

export function addNetworkAt(map: TopologyMap, x: number, y: number, label = 'Rede'): TopologyMap {
  const networks = map.nodes.filter((n) => n.type === 'network');
  const id = `network-${networks.length + 1}`;
  const node: TopologyNode = {
    id,
    label,
    type: 'network',
    x: Math.round(x),
    y: Math.round(y),
    width: 220,
    height: 140,
  };
  return { ...map, nodes: [...map.nodes, node] };
}

export function addStaticAt(map: TopologyMap, x: number, y: number, label = 'Estático'): TopologyMap {
  const statics = map.nodes.filter((n) => n.type === 'static');
  const id = `static-${statics.length + 1}`;
  const node: TopologyNode = {
    id,
    label,
    type: 'static',
    x: Math.round(x),
    y: Math.round(y),
  };
  return { ...map, nodes: [...map.nodes, node] };
}

export function addLinkToMap(map: TopologyMap, from: string, to: string): TopologyMap {
  if (from === to) {
    return map;
  }
  const exists = map.links.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
  if (exists) {
    return map;
  }
  const fromNode = map.nodes.find((n) => n.id === from);
  const toNode = map.nodes.find((n) => n.id === to);
  return {
    ...map,
    links: [...map.links, { from, to, medium: inferLinkMedium(fromNode, toNode) }],
  };
}

export function removeNodeFromMap(map: TopologyMap, nodeId: string): TopologyMap {
  const node = map.nodes.find((n) => n.id === nodeId);
  const nodes = map.nodes.filter((n) => n.id !== nodeId);
  const links = map.links.filter((l) => l.from !== nodeId && l.to !== nodeId);

  let hiddenHosts = map.hiddenHosts ? [...map.hiddenHosts] : undefined;
  if (node?.type === 'host' && node.zabbixHost) {
    const key = node.zabbixHost.trim();
    hiddenHosts = hiddenHosts ?? [];
    if (!hiddenHosts.includes(key)) {
      hiddenHosts.push(key);
    }
  }

  return { ...map, nodes, links, hiddenHosts };
}

export function updateStoredNode(map: TopologyMap, node: TopologyNode, patch: Partial<TopologyNode>): TopologyMap {
  if ((node.type ?? 'host') === 'host' && node.zabbixHost) {
    return upsertHostLayout(map, node.zabbixHost, { ...patch, id: node.id });
  }

  const nodes = map.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n));
  return { ...map, nodes };
}

export function moveStoredNode(map: TopologyMap, node: TopologyNode, x: number, y: number): TopologyMap {
  return updateStoredNode(map, node, { x: Math.round(x), y: Math.round(y) });
}

export function clientToMapCoords(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  view: { x: number; y: number; scale: number }
): { x: number; y: number } {
  return {
    x: (clientX - rect.left - view.x) / view.scale,
    y: (clientY - rect.top - view.y) / view.scale,
  };
}

export function nextManualHostId(map: TopologyMap): string {
  const manual = map.nodes.filter((n) => n.type === 'host' && !n.zabbixHost);
  return `device-${manual.length + 1}`;
}

export function addManualDeviceAt(map: TopologyMap, x: number, y: number, label = 'Dispositivo'): TopologyMap {
  const id = nextManualHostId(map);
  const node: TopologyNode = {
    id,
    label,
    type: 'host',
    x: Math.round(x),
    y: Math.round(y),
  };
  return { ...map, nodes: [...map.nodes, node] };
}

export function findNodeById(map: TopologyMap, nodeId: string): TopologyNode | undefined {
  return map.nodes.find((n) => n.id === nodeId);
}

export function removeLinkFromMap(map: TopologyMap, index: number): TopologyMap {
  return { ...map, links: map.links.filter((_, i) => i !== index) };
}

export function updateLinkMedium(
  map: TopologyMap,
  from: string,
  to: string,
  medium: TopologyLinkMedium
): TopologyMap {
  return {
    ...map,
    links: map.links.map((l) =>
      (l.from === from && l.to === to) || (l.from === to && l.to === from) ? { ...l, medium } : l
    ),
  };
}

export function removeLinkByEndpoints(map: TopologyMap, from: string, to: string): TopologyMap {
  return {
    ...map,
    links: map.links.filter((l) => !((l.from === from && l.to === to) || (l.from === to && l.to === from))),
  };
}

export function linkAtNodes(links: TopologyLink[], nodeId: string): number[] {
  return links.reduce<number[]>((acc, link, i) => {
    if (link.from === nodeId || link.to === nodeId) {
      acc.push(i);
    }
    return acc;
  }, []);
}

export function ensureHostId(map: TopologyMap, zabbixHost: string): string {
  const saved = map.nodes.find((n) => (n.type ?? 'host') === 'host' && n.zabbixHost?.trim() === zabbixHost.trim());
  return saved?.id ?? hostToNodeId(zabbixHost);
}
