/**
 * Edições do mapa salvo: travas, criação e remoção de nós, patch de nó e movimentação.
 * Cabos ficam em `mapLinkEdits.ts` e edições em lote em `mapBulkEdits.ts`.
 */
import { TopologyMap, TopologyNode } from '../types';
import { collectHostHiddenKeys, resolveHostLayoutKey } from './hostLookup';
import { isIpv4 } from './ipv4';
import { upsertHostLayout } from './mapSync';
import { findNodeById, isHostNode } from './topologyNodes';

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

export function moveStoredNode(map: TopologyMap, node: TopologyNode, x: number, y: number): TopologyMap {
  const patch: Partial<TopologyNode> = {
    x: Math.round(x),
    y: Math.round(y),
  };
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

