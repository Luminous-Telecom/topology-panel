import { TopologyHostIcon, TopologyLink, TopologyMap, TopologyNode } from '../types';
import { hostToNodeId } from './hostLookup';
import { upsertHostLayout } from './mapSync';
import { findNodeById, isHostNode } from './topologyNodes';
import { addLinkWithInterfaces } from './mapLinkEdits';

const CLIPBOARD_VERSION = 1 as const;
const STORAGE_KEY = 'luminous-topology-panel-clipboard';

export interface TopologyClipboardPayload {
  version: typeof CLIPBOARD_VERSION;
  nodes: TopologyNode[];
  links: TopologyLink[];
  hostIcons?: Partial<Record<string, TopologyHostIcon>>;
}

let sharedClipboard: TopologyClipboardPayload | null = null;
const clipboardListeners = new Set<() => void>();

function isClipboardPayload(value: unknown): value is TopologyClipboardPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const rec = value as TopologyClipboardPayload;
  return rec.version === CLIPBOARD_VERSION && Array.isArray(rec.nodes) && Array.isArray(rec.links);
}

function readStoredClipboard(): TopologyClipboardPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isClipboardPayload(parsed) || parsed.nodes.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredClipboard(payload: TopologyClipboardPayload | null): void {
  try {
    if (!payload || payload.nodes.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota ou modo privado — clipboard em memória ainda vale na mesma carga */
  }
}

function syncClipboardFromStorage(): TopologyClipboardPayload | null {
  sharedClipboard = readStoredClipboard();
  return sharedClipboard;
}

function notifyClipboardListeners(): void {
  for (const listener of clipboardListeners) {
    listener();
  }
}

export function subscribeTopologyClipboard(listener: () => void): () => void {
  clipboardListeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) {
      return;
    }
    syncClipboardFromStorage();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    clipboardListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function setTopologyClipboard(payload: TopologyClipboardPayload | null): void {
  sharedClipboard = payload;
  writeStoredClipboard(payload);
  notifyClipboardListeners();
}

export function getTopologyClipboard(): TopologyClipboardPayload | null {
  if (sharedClipboard) {
    return sharedClipboard;
  }
  return syncClipboardFromStorage();
}

export function hasTopologyClipboard(): boolean {
  const clip = sharedClipboard ?? readStoredClipboard();
  return clip !== null && clip.nodes.length > 0;
}

/**
 * Credencial de Tools não entra no clipboard.
 *
 * O payload vai para o `sessionStorage`, que é legível por qualquer script de mesma origem e pelo
 * DevTools — seria um segundo lugar, mais exposto que o JSON do dashboard, guardando a mesma senha.
 * Quem colar o nó cadastra usuário e senha de novo em Propriedades.
 */
function withoutToolCredentials(node: TopologyNode): TopologyNode {
  if (node.toolUsername === undefined && node.toolPassword === undefined) {
    return node;
  }
  const copy = { ...node };
  delete copy.toolUsername;
  delete copy.toolPassword;
  return copy;
}

function resolveNodeForCopy(
  displayMap: TopologyMap,
  storedMap: TopologyMap,
  nodeId: string
): TopologyNode | null {
  const displayNode = findNodeById(displayMap.nodes, nodeId);
  if (!displayNode) {
    return null;
  }

  const storedNode = findNodeById(storedMap.nodes, nodeId);
  if (storedNode) {
    return withoutToolCredentials({ ...storedNode, x: displayNode.x, y: displayNode.y });
  }

  const hostKey = displayNode.zabbixHost?.trim();
  if (hostKey) {
    const byHost = storedMap.nodes.find((n) => isHostNode(n) && n.zabbixHost?.trim() === hostKey);
    if (byHost) {
      return withoutToolCredentials({ ...byHost, x: displayNode.x, y: displayNode.y });
    }
  }

  return withoutToolCredentials({ ...displayNode });
}

function idPrefixForNode(node: TopologyNode): string {
  const type = node.type ?? 'host';
  if (type === 'submap') {
    return 'submap';
  }
  if (type === 'network') {
    return 'network';
  }
  if (type === 'static') {
    return 'static';
  }
  if (type === 'dashboard_picker') {
    return 'dashboard-picker';
  }
  return 'device';
}

function buildIdMap(nodes: TopologyNode[], targetMap: TopologyMap): Record<string, string> {
  const idMap: Record<string, string> = {};
  const used = new Set(targetMap.nodes.map((n) => n.id));

  for (const node of nodes) {
    const hostKey = node.zabbixHost?.trim();
    if (hostKey) {
      const zid = hostToNodeId(hostKey);
      idMap[node.id] = zid;
      used.add(zid);
      continue;
    }

    const prefix = idPrefixForNode(node);
    let index = 1;
    let candidate = `${prefix}-${index}`;
    while (used.has(candidate)) {
      index += 1;
      candidate = `${prefix}-${index}`;
    }
    idMap[node.id] = candidate;
    used.add(candidate);
  }

  return idMap;
}

function selectionCentroid(nodes: TopologyNode[]): { x: number; y: number } {
  if (nodes.length === 0) {
    throw new Error('selectionCentroid exige ao menos um nó');
  }
  let sumX = 0;
  let sumY = 0;
  for (const node of nodes) {
    sumX += node.x;
    sumY += node.y;
  }
  return { x: sumX / nodes.length, y: sumY / nodes.length };
}

/** Extrai nós e links internos da seleção atual para o clipboard compartilhado. */
export function copyTopologySelection(
  displayMap: TopologyMap,
  storedMap: TopologyMap,
  selectedNodeIds: string[],
  selectedLink: TopologyLink | null
): TopologyClipboardPayload | null {
  const nodeIds = new Set(selectedNodeIds);

  if (selectedLink) {
    nodeIds.add(selectedLink.from);
    nodeIds.add(selectedLink.to);
  }

  if (nodeIds.size === 0) {
    return null;
  }

  const nodes: TopologyNode[] = [];
  for (const id of nodeIds) {
    const node = resolveNodeForCopy(displayMap, storedMap, id);
    if (node) {
      nodes.push(node);
    }
  }

  if (nodes.length === 0) {
    return null;
  }

  const idSet = new Set(nodes.map((n) => n.id));
  const links = storedMap.links.filter((l) => idSet.has(l.from) && idSet.has(l.to));

  const hostIcons: Partial<Record<string, TopologyHostIcon>> = {};
  for (const node of nodes) {
    const key = node.zabbixHost?.trim();
    if (!key) {
      continue;
    }
    const icon = storedMap.hostIcons?.[key] ?? node.icon;
    if (icon) {
      hostIcons[key] = icon;
    }
  }

  const payload: TopologyClipboardPayload = {
    version: CLIPBOARD_VERSION,
    nodes,
    links,
    hostIcons: Object.keys(hostIcons).length > 0 ? hostIcons : undefined,
  };

  setTopologyClipboard(payload);
  return payload;
}

interface PasteTopologyResult {
  map: TopologyMap;
  pastedNodeIds: string[];
}

/** Cola o clipboard no mapa alvo, centrando a seleção no ponto âncora. */
export function pasteTopologySelection(
  map: TopologyMap,
  payload: TopologyClipboardPayload,
  anchorX: number,
  anchorY: number,
  snapCoord: (value: number) => number,
  pasteOffsetSteps = 0
): PasteTopologyResult {
  if (payload.nodes.length === 0) {
    throw new Error('Clipboard vazio');
  }

  const centroid = selectionCentroid(payload.nodes);
  const step = 24;
  const dx = snapCoord(anchorX - centroid.x + pasteOffsetSteps * step);
  const dy = snapCoord(anchorY - centroid.y + pasteOffsetSteps * step);
  const idMap = buildIdMap(payload.nodes, map);

  let next = map;
  const pastedNodeIds: string[] = [];

  for (const node of payload.nodes) {
    const newId = idMap[node.id];
    const pasted: TopologyNode = {
      ...node,
      id: newId,
      x: snapCoord(node.x + dx),
      y: snapCoord(node.y + dy),
    };
    pastedNodeIds.push(newId);

    const hostKey = pasted.zabbixHost?.trim();
    if (hostKey) {
      next = upsertHostLayout(next, hostKey, pasted);
      continue;
    }

    next = { ...next, nodes: [...next.nodes, pasted] };
  }

  for (const link of payload.links) {
    const from = idMap[link.from];
    const to = idMap[link.to];
    if (!from || !to) {
      continue;
    }

    const waypoints =
      link.waypoints && link.waypoints.length > 0
        ? link.waypoints.map((wp) => ({
            x: snapCoord(wp.x + dx),
            y: snapCoord(wp.y + dy),
          }))
        : undefined;

    next = addLinkWithInterfaces(next, from, to, {
      fromInterface: link.fromInterface,
      toInterface: link.toInterface,
      fromPeerHost: link.fromPeerHost,
      toPeerHost: link.toPeerHost,
      bandwidthMbps: link.bandwidthMbps,
      medium: link.medium,
      waypoints,
    });
  }

  if (payload.hostIcons) {
    next = { ...next, hostIcons: { ...(next.hostIcons ?? {}), ...payload.hostIcons } };
  }

  return { map: next, pastedNodeIds };
}
