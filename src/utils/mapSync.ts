import { HostMetadataMap, TopologyMap, TopologyNode } from '../types';
import { hostToNodeId, isQueryHostHidden, resolveHostIp } from './hostLookup';
import { isIpv4 } from './ipv4';
import { isHostNode } from './topologyNodes';

/** Nós salvos que representam o mesmo host da Query (por IP, nome, label ou id). */
function findSavedHostNodes(
  map: TopologyMap,
  hostName: string,
  hostIp?: string
): TopologyNode[] {
  const key = hostName.trim();
  const ip = hostIp?.trim();
  return map.nodes.filter((n) => {
    if (!isHostNode(n)) {
      return false;
    }
    const linked = n.zabbixHost?.trim();
    if (!linked) {
      return false;
    }
    if (ip && (n.subtitle?.trim() === ip || linked === ip)) {
      return true;
    }
    return linked === key || n.label?.trim() === key || n.id === key;
  });
}

interface HostNodeDraft {
  hostName: string;
  hostKey: string;
  ip?: string;
  label: string;
  index: number;
}

/** Nó novo em grade para um host da Query que ainda não existe no mapa. */
function gridHostNode(map: TopologyMap, draft: HostNodeDraft): TopologyNode {
  const cols = 5;
  return {
    id: hostToNodeId(draft.hostKey),
    label: draft.label,
    subtitle: draft.ip && isIpv4(draft.ip) ? draft.ip : undefined,
    zabbixHost: draft.hostKey,
    type: 'host',
    icon: map.hostIcons?.[draft.hostKey] ?? map.hostIcons?.[draft.hostName],
    x: 100 + (draft.index % cols) * 160,
    y: 100 + Math.floor(draft.index / cols) * 80,
  };
}

/** Nó salvo reaproveitado — mantém posição/id e atualiza identidade vinda da Query. */
function syncedSavedNode(map: TopologyMap, saved: TopologyNode, draft: HostNodeDraft): TopologyNode {
  return {
    ...saved,
    type: 'host',
    zabbixHost: draft.hostKey,
    label: saved.label ?? draft.label,
    subtitle:
      (draft.ip && isIpv4(draft.ip) ? draft.ip : undefined) ??
      (isIpv4(saved.subtitle?.trim() ?? '') ? saved.subtitle : undefined),
    icon: saved.icon ?? map.hostIcons?.[draft.hostKey] ?? map.hostIcons?.[draft.hostName],
    zabbixHostId: undefined,
  };
}

/**
 * Monta o mapa de exibição: hosts da Query Zabbix + layout salvo.
 * Sem hosts na Query, mantém os hosts configurados no mapa.
 */
export function mergeMapWithQueryHosts(
  map: TopologyMap,
  queryHosts: string[],
  hostMetadata: HostMetadataMap = {}
): TopologyMap {
  const submaps = map.nodes.filter((n) => n.type === 'submap');
  const dashboardPickers = map.nodes.filter((n) => n.type === 'dashboard_picker');
  const savedHosts = map.nodes.filter((n) => isHostNode(n));

  const hostNames =
    queryHosts.length > 0
      ? queryHosts
      : savedHosts.map((n) => n.zabbixHost?.trim()).filter((key): key is string => Boolean(key));

  const hidden = new Set((map.hiddenHosts ?? []).map((h) => h.trim()).filter(Boolean));
  const visibleHostNames = hostNames.filter((h) => !isQueryHostHidden(h, hostMetadata[h], hidden));

  const hostNodes: TopologyNode[] = [];
  const usedSavedIds = new Set<string>();
  const usedHostKeys = new Set<string>();

  visibleHostNames.forEach((hostName, index) => {
    const meta = hostMetadata[hostName];
    const ip = meta?.ip?.trim();
    const hostKey = ip && isIpv4(ip) ? ip : hostName;
    if (usedHostKeys.has(hostKey.toLowerCase())) {
      return;
    }
    usedHostKeys.add(hostKey.toLowerCase());

    const draft: HostNodeDraft = { hostName, hostKey, ip, label: meta?.name ?? hostName, index };
    const savedMatches = findSavedHostNodes(map, hostName, ip).filter((n) => !usedSavedIds.has(n.id));

    if (savedMatches.length === 0) {
      hostNodes.push(gridHostNode(map, draft));
      return;
    }

    for (const saved of savedMatches) {
      if (usedSavedIds.has(saved.id)) {
        continue;
      }
      usedSavedIds.add(saved.id);
      hostNodes.push(syncedSavedNode(map, saved, draft));
    }
  });

  const manualHosts = savedHosts.filter((n) => !n.zabbixHost?.trim() && !usedSavedIds.has(n.id));
  const savedLayoutHosts = savedHosts.filter((n) => n.zabbixHost?.trim() && !usedSavedIds.has(n.id));
  const staticNodes = map.nodes.filter((n) => n.type === 'static');
  const networkNodes = map.nodes.filter((n) => n.type === 'network');

  return {
    ...map,
    nodes: [
      ...networkNodes,
      ...hostNodes,
      ...manualHosts,
      ...savedLayoutHosts,
      ...submaps,
      ...staticNodes,
      ...dashboardPickers,
    ],
  };
}

/** Campos do patch que representam layout/identidade persistidos no mapa salvo. */
function layoutPatchOf(patch: Partial<TopologyNode>): Partial<TopologyNode> {
  const layoutPatch: Partial<TopologyNode> = {};
  if (patch.x !== undefined) {
    layoutPatch.x = patch.x;
  }
  if (patch.y !== undefined) {
    layoutPatch.y = patch.y;
  }
  if (patch.id !== undefined) {
    layoutPatch.id = patch.id;
  }
  if (patch.width !== undefined) {
    layoutPatch.width = patch.width;
  }
  if (patch.height !== undefined) {
    layoutPatch.height = patch.height;
  }
  if (patch.icon !== undefined) {
    layoutPatch.icon = patch.icon;
  }
  if (patch.label !== undefined) {
    layoutPatch.label = patch.label;
  }
  if (patch.subtitle !== undefined) {
    layoutPatch.subtitle = patch.subtitle;
  }
  if ('toolUsername' in patch) {
    layoutPatch.toolUsername = patch.toolUsername?.trim() || undefined;
  }
  if ('toolPassword' in patch) {
    layoutPatch.toolPassword =
      patch.toolPassword != null && patch.toolPassword !== '' ? patch.toolPassword : undefined;
  }
  if ('networkId' in patch) {
    layoutPatch.networkId = patch.networkId?.trim() || undefined;
  }
  return layoutPatch;
}

/**
 * Índice do nó que recebe o patch.
 *
 * O id específico vem primeiro: dois hosts com o mesmo IP (cópias no mapa) não podem compartilhar
 * o findIndex por IP, senão arrastar um grava a posição no outro.
 */
function findHostNodeIndex(nodes: TopologyNode[], key: string, patchId?: string): number {
  if (patchId) {
    const byId = nodes.findIndex((n) => n.id === patchId);
    if (byId >= 0) {
      return byId;
    }
  }
  if (isIpv4(key)) {
    const byIp = nodes.findIndex(
      (n) => isHostNode(n) && (n.subtitle?.trim() === key || n.zabbixHost?.trim() === key)
    );
    if (byIp >= 0) {
      return byIp;
    }
  }
  return nodes.findIndex((n) => isHostNode(n) && n.zabbixHost?.trim() === key);
}

export function upsertHostLayout(map: TopologyMap, zabbixHost: string, patch: Partial<TopologyNode>): TopologyMap {
  const key = zabbixHost.trim();
  const layoutPatch = layoutPatchOf(patch);
  const nodes = [...map.nodes];
  const idx = findHostNodeIndex(nodes, key, patch.id?.trim());

  if (idx >= 0) {
    const merged: TopologyNode = {
      ...nodes[idx],
      ...layoutPatch,
      zabbixHost: key,
      type: 'host',
      zabbixHostId: undefined,
    };
    if ('toolUsername' in patch && !merged.toolUsername) {
      delete merged.toolUsername;
    }
    if ('toolPassword' in patch && !merged.toolPassword) {
      delete merged.toolPassword;
    }
    if ('networkId' in patch && !merged.networkId) {
      delete merged.networkId;
    }
    nodes[idx] = merged;
  } else {
    nodes.push({
      id: hostToNodeId(key),
      zabbixHost: key,
      type: 'host',
      x: 100,
      y: 100,
      ...layoutPatch,
    });
  }

  let hostIcons = map.hostIcons;
  if (patch.icon !== undefined) {
    hostIcons = { ...(map.hostIcons ?? {}), [key]: patch.icon };
  }

  return { ...map, nodes, hostIcons };
}

/** Overlay do nome/IP atuais do Zabbix (sem alterar o mapa persistido). */
export function withLiveZabbixMeta(node: TopologyNode, metadata?: HostMetadataMap): TopologyNode {
  if (!isHostNode(node) || !metadata) {
    return node;
  }
  const name = node.zabbixHost?.trim();
  const ip = resolveHostIp(node, metadata);
  const entry = (ip && metadata?.[ip]) || (name ? metadata?.[name] : undefined);
  if (!entry?.name?.trim()) {
    return node;
  }
  const nextName = entry.name.trim();
  const nextIp = entry.ip?.trim();
  const nextHostKey = nextIp && isIpv4(nextIp) ? nextIp : name;
  if (
    nextName === (node.label?.trim() || name) &&
    (nextIp || '') === (node.subtitle?.trim() || '') &&
    nextHostKey === name
  ) {
    return node;
  }
  return {
    ...node,
    label: nextName,
    zabbixHost: nextHostKey || nextName,
    subtitle: nextIp || node.subtitle,
    zabbixHostId: undefined,
  };
}
