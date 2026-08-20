import React, {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { CanvasTool, TopologyLink, TopologyMap, TopologyNode, TopologyView } from '../types';
import { areNetworksLocked, moveStoredNodesBulk, updateStoredNode } from '../utils/mapEdits';
import { clientToMapCoords } from '../utils/mapCoords';
import { snapNodeCenterToGrid } from '../utils/mapCoords';
import { DEFAULT_NETWORK_HEIGHT, DEFAULT_NETWORK_WIDTH, NodeLayout } from '../utils/nodeLayout';
import { findNodeById } from '../utils/topologyNodes';
import { AlignGuideLine, computeAlignGuides } from '../utils/alignGuides';
import { LinkPoint } from '../utils/linkGeometry';
import {
  buildDragGroupMembers,
  canMoveSelectedNode,
  defaultResizeSize,
  DragGroupMember,
  DragPreview,
  DragState,
  NODE_DRAG_THRESHOLD_PX,
} from '../utils/dragState';
import { computeGroupPositions, computeGuideBounds, guideReferenceNodes } from '../utils/dragMove';
import { nodesInMarquee, normalizeRect } from '../utils/marqueeSelection';
import { useEdgePanLoop } from './useEdgePanLoop';
import { useLinkWaypointGestures } from './useLinkWaypointGestures';

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
  tryDoubleTapEnterChildMap: (node: TopologyNode) => boolean;
  openSubmap: (node: TopologyNode) => void;
  openDashboardPicker: (node: TopologyNode) => void;
  onLinkSelect: (link: TopologyLink) => void;
  clearHostHover: () => void;
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
  beginWaypointDragFromPath: (e: React.PointerEvent, link: TopologyLink) => void;
  removeWaypointNearPointer: (e: React.MouseEvent, link: TopologyLink) => void;
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
  tryDoubleTapEnterChildMap,
  openSubmap,
  openDashboardPicker,
  onLinkSelect,
  clearHostHover,
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
  /** Posições do arraste — ref evita perder o último move no pointerup (state ainda não commitou). */
  const dragPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null);
  /** Tamanho do resize — mesma razão que `dragPositionsRef` (state de preview pode atrasar no pointerup). */
  const resizePreviewRef = useRef<{ width: number; height: number } | null>(null);
  const applyNodeDragMoveRef = useRef<(clientX: number, clientY: number) => void>(() => {});

  const edgePan = useEdgePanLoop({
    wrapRef,
    svgRef,
    enablePan,
    viewRef,
    commitView,
    dragRef,
    applyMoveRef: applyNodeDragMoveRef,
  });

  /** Coordenada do mapa sob o ponteiro, na view atual. */
  const clientToMap = useCallback(
    (clientX: number, clientY: number) => {
      const el = wrapRef.current;
      if (!el) {
        return null;
      }
      return clientToMapCoords(clientX, clientY, el.getBoundingClientRect(), view);
    },
    [view, wrapRef]
  );

  /**
   * Ids que podem se mover no arraste atual (redes travadas ficam de fora).
   *
   * Consultado a cada `pointermove`; como conjunto pronto evita o `map.nodes.find()` por membro
   * selecionado, que tornava o arraste de uma seleção grande O(seleção × nós) por frame.
   */
  const movableNodeIds = useMemo(() => {
    const networksLocked = areNetworksLocked(storedMap);
    const ids = new Set<string>();
    for (const node of map.nodes) {
      if (canMoveSelectedNode(node, networksLocked)) {
        ids.add(node.id);
      }
    }
    return ids;
  }, [map.nodes, storedMap]);

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

  const {
    resolveLinkWaypoints,
    beginLinkWaypointDrag,
    beginWaypointDragFromPath,
    removeWaypointNearPointer,
    moveLinkWaypoint,
    commitLinkWaypoint,
    removeLinkWaypoint,
    resetLinkRoute,
  } = useLinkWaypointGestures({
    wrapRef,
    dragRef,
    storedMap,
    nodeLayouts,
    editable,
    gridStep,
    snapCoord,
    view,
    dragPreview,
    setDragPreview,
    setSelectedNodeIds,
    setSelectedLink,
    persist,
    clientToMap,
  });

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
        const point = clientToMap(e.clientX, e.clientY);
        if (!point) {
          return;
        }
        setSelectedLink(null);
        closeContextMenu();
        beginMarquee(e, point.x, point.y);
        return;
      }
      setSelectedNodeIds([]);
      setSelectedLink(null);
      closeContextMenu();
    },
    [beginMarquee, beginPan, clientToMap, closeContextMenu, editable, setSelectedLink, setSelectedNodeIds, toolRef]
  );

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
          edgePan.start();
        }
      }
      if (d.moved && e) {
        e.preventDefault();
      }
      const rect = edgePan.rect();
      if (!rect) {
        return;
      }
      const currentView = viewRef.current;
      const pointerWorld = clientToMapCoords(clientX, clientY, rect, currentView);
      const rawPrimaryX = pointerWorld.x - d.grabOffsetWorld.x;
      const rawPrimaryY = pointerWorld.y - d.grabOffsetWorld.y;
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
      const members = rawMembers.filter((m) => movableNodeIds.has(m.id));
      if (members.length === 0) {
        return;
      }
      const primary = members.find((m) => m.id === d.node.id) ?? members[0];
      const positions = computeGroupPositions(members, primary, rawPrimaryX, rawPrimaryY, gridStep);

      const primaryPos = positions[primary.id];
      if (!primaryPos) {
        return;
      }

      dragPositionsRef.current = positions;
      setDragPreview({ positions });

      const draggedIds = new Set(Object.keys(positions));
      const bounds = computeGuideBounds({
        mapWidth: map.width,
        mapHeight: map.height,
        view: currentView,
        viewport: viewportRef.current,
        gridStep,
      });
      const others = guideReferenceNodes(map.nodes, draggedIds, nodeLayouts);
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
          threshold: Math.max(6, gridStep * 0.5),
        })
      );
    },
    [edgePan, enablePan, gridStep, map.height, map.nodes, map.width, movableNodeIds, nodeLayouts, setAlignGuides, setDragPreview, storedMap, viewRef, viewportRef]
  );

  applyNodeDragMoveRef.current = applyNodeDragMove;

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
      edgePan.pointerRef.current = { clientX: e.clientX, clientY: e.clientY };
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
      clearHostHover();
      wrapRef.current?.setPointerCapture(e.pointerId);
    },
    [clearHostHover, map.nodes, nodeLayouts, selectedNodeIds, storedMap, viewRef, wrapRef]
  );

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

  const applyResizeMove = useCallback(
    (clientX: number, clientY: number) => {
      const d = dragRef.current;
      if (!d || d.kind !== 'resize') {
        return;
      }
      const dw = (clientX - d.ox) / viewRef.current.scale;
      const dh = (clientY - d.oy) / viewRef.current.scale;
      if (Math.abs(dw) > 2 || Math.abs(dh) > 2) {
        d.moved = true;
      }
      const width = Math.max(gridStep * 2, snapCoord(d.startW + dw));
      const height = Math.max(gridStep * 2, snapCoord(d.startH + dh));
      resizePreviewRef.current = { width, height };
      setDragPreview({ nodeId: d.node.id, width, height });
    },
    [gridStep, setDragPreview, snapCoord, viewRef]
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
      const fallback = defaultResizeSize(node);
      resizePreviewRef.current = null;
      dragRef.current = {
        kind: 'resize',
        node,
        ox: e.clientX,
        oy: e.clientY,
        startW: layout?.w ?? node.width ?? fallback.w,
        startH: layout?.h ?? node.height ?? fallback.h,
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
          const point = clientToMap(e.clientX, e.clientY);
          if (point) {
            beginMarquee(e, point.x, point.y);
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
    [beginMarquee, beginNodeDrag, beginPan, clientToMap, editable, nodeLayouts, setSelectedLink, storedMap, toolRef]
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
        const point = clientToMap(e.clientX, e.clientY);
        if (!point) {
          return;
        }
        beginMarquee(e, point.x, point.y);
        return;
      }
      setSelectedNodeIds([]);
    },
    [beginMarquee, beginPan, clientToMap, closeContextMenu, editable, setSelectedLink, setSelectedNodeIds, toolRef]
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
            // Aplica o delta acumulado desde o 1º pixel — o limiar de 4px só decide
            // "clique vs arraste" (d.moved) no pointerup; represar o pan até o limiar
            // fazia o mapa "pular" de uma vez o delta acumulado ao cruzá-lo.
            commitView((v) => ({ ...v, x: pending.x, y: pending.y }));
          });
        }
        return;
      }
      if (d.kind === 'node') {
        edgePan.pointerRef.current = { clientX: e.clientX, clientY: e.clientY };
        applyNodeDragMove(e.clientX, e.clientY, e);
        return;
      }
      if (d.kind === 'resize') {
        applyResizeMove(e.clientX, e.clientY);
        return;
      }
      if (d.kind === 'link-waypoint') {
        moveLinkWaypoint(e, d);
        return;
      }
      if (d.kind === 'marquee') {
        const point = clientToMap(e.clientX, e.clientY);
        if (!point) {
          return;
        }
        setMarqueeRect({ x0: d.mapX0, y0: d.mapY0, x1: point.x, y1: point.y });
      }
    },
    [
      applyNodeDragMove,
      applyResizeMove,
      clientToMap,
      commitView,
      edgePan,
      moveLinkWaypoint,
      pinchActiveRef,
      setMarqueeRect,
    ]
  );

  const clearDragUi = useCallback(() => {
    setAlignGuides([]);
  }, [setAlignGuides]);

  const clearNodeDragUi = useCallback(() => {
    dragPositionsRef.current = null;
    resizePreviewRef.current = null;
    setDragPreview(null);
    clearDragUi();
  }, [clearDragUi, setDragPreview]);

  /** Encerra o gesto: solta refs, para o pan de borda e aplica o pan pendente. */
  const endGestureBookkeeping = useCallback(
    (drag: DragState, e: React.PointerEvent) => {
      dragRef.current = null;
      edgePan.pointerRef.current = null;
      edgePan.stop();
      if (panRafRef.current != null) {
        cancelAnimationFrame(panRafRef.current);
        panRafRef.current = null;
      }
      const pending = panPendingRef.current;
      panPendingRef.current = null;
      if (drag.kind === 'pan' && drag.moved && pending) {
        commitView((v) => ({ ...v, x: pending.x, y: pending.y }));
      }
      try {
        wrapRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
    [commitView, edgePan, wrapRef]
  );

  /**
   * Toque curto com a mão (sem arrastar). O pointer capture no wrap mata o `click` nativo, então
   * abrir submapa, seletor, cabo e propriedades por duplo toque acontece aqui.
   * Devolve `true` quando o toque já foi tratado.
   */
  const handlePanTap = useCallback(
    (drag: DragState, node?: TopologyNode): boolean => {
      if (drag.kind !== 'pan' || drag.moved) {
        return false;
      }
      const tap = drag.tapNode ?? node;
      if (!editable && tap?.type === 'submap') {
        openSubmap(tap);
        return true;
      }
      if (!editable && tap?.type === 'dashboard_picker') {
        openDashboardPicker(tap);
        return true;
      }
      if (drag.tapLink) {
        onLinkSelect(drag.tapLink);
        return true;
      }
      if (editable && tap && tryDoubleTapEnterChildMap(tap)) {
        return true;
      }
      return Boolean(editable && tap && tryDoubleTapOpenProperties(tap));
    },
    [editable, onLinkSelect, openDashboardPicker, openSubmap, tryDoubleTapEnterChildMap, tryDoubleTapOpenProperties]
  );

  /** Fecha o laço de seleção: abaixo de 4px foi clique, não laço — não mexe na seleção. */
  const commitMarquee = useCallback(
    (drag: Extract<DragState, { kind: 'marquee' }>, e: React.PointerEvent) => {
      setMarqueeRect(null);
      const corner = clientToMap(e.clientX, e.clientY);
      if (!corner) {
        return;
      }
      const sel = normalizeRect(drag.mapX0, drag.mapY0, corner.x, corner.y);
      if (sel.w <= 4 && sel.h <= 4) {
        return;
      }
      const ids = nodesInMarquee(sel, map.nodes, nodeLayouts, areNetworksLocked(storedMap));
      setSelectedNodeIds((prev) => (drag.additive ? [...new Set([...prev, ...ids])] : ids));
    },
    [clientToMap, map.nodes, nodeLayouts, setMarqueeRect, setSelectedNodeIds, storedMap]
  );

  /** Grava as posições do arraste (um nó ou o grupo inteiro) e limpa o preview. */
  const commitNodeDrag = useCallback(
    (moved: boolean) => {
      const positions = dragPositionsRef.current;
      if (moved && positions) {
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
    },
    [clearDragUi, map.nodes, persist, setDragPreview, storedMap]
  );

  /** Clique em nó sem arraste: fecha o link em andamento ou atualiza a seleção. */
  const handleNodeTap = useCallback(
    (tapNode: TopologyNode, e: React.PointerEvent) => {
      if (linkFromId !== null) {
        completeLink(tapNode.id);
        return;
      }
      if (tryDoubleTapEnterChildMap(tapNode)) {
        return;
      }
      if (tryDoubleTapOpenProperties(tapNode)) {
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        setSelectedNodeIds((prev) =>
          prev.includes(tapNode.id) ? prev.filter((id) => id !== tapNode.id) : [...prev, tapNode.id]
        );
      } else {
        setSelectedNodeIds([tapNode.id]);
      }
      setSelectedLink(null);
    },
    [completeLink, linkFromId, setSelectedLink, setSelectedNodeIds, tryDoubleTapEnterChildMap, tryDoubleTapOpenProperties]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent, node?: TopologyNode) => {
      const d = dragRef.current;
      if (!d) {
        return;
      }
      if (d.kind === 'node') {
        applyNodeDragMove(e.clientX, e.clientY, e);
      }
      if (d.kind === 'resize') {
        applyResizeMove(e.clientX, e.clientY);
      }
      endGestureBookkeeping(d, e);

      if (handlePanTap(d, node)) {
        return;
      }

      if (d.kind === 'marquee') {
        commitMarquee(d, e);
        return;
      }

      if (d.kind === 'link-waypoint') {
        commitLinkWaypoint(d);
        return;
      }

      if (d.kind === 'node') {
        commitNodeDrag(d.moved);
      }

      if (d.kind === 'resize' && d.moved) {
        const preview = resizePreviewRef.current;
        if (preview) {
          persist(updateStoredNode(storedMap, d.node, { width: preview.width, height: preview.height }));
        }
        resizePreviewRef.current = null;
        setDragPreview(null);
      }

      const tapNode = d.kind === 'node' ? d.node : node;
      if (tapNode && d.kind === 'node' && !d.moved) {
        handleNodeTap(tapNode, e);
      }
    },
    [
      applyNodeDragMove,
      applyResizeMove,
      commitLinkWaypoint,
      commitMarquee,
      commitNodeDrag,
      endGestureBookkeeping,
      handleNodeTap,
      handlePanTap,
      persist,
      setDragPreview,
      storedMap,
    ]
  );

  const cancelActiveDrag = useCallback(() => {
    dragRef.current = null;
    edgePan.stop();
    edgePan.pointerRef.current = null;
    if (panRafRef.current != null) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = null;
    }
    panPendingRef.current = null;
  }, [edgePan]);

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
    beginWaypointDragFromPath,
    removeWaypointNearPointer,
    resolveLinkWaypoints,
    removeLinkWaypoint,
    resetLinkRoute,
    clearNodeDragUi,
    cancelActiveDrag,
  };
}
