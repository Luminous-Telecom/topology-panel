import { TopologyLink, TopologyMap, TopologyNode } from '../types';
import { inferLinkMedium, upsertHostLayout } from '../utils';

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
  return addTypedNodeAt(map, 'network', 'network', x, y, () => label, { width: 220, height: 140 });
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

export function removeNodeFromMap(
  map: TopologyMap,
  nodeId: string,
  opts?: { zabbixHost?: string; type?: TopologyNode['type'] }
): TopologyMap {
  const node = map.nodes.find((n) => n.id === nodeId);
  const nodes = map.nodes.filter((n) => n.id !== nodeId);
  const links = map.links.filter((l) => l.from !== nodeId && l.to !== nodeId);

  let hiddenHosts = map.hiddenHosts ? [...map.hiddenHosts] : undefined;
  const nodeType = node?.type ?? opts?.type ?? 'host';
  const hostKey = (node?.zabbixHost ?? opts?.zabbixHost)?.trim();

  // Hosts só da query Zabbix não estão em map.nodes — hiddenHosts evita reaparecer.
  if (nodeType === 'host' && hostKey) {
    hiddenHosts = hiddenHosts ?? [];
    if (!hiddenHosts.includes(hostKey)) {
      hiddenHosts.push(hostKey);
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
    (next, node) => removeNodeFromMap(next, node.id, { zabbixHost: node.zabbixHost, type: node.type }),
    map
  );
}

export function updateStoredNode(map: TopologyMap, node: TopologyNode, patch: Partial<TopologyNode>): TopologyMap {
  if ((node.type ?? 'host') === 'host' && node.zabbixHost) {
    return upsertHostLayout(map, node.zabbixHost, { ...patch, id: node.id });
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
      'includeInParentStats',
      'showStatusStats',
      'dashboardChoices',
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
    if ((node.type ?? 'host') !== 'host') {
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
      if ((n.type ?? 'host') === 'host' && n.zabbixHost?.trim() === key) {
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
    if ((node.type ?? 'host') !== 'host' || node.zabbixHost?.trim()) {
      continue;
    }
    const stored = next.nodes.find((n) => n.id === node.id);
    if (stored && (stored.type ?? 'host') === 'host') {
      next = updateStoredNode(next, stored, { icon });
    }
  }

  return next;
}

/** Aplica largura/altura e flag de submapas internos a vários submapas. */
export function updateSubmapsBulk(
  map: TopologyMap,
  selectedNodes: TopologyNode[],
  patch: {
    width?: number;
    height?: number;
    includeInParentStats: boolean;
  }
): TopologyMap {
  let next = map;
  for (const node of selectedNodes) {
    if (node.type !== 'submap') {
      continue;
    }
    const stored = next.nodes.find((n) => n.id === node.id);
    if (!stored || stored.type !== 'submap') {
      continue;
    }
    const nodePatch: Partial<TopologyNode> = {
      // Só persiste false; true/omitido = inclui no pai (padrão)
      includeInParentStats: patch.includeInParentStats ? undefined : false,
      showStatusStats: undefined,
    };
    if (patch.width !== undefined) {
      nodePatch.width = patch.width;
    }
    if (patch.height !== undefined) {
      nodePatch.height = patch.height;
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
    if ((node.type ?? 'host') !== 'host') {
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
    const stored = next.nodes.find((n) => n.id === node.id);
    if (stored && (stored.type ?? 'host') === 'host') {
      next = updateStoredNode(next, stored, {
        toolUsername: username,
        toolPassword: password,
      });
    }
  }

  return next;
}

export function moveStoredNode(map: TopologyMap, node: TopologyNode, x: number, y: number): TopologyMap {
  return updateStoredNode(map, node, { x: Math.round(x), y: Math.round(y) });
}

/** Move vários nós de uma vez (arraste em grupo). */
export function moveStoredNodesBulk(
  map: TopologyMap,
  moves: Array<{ nodeId: string; x: number; y: number }>,
  resolveNode?: (nodeId: string) => TopologyNode | undefined
): TopologyMap {
  let next = map;
  for (const { nodeId, x, y } of moves) {
    const node = next.nodes.find((n) => n.id === nodeId) ?? resolveNode?.(nodeId);
    if (!node) {
      continue;
    }
    next = moveStoredNode(next, node, x, y);
  }
  return next;
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

/** Adiciona host Zabbix pelo hostid (vínculo estável) + nome visível. */
export function addZabbixHostAt(
  map: TopologyMap,
  x: number,
  y: number,
  visibleName: string,
  ip?: string,
  icon?: TopologyNode['icon'],
  zabbixHostId?: string
): TopologyMap {
  const key = visibleName.trim();
  if (!key) {
    return map;
  }
  const hiddenHosts = map.hiddenHosts?.filter((h) => h.trim() !== key);
  const next = upsertHostLayout(map, key, {
    x: Math.round(x),
    y: Math.round(y),
    label: key,
    subtitle: ip?.trim() || undefined,
    type: 'host',
    icon,
    zabbixHostId: zabbixHostId?.trim() || undefined,
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
  ip?: string,
  icon?: TopologyNode['icon'],
  zabbixHostId?: string
): TopologyMap {
  const node = map.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return map;
  }
  const oldKey = node.zabbixHost?.trim();
  const newKey = newVisibleName.trim();
  if (!newKey) {
    return map;
  }

  let nodes = map.nodes;
  if (oldKey && oldKey !== newKey) {
    nodes = nodes.filter(
      (n) => !((n.type ?? 'host') === 'host' && n.zabbixHost?.trim() === oldKey && n.id === nodeId)
    );
  }

  const hiddenHosts = map.hiddenHosts?.filter((h) => h.trim() !== newKey);
  const next = upsertHostLayout({ ...map, nodes }, newKey, {
    id: nodeId,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    label: newKey,
    subtitle: ip?.trim() || node.subtitle,
    type: 'host',
    icon: icon ?? node.icon,
    zabbixHostId: zabbixHostId?.trim() || undefined,
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
      if (!((l.from === from && l.to === to) || (l.from === to && l.to === from))) {
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
    links: map.links.filter((l) => !((l.from === from && l.to === to) || (l.from === to && l.to === from))),
  };
}
