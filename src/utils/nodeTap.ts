import { TopologyNode } from '../types';
import { isHostNode } from './topologyNodes';

/** Intervalo máximo entre dois toques no mesmo nó (pointer capture bloqueia o dblclick nativo). */
export const NODE_DOUBLE_TAP_MS = 400;

/** Duplo clique no host: propriedades no editor; ficha só leitura fora dele. */
export function resolveHostDoubleClickAction(
  node: TopologyNode,
  editable: boolean
): 'properties' | 'info' | undefined {
  if (!isHostNode(node)) {
    return undefined;
  }
  return editable ? 'properties' : 'info';
}

export type NodeTapStamp = { nodeId: string; time: number };

export type HostTouchTapKind = 'peek' | 'tools';

/**
 * Toque no host (mobile): 1 toque = popover de status/falhas; 2 toques no mesmo nó = Tools.
 */
export function resolveHostTouchTap(
  last: NodeTapStamp | null,
  nodeId: string,
  now: number,
  windowMs = NODE_DOUBLE_TAP_MS
): { kind: HostTouchTapKind; next: NodeTapStamp | null } {
  if (last && last.nodeId === nodeId && now - last.time <= windowMs) {
    return { kind: 'tools', next: null };
  }
  return { kind: 'peek', next: { nodeId, time: now } };
}
