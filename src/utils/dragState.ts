import { TopologyLink, TopologyNode } from '../types';
import { LinkPoint } from './linkGeometry';
import {
  DEFAULT_NETWORK_HEIGHT,
  DEFAULT_NETWORK_WIDTH,
  DEFAULT_STATIC_HEIGHT,
  DEFAULT_STATIC_WIDTH,
  NodeLayout,
} from './nodeLayout';
import { findNodeById } from './topologyNodes';

/** Faixa nas bordas do painel que dispara pan automático ao arrastar nó/rede. */
export const EDGE_PAN_THRESHOLD = 64;
/** Velocidade máxima do pan automático (px de tela por segundo). */
export const EDGE_PAN_MAX_SPEED = 720;
/** Movimento mínimo em px de tela antes de arrastar nó (clique vs drag). */
export const NODE_DRAG_THRESHOLD_PX = 8;

export type DragGroupMember = {
  id: string;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
};

/** Gesto em andamento no canvas — só um por vez, guardado num ref. */
export type DragState =
  | {
      kind: 'pan';
      ox: number;
      oy: number;
      nx: number;
      ny: number;
      moved: boolean;
      tapNode?: TopologyNode;
      tapLink?: TopologyLink;
    }
  | {
      kind: 'node';
      node: TopologyNode;
      grabOffsetWorld: { x: number; y: number };
      pointerOx: number;
      pointerOy: number;
      startX: number;
      startY: number;
      startW: number;
      startH: number;
      moved: boolean;
      group?: DragGroupMember[];
    }
  | { kind: 'resize'; node: TopologyNode; ox: number; oy: number; startW: number; startH: number; moved: boolean }
  | { kind: 'marquee'; mapX0: number; mapY0: number; additive?: boolean }
  | {
      kind: 'link-waypoint';
      link: TopologyLink;
      ox: number;
      oy: number;
      waypointIndex: number;
      waypoints: LinkPoint[];
      moved: boolean;
      /** Inserção só após limiar de arraste — evita dobrar a linha no toque/clique. */
      pendingInsert: { x: number; y: number; insertIndex: number } | null;
    };

/** Posição/tamanho provisórios durante o gesto, antes de persistir no mapa. */
export type DragPreview = {
  nodeId?: string;
  positions?: Record<string, { x: number; y: number }>;
  width?: number;
  height?: number;
  linkWaypoints?: { from: string; to: string; waypoints: LinkPoint[] };
} | null;

export function canMoveSelectedNode(node: TopologyNode, networksLocked: boolean): boolean {
  return node.type === 'network' ? !networksLocked : true;
}

/** Tamanho assumido quando o nó ainda não tem layout medido nem dimensão salva. */
export function defaultNodeSize(node: TopologyNode): { w: number; h: number } {
  if (node.type === 'network') {
    return { w: DEFAULT_NETWORK_WIDTH, h: DEFAULT_NETWORK_HEIGHT };
  }
  if (node.type === 'static') {
    return { w: DEFAULT_STATIC_WIDTH, h: DEFAULT_STATIC_HEIGHT };
  }
  return { w: 48, h: 28 };
}

/** Mesma ideia de `defaultNodeSize`, mas para a alça de resize, que trata submapa/seletor à parte. */
export function defaultResizeSize(node: TopologyNode): { w: number; h: number } {
  if (node.type === 'static') {
    return { w: DEFAULT_STATIC_WIDTH, h: DEFAULT_STATIC_HEIGHT };
  }
  if (node.type === 'submap' || node.type === 'dashboard_picker') {
    return { w: 120, h: 36 };
  }
  return { w: DEFAULT_NETWORK_WIDTH, h: DEFAULT_NETWORK_HEIGHT };
}

/** Congela posição e tamanho iniciais de cada nó selecionado que pode se mover. */
export function buildDragGroupMembers(
  selectedNodeIds: string[],
  nodes: TopologyNode[],
  nodeLayouts: Map<string, NodeLayout & TopologyNode>,
  networksLocked: boolean
): DragGroupMember[] {
  return selectedNodeIds
    .map((id) => findNodeById(nodes, id))
    .filter((n): n is TopologyNode => Boolean(n && canMoveSelectedNode(n, networksLocked)))
    .map((n) => {
      const memberLayout = nodeLayouts.get(n.id);
      const fallback = defaultNodeSize(n);
      return {
        id: n.id,
        startX: n.x,
        startY: n.y,
        startW: memberLayout?.w ?? n.width ?? fallback.w,
        startH: memberLayout?.h ?? n.height ?? fallback.h,
      };
    });
}
