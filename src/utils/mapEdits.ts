import { TopologyLink, TopologyMap, TopologyNode } from '../types';
import {
  collectHostHiddenKeys,
  findNodeById,
  inferLinkMedium,
  isHostNode,
  isIpv4,
  isSubmapNode,
  resolveHostLayoutKey,
  upsertHostLayout,
} from '../utils';

/** Compara endpoints de link sem considerar direção (a→b é o mesmo link que b→a). */
export function linksMatchEndpoints(
  a: { from: string; to: string },
  b: { from: string; to: string }
): boolean {
  return (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);
}

/** Chave estável de um link (direção original a→b) — usada para seleção/hover/lookup por identidade. */
export function linkKey(link: { from: string; to: string }): string {
  return `${link.from}-${link.to}`;
}

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

function nextAvailableNodeId(base: string, used: Set<string>): string {
  let n = 2;
  let candidate = `${base}-${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

/**
 * Garante id único em `map.nodes`. Cópias com o mesmo id (comum após colar/sincronizar
 * o mesmo host duas vezes) fazem o React e o `nodeLayouts` (Map por id) ignorarem uma
 * delas — o arraste parece não funcionar.
 */
export function ensureUniqueNodeIds(map: TopologyMap): TopologyMap {
  if (!Array.isArray(map.nodes)) {
    return map;
  }
  const seen = new Set<string>();
  let changed = false;
  const nodes = map.nodes.map((node) => {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      return node;
    }
    changed = true;
    const nextId = nextAvailableNodeId(node.id, seen);
    seen.add(nextId);
    return { ...node, id: nextId };
  });
  return changed ? { ...map, nodes } : map;
}

/**
 * Adiciona um nó de um tipo "utilitário" (submapa/rede/estático/seletor) na posição dada.
 * `idPrefix-N` e `makeLabel` usam a contagem de nós já existentes desse tipo (1-based).
 */
function addTypedNodeAt(
  map: TopologyMap,
  type: TopologyNode['type'],
  idPrefix: string,
  x: number,
  y: number,
  makeLabel: (countBefore: number) => string,
  extra?: Partial<TopologyNode>
): TopologyMap {
  const countBefore = map.nodes.filter((n) => n.type === type).length;
  const node: TopologyNode = {
    id: `${idPrefix}-${countBefore + 1}`,
    label: makeLabel(countBefore),
    type,
    x: Math.round(x),
    y: Math.round(y),
    ...extra,
  };
  return { ...map, nodes: [...map.nodes, node] };
}

export function addSubmapAt(map: TopologyMap, x: number, y: number): TopologyMap {
  return addTypedNodeAt(map, 'submap', 'submap', x, y, (countBefore) => `Submapa ${countBefore + 1}`);
}

export function addNetworkAt(map: TopologyMap, x: number, y: number, label = 'Rede'): TopologyMap {
  const countBefore = map.nodes.filter((n) => n.type === 'network').length;
  const node: TopologyNode = {
    id: `network-${countBefore + 1}`,
    label,
    type: 'network',
    x: Math.round(x),
    y: Math.round(y),
    width: 220,
    height: 140,
  };
  return { ...map, nodes: [node, ...map.nodes] };
}

export function addStaticAt(map: TopologyMap, x: number, y: number, label = 'Estático'): TopologyMap {
  return addTypedNodeAt(map, 'static', 'static', x, y, () => label);
}

export function addDashboardPickerAt(
  map: TopologyMap,
  x: number,
  y: number,
  label = 'Dashboards'
): TopologyMap {
  return addTypedNodeAt(
    map,
    'dashboard_picker',
    'dashboard-picker',
    x,
    y,
    (countBefore) => (countBefore ? `${label} ${countBefore + 1}` : label),
    { dashboardChoices: [] }
  );
}

export function addLinkToMap(map: TopologyMap, from: string, to: string): TopologyMap {
  if (from === to) {
    return map;
  }
  const exists = map.links.some((l) => linksMatchEndpoints(l, { from, to }));
  if (exists) {
    return map;
  }
  const fromNode = findNodeById(map.nodes, from);
  const toNode = findNodeById(map.nodes, to);
  return {
    ...map,
    links: [...map.links, { from, to, medium: inferLinkMedium(fromNode, toNode) }],
  };
}

export function removeNodeFromMap(
  map: TopologyMap,
  nodeId: string,
  opts?: {
    zabbixHost?: string;
    subtitle?: string;
    label?: string;
    type?: TopologyNode['type'];
  }
): TopologyMap {
  const node = findNodeById(map.nodes, nodeId);
  const nodes = map.nodes.filter((n) => n.id !== nodeId);
  const links = map.links.filter((l) => l.from !== nodeId && l.to !== nodeId);

  let hiddenHosts = map.hiddenHosts ? [...map.hiddenHosts] : undefined;
  const nodeType = node?.type ?? opts?.type ?? 'host';

  // Hosts só da query Zabbix não estão em map.nodes — hiddenHosts evita reaparecer.
  if (nodeType === 'host') {
    const hideKeys = collectHostHiddenKeys(node, opts);
    if (hideKeys.length) {
      hiddenHosts = hiddenHosts ?? [];
      for (const key of hideKeys) {
        if (!hiddenHosts.includes(key)) {
          hiddenHosts.push(key);
        }
      }
    }
  }

  return { ...map, nodes, links, hiddenHosts };
}

/** Remove vários nós de uma vez (links conectados e hiddenHosts incluídos). */
export function removeNodesFromMap(map: TopologyMap, nodesToRemove: TopologyNode[]): TopologyMap {
  if (!nodesToRemove.length) {
    return map;
  }
  return nodesToRemove.reduce(
    (next, node) =>
      removeNodeFromMap(next, node.id, {
        zabbixHost: node.zabbixHost,
        subtitle: node.subtitle,
        label: node.label,
        type: node.type,
      }),
    map
  );
}

export function updateStoredNode(map: TopologyMap, node: TopologyNode, patch: Partial<TopologyNode>): TopologyMap {
  if (isHostNode(node)) {
    const key = resolveHostLayoutKey(node);
    if (key) {
      return upsertHostLayout(map, key, { ...patch, id: node.id });
    }
  }

  const nodes = map.nodes.map((n) => {
    if (n.id !== node.id) {
      return n;
    }
    const next: TopologyNode = { ...n, ...patch };
    // Limpa campos opcionais enviados como undefined (ex.: cor padrão do painel)
    for (const key of [
      'fillColor',
      'labelColor',
      'borderColor',
      'width',
      'height',
      'fontSize',
      'dashboardChoices',
      'networkId',
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] === undefined) {
        delete next[key];
      }
    }
    return next;
  });
  return { ...map, nodes };
}

/** Aplica o mesmo ícone a vários hosts de uma vez (usa nós do canvas, incl. hosts só da query). */
export function updateHostsIconBulk(
  map: TopologyMap,
  selectedNodes: TopologyNode[],
  icon: TopologyNode['icon']
): TopologyMap {
  if (!icon) {
    return map;
  }

  const hostIcons = { ...(map.hostIcons ?? {}) };
  const zabbixKeys = new Set<string>();

  for (const node of selectedNodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const key = node.zabbixHost?.trim();
    if (key) {
      zabbixKeys.add(key);
      hostIcons[key] = icon;
    }
  }

  let next: TopologyMap = { ...map, hostIcons };

  for (const key of zabbixKeys) {
    const displayNode = selectedNodes.find((n) => n.zabbixHost?.trim() === key);
    let matched = false;
    const nodes = next.nodes.map((n) => {
      if (isHostNode(n) && n.zabbixHost?.trim() === key) {
        matched = true;
        return { ...n, icon };
      }
      return n;
    });
    if (matched) {
      next = { ...next, nodes };
      continue;
    }
    if (displayNode) {
      next = upsertHostLayout(next, key, {
        icon,
        id: displayNode.id,
        x: displayNode.x,
        y: displayNode.y,
        width: displayNode.width,
        height: displayNode.height,
      });
    }
  }

  for (const node of selectedNodes) {
    if (!isHostNode(node) || node.zabbixHost?.trim()) {
      continue;
    }
    const stored = findNodeById(next.nodes, node.id);
    if (stored && isHostNode(stored)) {
      next = updateStoredNode(next, stored, { icon });
    }
  }

  return next;
}

/** Aplica largura/altura a vários submapas. */
export function updateSubmapsBulk(
  map: TopologyMap,
  selectedNodes: TopologyNode[],
  patch: {
    width?: number;
    height?: number;
  }
): TopologyMap {
  let next = map;
  for (const node of selectedNodes) {
    if (!isSubmapNode(node)) {
      continue;
    }
    const stored = findNodeById(next.nodes, node.id);
    if (!stored || !isSubmapNode(stored)) {
      continue;
    }
    const nodePatch: Partial<TopologyNode> = {};
    if (patch.width !== undefined) {
      nodePatch.width = patch.width;
    }
    if (patch.height !== undefined) {
      nodePatch.height = patch.height;
    }
    if (Object.keys(nodePatch).length === 0) {
      continue;
    }
    next = updateStoredNode(next, stored, nodePatch);
  }
  return next;
}

/** Aplica usuário/senha Tools a vários hosts de uma vez. */
export function updateHostsCredentialsBulk(
  map: TopologyMap,
  selectedNodes: TopologyNode[],
  creds: { toolUsername: string; toolPassword: string }
): TopologyMap {
  const username = creds.toolUsername.trim();
  const password = creds.toolPassword;
  let next = map;

  for (const node of selectedNodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const key = node.zabbixHost?.trim();
    if (key) {
      next = upsertHostLayout(next, key, {
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        icon: node.icon,
        toolUsername: username,
        toolPassword: password,
      });
      continue;
    }
    const stored = findNodeById(next.nodes, node.id);
    if (stored && isHostNode(stored)) {
      next = updateStoredNode(next, stored, {
        toolUsername: username,
        toolPassword: password,
      });
    }
  }

  return next;
}

export function moveStoredNode(map: TopologyMap, node: TopologyNode, x: number, y: number): TopologyMap {
  const patch: Partial<TopologyNode> = { x: Math.round(x), y: Math.round(y) };
  if (isHostNode(node) && node.networkId) {
    patch.networkId = undefined;
  }
  return updateStoredNode(map, node, patch);
}

/** Move vários nós de uma vez (arraste em grupo). */
export function moveStoredNodesBulk(
  map: TopologyMap,
  moves: Array<{ nodeId: string; x: number; y: number }>,
  resolveNode?: (nodeId: string) => TopologyNode | undefined
): TopologyMap {
  let next = map;
  for (const { nodeId, x, y } of moves) {
    const node = findNodeById(next.nodes, nodeId) ?? resolveNode?.(nodeId);
    if (!node) {
      continue;
    }
    next = moveStoredNode(next, node, x, y);
  }
  return next;
}

export { clientToMapCoords } from './mapCoords';

function nextManualHostId(map: TopologyMap): string {
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

/** Adiciona host Zabbix pelo IP da interface principal + nome visível. */
export function addZabbixHostAt(
  map: TopologyMap,
  x: number,
  y: number,
  visibleName: string,
  ip: string,
  icon?: TopologyNode['icon']
): TopologyMap {
  const ipKey = ip.trim();
  if (!isIpv4(ipKey)) {
    return map;
  }
  const label = visibleName.trim() || ipKey;
  const hiddenHosts = map.hiddenHosts?.filter((h) => h.trim() !== ipKey && h.trim() !== label);
  const next = upsertHostLayout(map, ipKey, {
    x: Math.round(x),
    y: Math.round(y),
    label,
    subtitle: ipKey,
    type: 'host',
    icon,
  });
  return {
    ...next,
    hiddenHosts: hiddenHosts?.length ? hiddenHosts : undefined,
  };
}

/** Altera o host Zabbix vinculado a um nó existente (mantém id e posição). */
export function rebindZabbixHost(
  map: TopologyMap,
  nodeId: string,
  newVisibleName: string,
  ip: string,
  icon?: TopologyNode['icon'],
  sourceNode?: Pick<TopologyNode, 'x' | 'y' | 'width' | 'height' | 'icon'>
): TopologyMap {
  const node = findNodeById(map.nodes, nodeId);
  const ipKey = ip.trim();
  if (!isIpv4(ipKey)) {
    return map;
  }
  const oldIp = node?.subtitle?.trim();
  const oldKey = node?.zabbixHost?.trim();
  const label = newVisibleName.trim() || ipKey;

  let nodes = map.nodes;
  if (node && oldKey && oldKey !== ipKey) {
    nodes = nodes.filter((n) => !(isHostNode(n) && n.zabbixHost?.trim() === oldKey && n.id === nodeId));
  }

  const hiddenHosts = map.hiddenHosts?.filter((h) => {
    const key = h.trim();
    return key !== ipKey && key !== label && key !== oldKey && key !== oldIp;
  });
  const next = upsertHostLayout({ ...map, nodes }, ipKey, {
    id: nodeId,
    x: node?.x ?? sourceNode?.x ?? 100,
    y: node?.y ?? sourceNode?.y ?? 100,
    width: node?.width ?? sourceNode?.width,
    height: node?.height ?? sourceNode?.height,
    label,
    subtitle: ipKey,
    type: 'host',
    icon: icon ?? node?.icon ?? sourceNode?.icon,
  });

  return {
    ...next,
    hiddenHosts: hiddenHosts?.length ? hiddenHosts : undefined,
  };
}

export function updateLinkProps(
  map: TopologyMap,
  from: string,
  to: string,
  patch: Partial<Pick<TopologyLink, 'medium' | 'bandwidthMbps' | 'waypoints'>>
): TopologyMap {
  return {
    ...map,
    links: map.links.map((l) => {
      if (!linksMatchEndpoints(l, { from, to })) {
        return l;
      }
      const next = { ...l, ...patch };
      if (patch.bandwidthMbps === undefined && Object.prototype.hasOwnProperty.call(patch, 'bandwidthMbps')) {
        delete next.bandwidthMbps;
      }
      if (patch.waypoints !== undefined && (!patch.waypoints || patch.waypoints.length === 0)) {
        delete next.waypoints;
      }
      return next;
    }),
  };
}

export function removeLinkByEndpoints(map: TopologyMap, from: string, to: string): TopologyMap {
  return {
    ...map,
    links: map.links.filter((l) => !linksMatchEndpoints(l, { from, to })),
  };
}
