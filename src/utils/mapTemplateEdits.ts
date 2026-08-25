/** Aplica modelos de topologia ao mapa persistido. */
import { TopologyLink, TopologyMap, TopologyNode } from '../types';
import { inferLinkMedium } from './linkMedium';
import { findNodeById } from './topologyNodes';
import { TopologyBlueprint } from './topologyTemplates/types';

function nextRoleNodeId(map: TopologyMap, blueprintId: string, role: string): string {
  const prefix = `${blueprintId}-${role}`;
  const used = new Set(map.nodes.map((n) => n.id));
  if (!used.has(prefix)) {
    return prefix;
  }
  let n = 2;
  while (used.has(`${prefix}-${n}`)) {
    n += 1;
  }
  return `${prefix}-${n}`;
}

export interface ApplyBlueprintResult {
  map: TopologyMap;
  addedNodes: number;
  addedLinks: number;
}

/** Instancia um modelo de topologia no mapa (nós + links + rede opcional). */
export function applyTopologyBlueprint(map: TopologyMap, blueprint: TopologyBlueprint): ApplyBlueprintResult {
  const roleToId = new Map<string, string>();
  const newNodes: TopologyNode[] = [];
  const newLinks: TopologyLink[] = [];

  if (blueprint.networkBox) {
    const networkCount = map.nodes.filter((n) => n.type === 'network').length;
    const networkId = `${blueprint.id}-net-${networkCount + 1}`;
    newNodes.push({
      id: networkId,
      label: blueprint.networkBox.label,
      type: 'network',
      x: blueprint.networkBox.x,
      y: blueprint.networkBox.y,
      width: blueprint.networkBox.width,
      height: blueprint.networkBox.height,
    });
  }

  for (const role of blueprint.roles) {
    const id = nextRoleNodeId(map, blueprint.id, role.role);
    roleToId.set(role.role, id);
    const node: TopologyNode = {
      id,
      label: role.label,
      type: role.type,
      x: role.x,
      y: role.y,
      icon: role.icon,
      nodeTemplateId: role.nodeTemplateId,
    };
    if (role.width !== undefined) {
      node.width = role.width;
    }
    if (role.height !== undefined) {
      node.height = role.height;
    }
    newNodes.push(node);
  }

  for (const link of blueprint.links ?? []) {
    const fromId = roleToId.get(link.fromRole);
    const toId = roleToId.get(link.toRole);
    if (!fromId || !toId) {
      continue;
    }
    const fromNode = findNodeById(newNodes, fromId) ?? findNodeById(map.nodes, fromId);
    const toNode = findNodeById(newNodes, toId) ?? findNodeById(map.nodes, toId);
    newLinks.push({
      from: fromId,
      to: toId,
      medium: link.medium ?? inferLinkMedium(fromNode, toNode),
    });
  }

  let width = map.width;
  let height = map.height;
  const pad = 80;
  for (const node of newNodes) {
    width = Math.max(width, node.x + (node.width ?? 140) + pad);
    height = Math.max(height, node.y + (node.height ?? 80) + pad);
  }

  return {
    map: {
      ...map,
      width,
      height,
      nodes: [...map.nodes, ...newNodes],
      links: [...map.links, ...newLinks],
    },
    addedNodes: newNodes.length,
    addedLinks: newLinks.length,
  };
}
