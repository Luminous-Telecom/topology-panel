/** Edições aplicadas a vários nós de uma vez, a partir da seleção no canvas. */
import { TopologyMap, TopologyNode } from '../types';
import { updateStoredNode } from './mapEdits';
import { upsertHostLayout } from './mapSync';
import { findNodeById, isHostNode, isSubmapNode } from './topologyNodes';

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
