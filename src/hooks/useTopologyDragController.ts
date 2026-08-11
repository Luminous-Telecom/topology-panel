import React, { Dispatch, MutableRefObject, RefObject, SetStateAction, useCallback, useEffect, useRef } from 'react';
import { TopologyLink, TopologyMap, TopologyNode, TopologyView } from '../types';
import {
  areNetworksLocked,
  clientToMapCoords,
  linkKey,
  linksMatchEndpoints,
  moveStoredNodesBulk,
  updateLinkProps,
  updateStoredNode,
} from '../utils/mapEdits';
import {
  DEFAULT_NETWORK_HEIGHT,
  DEFAULT_NETWORK_WIDTH,
  DEFAULT_STATIC_HEIGHT,
  DEFAULT_STATIC_WIDTH,
  findNodeById,
  NodeLayout,
  snapNodeCenterToGrid,
} from '../utils';
import { AlignGuideLine, computeAlignGuides } from '../utils/alignGuides';
import {
  closestPointOnPolyline,
  computeLinkGeometry,
  LinkPoint,
} from '../utils/linkGeometry';
import { computeEdgePanVelocity } from '../utils/edgePan';
import { CanvasTool } from '../components/TopologyContextMenu';

/** Faixa nas bordas do painel que dispara pan automático ao arrastar nó/rede. */
const EDGE_PAN_THRESHOLD = 64;
/** Velocidade máxima do pan automático (px de tela por segundo). */
const EDGE_PAN_MAX_SPEED = 720;
/** Movimento mínimo em px de tela antes de arrastar nó (clique vs drag). */
const NODE_DRAG_THRESHOLD_PX = 8;

type DragGroupMember = { id: string; startX: number; startY: number; startW: number; startH: number };

type DragState =
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

type DragPreview = {
  nodeId?: string;
  positions?: Record<string, { x: number; y: number }>;
  width?: number;
  height?: number;
  linkWaypoints?: { from: string; to: string; waypoints: LinkPoint[] };
} | null;

function canMoveSelectedNode(node: TopologyNode, networksLocked: boolean): boolean {
  return node.type === 'network' ? !networksLocked : true;
}

function buildDragGroupMembers(
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
      const defaultW =
        n.type === 'network' ? DEFAULT_NETWORK_WIDTH : n.type === 'static' ? DEFAULT_STATIC_WIDTH : 48;
      const defaultH =
        n.type === 'network' ? DEFAULT_NETWORK_HEIGHT : n.type === 'static' ? DEFAULT_STATIC_HEIGHT : 28;
      return {
        id: n.id,
        startX: n.x,
        startY: n.y,
        startW: memberLayout?.w ?? n.width ?? defaultW,
        startH: memberLayout?.h ?? n.height ?? defaultH,
      };
    });
}

function normalizeRect(x0: number, y0: number, x1: number, y1: number) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

interface UseTopologyDragControllerParams {
  wrapRef: RefObject<HTMLDivElement>;
  svgRef: RefObject<SVGSVGElement>;
  map: TopologyMap;
  storedMap: TopologyMap;
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  editable: boolean;
  enablePan: boolean;
  gridStep: number;
  snapCoord: (n: number) => number;
  view: TopologyView;
  viewRef: MutableRefObject<TopologyView>;
  commitView: (next: TopologyView | ((prev: TopologyView) => TopologyView)) => void;
  viewportRef: MutableRefObject<{ w: number; h: number }>;
  /** True enquanto um pinch de 2 dedos está ativo (dono: `useTopologyViewport`) — bloqueia pan de 1 dedo. */
  pinchActiveRef: MutableRefObject<boolean>;
  toolRef: RefObject<CanvasTool>;
  selectedNodeIds: string[];
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  setSelectedLink: Dispatch<SetStateAction<TopologyLink | null>>;
  linkFromId: string | null;
  completeLink: (targetId: string) => void;
  tryDoubleTapOpenProperties: (node: TopologyNode) => boolean;
  openSubmap: (node: TopologyNode) => void;
  openDashboardPicker: (node: TopologyNode) => void;
  onLinkSelect: (link: TopologyLink) => void;
  setHostHover: Dispatch<SetStateAction<{ node: TopologyNode; screenX: number; screenY: number } | null>>;
  closeContextMenu: () => void;
  persist: (next: TopologyMap) => void;
  /** Preview de posição/tamanho durante o arraste — estado do componente pai (alimenta `nodeLayouts`). */
  dragPreview: DragPreview;
  setDragPreview: Dispatch<SetStateAction<DragPreview>>;
  setMarqueeRect: Dispatch<SetStateAction<{ x0: number; y0: number; x1: number; y1: number } | null>>;
  setAlignGuides: Dispatch<SetStateAction<AlignGuideLine[]>>;
}

interface UseTopologyDragControllerResult {
  dragRef: MutableRefObject<DragState | null>;
  onWrapPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent, node?: TopologyNode) => void;
  onCanvasPointerDown: (e: React.PointerEvent) => void;
  onNodePointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
  onNetworkPointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
  onResizePointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
  beginPan: (e: React.PointerEvent, tapNode?: TopologyNode, tapLink?: TopologyLink) => void;
  beginLinkWaypointDrag: (
    e: React.PointerEvent,
    link: TopologyLink,
    mapX: number,
    mapY: number,
    waypointIndex?: number
  ) => void;
  resolveLinkWaypoints: (link: TopologyLink) => LinkPoint[];
  removeLinkWaypoint: (link: TopologyLink, waypointIndex: number) => void;
  resetLinkRoute: (link: TopologyLink) => void;
  clearNodeDragUi: () => void;
  /** Cancela pan/drag de 1 dedo em andamento — chamado pelo `useTopologyViewport` quando um pinch começa. */
  cancelActiveDrag: () => void;
}

/**
 * Máquina de estado de arraste do canvas (`dragRef`: pan de 1 dedo | mover nó/grupo | resize |
 * marquee | arrastar waypoint de link) + pan automático de borda (edge pan). Consome `view`/
 * `commitView`/`viewport`/`pinchActiveRef` de `useTopologyViewport` — chamado depois dele em
 * `TopologyCanvas.tsx`.
 */
export function useTopologyDragController({
  wrapRef,
  svgRef,
  map,
  storedMap,
  nodeLayouts,
  editable,
  enablePan,
  gridStep,
  snapCoord,
  view,
  viewRef,
  commitView,
  viewportRef,
  pinchActiveRef,
  toolRef,
  selectedNodeIds,
  setSelectedNodeIds,
  setSelectedLink,
  linkFromId,
  completeLink,
  tryDoubleTapOpenProperties,
  openSubmap,
  openDashboardPicker,
  onLinkSelect,
  setHostHover,
  closeContextMenu,
  persist,
  dragPreview,
  setDragPreview,
  setMarqueeRect,
  setAlignGuides,
}: UseTopologyDragControllerParams): UseTopologyDragControllerResult {
  const dragRef = useRef<DragState | null>(null);
  /** Coalesce pan setState to one frame — avoids jank on mobile. */
  const panRafRef = useRef<number | null>(null);
  const panPendingRef = useRef<{ x: number; y: number } | null>(null);
  /** Pan automático ao arrastar nó/rede perto da borda do painel. */
  const edgePanRafRef = useRef<number | null>(null);
  const edgePanPrevTsRef = useRef<number | null>(null);
  const dragPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  /** Posições do arraste — ref evita perder o último move no pointerup (state ainda não commitou). */
  const dragPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null);
  const startEdgePanLoopRef = useRef<() => void>(() => {});

  const beginPan = useCallback(
    (e: React.PointerEvent, tapNode?: TopologyNode, tapLink?: TopologyLink) => {
      if (pinchActiveRef.current) {
        return;
      }
      if (!enablePan) {
        return;
      }
      // Não chamar preventDefault no pointerdown — isso cancela click/dblclick (abrir submapa).
      e.stopPropagation();
      dragRef.current = {
        kind: 'pan',
        ox: e.clientX,
        oy: e.clientY,
        nx: view.x,
        ny: view.y,
        moved: false,
        tapNode,
        tapLink,
      };
      wrapRef.current?.setPointerCapture(e.pointerId);
    },
    [enablePan, pinchActiveRef, view.x, view.y, wrapRef]
  );

  const beginMarquee = useCallback(
    (e: React.PointerEvent, mapX: number, mapY: number) => {
      e.stopPropagation();
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (!additive) {
        setSelectedNodeIds([]);
      }
      dragRef.current = { kind: 'marquee', mapX0: mapX, mapY0: mapY, additive };
      setMarqueeRect({ x0: mapX, y0: mapY, x1: mapX, y1: mapY });
      wrapRef.current?.setPointerCapture(e.pointerId);
    },
    [setMarqueeRect, setSelectedNodeIds, wrapRef]
  );

  const resolveLinkWaypoints = useCallback(
    (link: TopologyLink): LinkPoint[] => {
      const preview = dragPreview?.linkWaypoints;
      if (preview && linksMatchEndpoints(preview, link)) {
        return preview.waypoints;
      }
      const stored = storedMap.links.find((l) => linkKey(l) === linkKey(link));
      return stored?.waypoints ?? link.waypoints ?? [];
    },
    [dragPreview?.linkWaypoints, storedMap.links]
  );

  const beginLinkWaypointDrag = useCallback(
    (e: React.PointerEvent, link: TopologyLink, mapX: number, mapY: number, waypointIndex?: number) => {
      if (!editable || e.button !== 0) {
        return;
      }
      e.stopPropagation();
      const from = nodeLayouts.get(link.from);
      const to = nodeLayouts.get(link.to);
      if (!from || !to) {
        return;
      }

      const currentWaypoints = resolveLinkWaypoints(link).map((p) => ({ ...p }));
      const geom = computeLinkGeometry(from, to, gridStep, currentWaypoints);
      const point = { x: mapX, y: mapY };
      const hitRadius = Math.max(8, 10 / view.scale);
      let index = waypointIndex;
      let pendingInsert: { x: number; y: number; insertIndex: number } | null = null;

      if (index === undefined) {
        index = currentWaypoints.findIndex((wp) => Math.hypot(wp.x - mapX, wp.y - mapY) <= hitRadius);
      }

      if (index < 0) {
        const hit = closestPointOnPolyline(geom.pathPoints, point);
        if (hit.distance > hitRadius * 1.25) {
          return;
        }
        // Não insere ainda: o snap na grade no pointerdown já entortava a linha só de tocar.
        pendingInsert = { x: hit.x, y: hit.y, insertIndex: hit.insertIndex };
        index = -1;
      }

      setSelectedNodeIds([]);
      setSelectedLink(link);
      dragRef.current = {
        kind: 'link-waypoint',
        link,
        ox: e.clientX,
        oy: e.clientY,
        waypointIndex: index,
        waypoints: currentWaypoints,
        moved: false,
        pendingInsert,
      };
      wrapRef.current?.setPointerCapture(e.pointerId);
    },
    [editable, gridStep, nodeLayouts, resolveLinkWaypoints, setSelectedLink, setSelectedNodeIds, view.scale, wrapRef]
  );

  const removeLinkWaypoint = useCallback(
    (link: TopologyLink, waypointIndex: number) => {
      const current = resolveLinkWaypoints(link);
      if (waypointIndex < 0 || waypointIndex >= current.length) {
        return;
      }
      const waypoints = current.filter((_, i) => i !== waypointIndex);
      persist(updateLinkProps(storedMap, link.from, link.to, { waypoints }));
      setDragPreview(null);
    },
    [persist, resolveLinkWaypoints, setDragPreview, storedMap]
  );

  const resetLinkRoute = useCallback(
    (link: TopologyLink) => {
      persist(updateLinkProps(storedMap, link.from, link.to, { waypoints: [] }));
      setDragPreview(null);
    },
    [persist, setDragPreview, storedMap]
  );

  const onWrapPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || e.target !== e.currentTarget) {
        return;
      }
      if (toolRef.current === 'pan') {
        setSelectedNodeIds([]);
        setSelectedLink(null);
        closeContextMenu();
        beginPan(e);
        return;
      }
      if (editable) {
        const el = wrapRef.current;
        if (!el) {
          return;
        }
        const rect = el.getBoundingClientRect();
        const { x, y } = clientToMapCoords(e.clientX, e.clientY, rect, view);
        setSelectedLink(null);
        closeContextMenu();
        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
        if (!additive) {
          setSelectedNodeIds([]);
        }
        dragRef.current = { kind: 'marquee', mapX0: x, mapY0: y, additive };
        setMarqueeRect({ x0: x, y0: y, x1: x, y1: y });
        wrapRef.current?.setPointerCapture(e.pointerId);
        return;
      }
      setSelectedNodeIds([]);
      setSelectedLink(null);
      closeContextMenu();
    },
    [beginPan, closeContextMenu, editable, setMarqueeRect, setSelectedLink, setSelectedNodeIds, toolRef, view, wrapRef]
  );

  const stopEdgePanLoop = useCallback(() => {
    if (edgePanRafRef.current != null) {
      cancelAnimationFrame(edgePanRafRef.current);
      edgePanRafRef.current = null;
    }
    edgePanPrevTsRef.current = null;
  }, []);

  const edgePanRect = useCallback((): DOMRect | null => {
    return svgRef.current?.getBoundingClientRect() ?? wrapRef.current?.getBoundingClientRect() ?? null;
  }, [svgRef, wrapRef]);

  const applyNodeDragMove = useCallback(
    (clientX: number, clientY: number, e?: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.kind !== 'node') {
        return;
      }
      if (!d.moved) {
        const dragDist = Math.hypot(clientX - d.pointerOx, clientY - d.pointerOy);
        if (dragDist < NODE_DRAG_THRESHOLD_PX) {
          return;
        }
        d.moved = true;
        if (enablePan && canMoveSelectedNode(d.node, areNetworksLocked(storedMap))) {
          startEdgePanLoopRef.current();
        }
      }
      if (d.moved && e) {
        e.preventDefault();
      }
      const rect = edgePanRect();
      if (!rect) {
        return;
      }
      const currentView = viewRef.current;
      const pointerWorld = clientToMapCoords(clientX, clientY, rect, currentView);
      const rawPrimaryX = pointerWorld.x - d.grabOffsetWorld.x;
      const rawPrimaryY = pointerWorld.y - d.grabOffsetWorld.y;
      const networksLocked = areNetworksLocked(storedMap);
      const rawMembers =
        d.group && d.group.length > 1
          ? d.group
          : [
              {
                id: d.node.id,
                startX: d.startX,
                startY: d.startY,
                startW: d.startW,
                startH: d.startH,
              },
            ];
      const members = rawMembers.filter((m) => {
        const n = map.nodes.find((node) => node.id === m.id);
        return Boolean(n && canMoveSelectedNode(n, networksLocked));
      });
      if (members.length === 0) {
        return;
      }
      const primary = members.find((m) => m.id === d.node.id) ?? members[0];
      const primarySnapped = snapNodeCenterToGrid(rawPrimaryX, rawPrimaryY, d.startW, d.startH, gridStep);
      const sdx = primarySnapped.x - d.startX;
      const sdy = primarySnapped.y - d.startY;
      const positions: Record<string, { x: number; y: number }> = {};
      for (const member of members) {
        positions[member.id] = snapNodeCenterToGrid(
          member.startX + sdx,
          member.startY + sdy,
          member.startW,
          member.startH,
          gridStep
        );
      }

      const primaryPos = positions[primary.id];
      if (!primaryPos) {
        return;
      }

      dragPositionsRef.current = positions;
      setDragPreview({ positions });

      const draggedIds = new Set(Object.keys(positions));
      const guideThreshold = Math.max(6, gridStep * 0.5);
      const pad = gridStep * 2;
      const vp = viewportRef.current;
      let x0 = 0;
      let y0 = 0;
      let x1 = map.width;
      let y1 = map.height;
      if (vp.w > 0 && vp.h > 0 && currentView.scale > 0) {
        x0 = Math.min(x0, -currentView.x / currentView.scale);
        y0 = Math.min(y0, -currentView.y / currentView.scale);
        x1 = Math.max(x1, (vp.w - currentView.x) / currentView.scale);
        y1 = Math.max(y1, (vp.h - currentView.y) / currentView.scale);
      }
      const bounds = {
        x0: Math.floor((x0 - pad) / gridStep) * gridStep,
        y0: Math.floor((y0 - pad) / gridStep) * gridStep,
        x1: Math.ceil((x1 + pad) / gridStep) * gridStep,
        y1: Math.ceil((y1 + pad) / gridStep) * gridStep,
      };
      const others = map.nodes
        .filter((n) => !draggedIds.has(n.id))
        .flatMap((n) => {
          const layout = nodeLayouts.get(n.id);
          if (!layout) {
            return [];
          }
          return [
            {
              id: n.id,
              x: layout.x,
              y: layout.y,
              w: layout.w,
              h: layout.h,
              type: n.type,
            },
          ];
        });
      setAlignGuides(
        computeAlignGuides({
          dragged: {
            id: primary.id,
            x: primaryPos.x,
            y: primaryPos.y,
            w: primary.startW,
            h: primary.startH,
          },
          others,
          bounds,
          threshold: guideThreshold,
        })
      );
    },
    [edgePanRect, enablePan, gridStep, map.height, map.nodes, map.width, nodeLayouts, setAlignGuides, setDragPreview, storedMap, viewRef, viewportRef]
  );

  const runEdgePanFrame = useCallback(
    (timestamp: number) => {
      const d = dragRef.current;
      const ptr = dragPointerRef.current;
      if (!d || d.kind !== 'node' || !d.moved || !enablePan || !ptr) {
        edgePanRafRef.current = null;
        edgePanPrevTsRef.current = null;
        return;
      }

      const rect = edgePanRect();
      if (!rect) {
        edgePanRafRef.current = requestAnimationFrame(runEdgePanFrame);
        return;
      }

      const prevTs = edgePanPrevTsRef.current ?? timestamp;
      edgePanPrevTsRef.current = timestamp;
      const dt = Math.min((timestamp - prevTs) / 1000, 0.05);

      const { vx, vy } = computeEdgePanVelocity(ptr.clientX, ptr.clientY, rect, EDGE_PAN_THRESHOLD, EDGE_PAN_MAX_SPEED);

      if (vx !== 0 || vy !== 0) {
        const v = viewRef.current;
        commitView({ ...v, x: v.x + vx * dt, y: v.y + vy * dt });
        applyNodeDragMove(ptr.clientX, ptr.clientY);
      }

      edgePanRafRef.current = requestAnimationFrame(runEdgePanFrame);
    },
    [applyNodeDragMove, commitView, edgePanRect, enablePan, viewRef]
  );

  const startEdgePanLoop = useCallback(() => {
    if (edgePanRafRef.current != null) {
      return;
    }
    edgePanPrevTsRef.current = null;
    edgePanRafRef.current = requestAnimationFrame(runEdgePanFrame);
  }, [runEdgePanFrame]);
  startEdgePanLoopRef.current = startEdgePanLoop;

  const beginNodeDrag = useCallback(
    (e: React.PointerEvent, node: TopologyNode, startX: number, startY: number, startW: number, startH: number) => {
      e.preventDefault();
      const el = wrapRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const currentView = viewRef.current;
      const pointerWorld = clientToMapCoords(e.clientX, e.clientY, rect, currentView);
      const networksLocked = areNetworksLocked(storedMap);
      let group: DragGroupMember[] | undefined;
      if (selectedNodeIds.length >= 2 && selectedNodeIds.includes(node.id)) {
        group = buildDragGroupMembers(selectedNodeIds, map.nodes, nodeLayouts, networksLocked);
      }
      dragPositionsRef.current = null;
      dragPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
      dragRef.current = {
        kind: 'node',
        node,
        grabOffsetWorld: { x: pointerWorld.x - startX, y: pointerWorld.y - startY },
        pointerOx: e.clientX,
        pointerOy: e.clientY,
        startX,
        startY,
        startW,
        startH,
        moved: false,
        group,
      };
      setHostHover(null);
      wrapRef.current?.setPointerCapture(e.pointerId);
    },
    [map.nodes, nodeLayouts, selectedNodeIds, setHostHover, storedMap, viewRef, wrapRef]
  );

  useEffect(() => () => stopEdgePanLoop(), [stopEdgePanLoop]);

  /** Cancela o rAF de pan coalescido se o painel desmontar no meio de um arraste. */
  useEffect(
    () => () => {
      if (panRafRef.current != null) {
        cancelAnimationFrame(panRafRef.current);
        panRafRef.current = null;
      }
      panPendingRef.current = null;
    },
    []
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent, node: TopologyNode) => {
      if (
        !editable ||
        (node.type !== 'network' && node.type !== 'static' && node.type !== 'submap' && node.type !== 'dashboard_picker')
      ) {
        return;
      }
      e.stopPropagation();
      const layout = nodeLayouts.get(node.id);
      const defaultW =
        node.type === 'static'
          ? DEFAULT_STATIC_WIDTH
          : node.type === 'submap' || node.type === 'dashboard_picker'
            ? 120
            : DEFAULT_NETWORK_WIDTH;
      const defaultH =
        node.type === 'static'
          ? DEFAULT_STATIC_HEIGHT
          : node.type === 'submap' || node.type === 'dashboard_picker'
            ? 36
            : DEFAULT_NETWORK_HEIGHT;
      dragRef.current = {
        kind: 'resize',
        node,
        ox: e.clientX,
        oy: e.clientY,
        startW: layout?.w ?? node.width ?? defaultW,
        startH: layout?.h ?? node.height ?? defaultH,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [editable, nodeLayouts]
  );

  const onNodePointerDown = useCallback(
    (e: React.PointerEvent, node: TopologyNode) => {
      e.stopPropagation();
      if (toolRef.current === 'pan') {
        if (e.button === 0) {
          beginPan(e, node);
        }
        return;
      }
      if (!editable || node.type === 'network') {
        return;
      }
      const layout = nodeLayouts.get(node.id);
      const startX = layout?.x ?? node.x;
      const startY = layout?.y ?? node.y;
      beginNodeDrag(e, node, startX, startY, layout?.w ?? node.width ?? 48, layout?.h ?? node.height ?? 28);
    },
    [beginNodeDrag, beginPan, editable, nodeLayouts, toolRef]
  );

  /** Redes travadas por padrão — destrave na toolbar para arrastar a caixa. */
  const onNetworkPointerDown = useCallback(
    (e: React.PointerEvent, node: TopologyNode) => {
      if (e.button !== 0) {
        return;
      }
      e.stopPropagation();
      setSelectedLink(null);

      if (toolRef.current === 'pan') {
        beginPan(e, node);
        return;
      }

      const layout = nodeLayouts.get(node.id);
      const networksLocked = areNetworksLocked(storedMap);

      if (networksLocked) {
        if (editable) {
          const el = wrapRef.current;
          if (el) {
            const rect = el.getBoundingClientRect();
            const { x, y } = clientToMapCoords(e.clientX, e.clientY, rect, view);
            beginMarquee(e, x, y);
          }
        }
        return;
      }

      if (editable) {
        beginNodeDrag(
          e,
          node,
          layout?.x ?? node.x,
          layout?.y ?? node.y,
          layout?.w ?? node.width ?? DEFAULT_NETWORK_WIDTH,
          layout?.h ?? node.height ?? DEFAULT_NETWORK_HEIGHT
        );
      }
    },
    [beginMarquee, beginNodeDrag, beginPan, editable, nodeLayouts, setSelectedLink, storedMap, toolRef, view, wrapRef]
  );

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) {
        return;
      }
      setSelectedLink(null);
      closeContextMenu();
      if (toolRef.current === 'pan') {
        setSelectedNodeIds([]);
        beginPan(e);
        return;
      }
      // Seta: arrastar no fundo = caixa de seleção (como mouse de seleção múltipla).
      if (editable) {
        e.stopPropagation();
        const el = wrapRef.current;
        if (!el) {
          return;
        }
        const rect = el.getBoundingClientRect();
        const { x, y } = clientToMapCoords(e.clientX, e.clientY, rect, view);
        beginMarquee(e, x, y);
        return;
      }
      setSelectedNodeIds([]);
    },
    [beginMarquee, beginPan, closeContextMenu, editable, setSelectedLink, setSelectedNodeIds, toolRef, view, wrapRef]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pinchActiveRef.current) {
        return;
      }
      const d = dragRef.current;
      if (!d) {
        return;
      }
      if (d.kind === 'pan') {
        // Evita scroll do dashboard no meio do gesto (especialmente mobile).
        const dist = Math.hypot(e.clientX - d.ox, e.clientY - d.oy);
        if (dist > 4) {
          d.moved = true;
        }
        if (d.moved) {
          e.preventDefault();
        }
        const nextX = d.nx + (e.clientX - d.ox);
        const nextY = d.ny + (e.clientY - d.oy);
        panPendingRef.current = { x: nextX, y: nextY };
        if (panRafRef.current == null) {
          panRafRef.current = requestAnimationFrame(() => {
            panRafRef.current = null;
            const pending = panPendingRef.current;
            if (!pending || dragRef.current?.kind !== 'pan' || pinchActiveRef.current) {
              return;
            }
            // Só aplica pan depois de sair do limiar de clique/tap.
            if (!dragRef.current.moved) {
              return;
            }
            commitView((v) => ({ ...v, x: pending.x, y: pending.y }));
          });
        }
        return;
      }
      if (d.kind === 'node') {
        dragPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
        applyNodeDragMove(e.clientX, e.clientY, e);
        return;
      }
      if (d.kind === 'resize') {
        const dw = (e.clientX - d.ox) / view.scale;
        const dh = (e.clientY - d.oy) / view.scale;
        if (Math.abs(dw) > 2 || Math.abs(dh) > 2) {
          d.moved = true;
        }
        setDragPreview({
          nodeId: d.node.id,
          width: Math.max(gridStep * 2, snapCoord(d.startW + dw)),
          height: Math.max(gridStep * 2, snapCoord(d.startH + dh)),
        });
        return;
      }
      if (d.kind === 'link-waypoint') {
        const el = wrapRef.current;
        if (!el) {
          return;
        }
        // Limiar em px de tela — evita dobrar ao “triscar” ou selecionar o cabo.
        const dragDist = Math.hypot(e.clientX - d.ox, e.clientY - d.oy);
        if (!d.moved) {
          if (dragDist < 10) {
            return;
          }
          d.moved = true;
          if (d.pendingInsert) {
            const insert = d.pendingInsert;
            d.waypoints = [...d.waypoints];
            d.waypoints.splice(insert.insertIndex, 0, {
              x: snapCoord(insert.x),
              y: snapCoord(insert.y),
            });
            d.waypointIndex = insert.insertIndex;
            d.pendingInsert = null;
          }
        }
        if (d.waypointIndex < 0) {
          return;
        }
        const rect = el.getBoundingClientRect();
        const { x, y } = clientToMapCoords(e.clientX, e.clientY, rect, view);
        const waypoints = d.waypoints.map((wp, i) => (i === d.waypointIndex ? { x: snapCoord(x), y: snapCoord(y) } : wp));
        d.waypoints = waypoints;
        setDragPreview({ linkWaypoints: { from: d.link.from, to: d.link.to, waypoints } });
        return;
      }
      if (d.kind === 'marquee') {
        const el = wrapRef.current;
        if (!el) {
          return;
        }
        const rect = el.getBoundingClientRect();
        const { x, y } = clientToMapCoords(e.clientX, e.clientY, rect, view);
        setMarqueeRect({ x0: d.mapX0, y0: d.mapY0, x1: x, y1: y });
      }
    },
    [applyNodeDragMove, commitView, pinchActiveRef, setDragPreview, setMarqueeRect, snapCoord, view, wrapRef, gridStep]
  );

  const clearDragUi = useCallback(() => {
    setAlignGuides([]);
  }, [setAlignGuides]);

  const clearNodeDragUi = useCallback(() => {
    dragPositionsRef.current = null;
    setDragPreview(null);
    clearDragUi();
  }, [clearDragUi, setDragPreview]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent, node?: TopologyNode) => {
      const d = dragRef.current;
      if (!d) {
        return;
      }
      if (d.kind === 'node') {
        applyNodeDragMove(e.clientX, e.clientY, e);
      }
      dragRef.current = null;
      dragPointerRef.current = null;
      stopEdgePanLoop();
      if (panRafRef.current != null) {
        cancelAnimationFrame(panRafRef.current);
        panRafRef.current = null;
      }
      if (d?.kind === 'pan' && d.moved && panPendingRef.current) {
        const pending = panPendingRef.current;
        panPendingRef.current = null;
        commitView((v) => ({ ...v, x: pending.x, y: pending.y }));
      } else {
        panPendingRef.current = null;
      }
      try {
        wrapRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }

      // Tap em submapa / seletor (visualização): pointer capture no wrap mata o click nativo.
      if (d?.kind === 'pan' && !d.moved) {
        const tap = d.tapNode ?? node;
        if (!editable && tap?.type === 'submap') {
          openSubmap(tap);
          return;
        }
        if (!editable && tap?.type === 'dashboard_picker') {
          openDashboardPicker(tap);
          return;
        }
        // Tap no cabo: mesma situação — captura no wrap mata o click.
        if (d.tapLink) {
          onLinkSelect(d.tapLink);
          return;
        }
        if (editable) {
          const tap = d.tapNode ?? node;
          if (tap && tryDoubleTapOpenProperties(tap)) {
            return;
          }
        }
      }

      if (d?.kind === 'marquee') {
        setMarqueeRect(null);
        const el = wrapRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const { x: x1, y: y1 } = clientToMapCoords(e.clientX, e.clientY, rect, view);
          const sel = normalizeRect(d.mapX0, d.mapY0, x1, y1);
          if (sel.w > 4 || sel.h > 4) {
            const ids: string[] = [];
            for (const n of map.nodes) {
              const layout = nodeLayouts.get(n.id);
              if (!layout) {
                continue;
              }
              if (n.type === 'network' && areNetworksLocked(storedMap)) {
                continue;
              }
              const lx = layout.x;
              const ly = layout.y;
              const lw = layout.w;
              const lh = layout.h;
              if (rectsOverlap(sel.x, sel.y, sel.w, sel.h, lx, ly, lw, lh)) {
                ids.push(n.id);
              }
            }
            if (d.additive) {
              setSelectedNodeIds((prev) => [...new Set([...prev, ...ids])]);
            } else {
              setSelectedNodeIds(ids);
            }
          }
        }
        return;
      }

      if (d?.kind === 'link-waypoint') {
        if (d.moved && d.waypointIndex >= 0) {
          persist(updateLinkProps(storedMap, d.link.from, d.link.to, { waypoints: d.waypoints }));
        }
        setDragPreview(null);
        return;
      }

      if (d?.kind === 'node' && d.moved) {
        const positions = dragPositionsRef.current;
        if (positions) {
          const moves = Object.entries(positions).map(([nodeId, pos]) => ({
            nodeId,
            x: pos.x,
            y: pos.y,
          }));
          persist(moveStoredNodesBulk(storedMap, moves, (nodeId) => findNodeById(map.nodes, nodeId)));
        }
        dragPositionsRef.current = null;
        setDragPreview(null);
        clearDragUi();
      } else if (d?.kind === 'node') {
        dragPositionsRef.current = null;
        setDragPreview(null);
        clearDragUi();
      }

      if (d?.kind === 'resize' && dragPreview && d.moved) {
        persist(
          updateStoredNode(storedMap, d.node, {
            width: dragPreview.width,
            height: dragPreview.height,
          })
        );
        setDragPreview(null);
      }

      const tapNode = d?.kind === 'node' ? d.node : node;

      if (tapNode && d?.kind === 'node' && !d.moved && linkFromId !== null) {
        completeLink(tapNode.id);
        return;
      }

      if (tapNode && d?.kind === 'node' && !d.moved && linkFromId === null) {
        if (tryDoubleTapOpenProperties(tapNode)) {
          return;
        }
        if (e.ctrlKey || e.metaKey) {
          setSelectedNodeIds((prev) => {
            const next = new Set(prev);
            if (next.has(tapNode.id)) {
              next.delete(tapNode.id);
            } else {
              next.add(tapNode.id);
            }
            return [...next];
          });
        } else {
          setSelectedNodeIds([tapNode.id]);
        }
        setSelectedLink(null);
      }
    },
    [
      applyNodeDragMove,
      clearDragUi,
      commitView,
      completeLink,
      dragPreview,
      editable,
      linkFromId,
      map.nodes,
      nodeLayouts,
      onLinkSelect,
      openDashboardPicker,
      openSubmap,
      persist,
      setDragPreview,
      setMarqueeRect,
      setSelectedLink,
      setSelectedNodeIds,
      stopEdgePanLoop,
      storedMap,
      tryDoubleTapOpenProperties,
      view,
      wrapRef,
    ]
  );

  const cancelActiveDrag = useCallback(() => {
    dragRef.current = null;
    if (edgePanRafRef.current != null) {
      cancelAnimationFrame(edgePanRafRef.current);
      edgePanRafRef.current = null;
    }
    dragPointerRef.current = null;
    if (panRafRef.current != null) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = null;
    }
    panPendingRef.current = null;
  }, []);

  return {
    dragRef,
    onWrapPointerDown,
    onPointerMove,
    onPointerUp,
    onCanvasPointerDown,
    onNodePointerDown,
    onNetworkPointerDown,
    onResizePointerDown,
    beginPan,
    beginLinkWaypointDrag,
    resolveLinkWaypoints,
    removeLinkWaypoint,
    resetLinkRoute,
    clearNodeDragUi,
    cancelActiveDrag,
  };
}
