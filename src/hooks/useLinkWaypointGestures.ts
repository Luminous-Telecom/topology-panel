import React, { Dispatch, MutableRefObject, RefObject, SetStateAction, useCallback } from 'react';
import { TopologyLink, TopologyMap, TopologyNode, TopologyView } from '../types';
import { DragPreview, DragState } from '../utils/dragState';
import {
  closestPointOnPolyline,
  computeLinkGeometry,
  LinkPoint,
  nearestWaypointIndex,
} from '../utils/linkGeometry';
import { linkKey, linksMatchEndpoints, updateLinkProps } from '../utils/mapEdits';
import { NodeLayout } from '../utils/nodeLayout';

export interface LinkWaypointGesturesParams {
  wrapRef: RefObject<HTMLDivElement>;
  dragRef: MutableRefObject<DragState | null>;
  storedMap: TopologyMap;
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  editable: boolean;
  gridStep: number;
  snapCoord: (n: number) => number;
  view: TopologyView;
  dragPreview: DragPreview;
  setDragPreview: Dispatch<SetStateAction<DragPreview>>;
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  setSelectedLink: Dispatch<SetStateAction<TopologyLink | null>>;
  persist: (next: TopologyMap) => void;
  clientToMap: (clientX: number, clientY: number) => { x: number; y: number } | null;
}

export interface LinkWaypointGesturesApi {
  resolveLinkWaypoints: (link: TopologyLink) => LinkPoint[];
  beginLinkWaypointDrag: (
    e: React.PointerEvent,
    link: TopologyLink,
    mapX: number,
    mapY: number,
    waypointIndex?: number
  ) => void;
  beginWaypointDragFromPath: (e: React.PointerEvent, link: TopologyLink) => void;
  removeWaypointNearPointer: (e: React.MouseEvent, link: TopologyLink) => void;
  /** Passo de `pointermove` quando o gesto atual é de waypoint. */
  moveLinkWaypoint: (e: React.PointerEvent, drag: Extract<DragState, { kind: 'link-waypoint' }>) => void;
  /** Passo de `pointerup`: grava a rota nova, se houve movimento de fato. */
  commitLinkWaypoint: (drag: Extract<DragState, { kind: 'link-waypoint' }>) => void;
  removeLinkWaypoint: (link: TopologyLink, waypointIndex: number) => void;
  resetLinkRoute: (link: TopologyLink) => void;
}

/** Movimento mínimo em px de tela antes de dobrar o cabo — evita curvar só de encostar. */
const WAYPOINT_DRAG_THRESHOLD_PX = 10;

/**
 * Desvios manuais do cabo (waypoints): criar arrastando a linha, mover, remover e voltar à reta.
 *
 * Compartilha o `dragRef` com o controlador de arraste porque só pode existir um gesto por vez no
 * canvas — arrastar um cabo e um nó ao mesmo tempo não faz sentido.
 */
export function useLinkWaypointGestures({
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
}: LinkWaypointGesturesParams): LinkWaypointGesturesApi {
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
    [
      dragRef,
      editable,
      gridStep,
      nodeLayouts,
      resolveLinkWaypoints,
      setSelectedLink,
      setSelectedNodeIds,
      view.scale,
      wrapRef,
    ]
  );

  const moveLinkWaypoint = useCallback(
    (e: React.PointerEvent, d: Extract<DragState, { kind: 'link-waypoint' }>) => {
      // Limiar em px de tela — evita dobrar ao “triscar” ou selecionar o cabo.
      const dragDist = Math.hypot(e.clientX - d.ox, e.clientY - d.oy);
      if (!d.moved) {
        if (dragDist < WAYPOINT_DRAG_THRESHOLD_PX) {
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
      const point = clientToMap(e.clientX, e.clientY);
      if (!point) {
        return;
      }
      const waypoints = d.waypoints.map((wp, i) =>
        i === d.waypointIndex ? { x: snapCoord(point.x), y: snapCoord(point.y) } : wp
      );
      d.waypoints = waypoints;
      setDragPreview({ linkWaypoints: { from: d.link.from, to: d.link.to, waypoints } });
    },
    [clientToMap, setDragPreview, snapCoord]
  );

  /** Arraste começando em cima do cabo (não num waypoint existente): converte o ponto e delega. */
  const beginWaypointDragFromPath = useCallback(
    (e: React.PointerEvent, link: TopologyLink) => {
      const point = clientToMap(e.clientX, e.clientY);
      if (!point) {
        return;
      }
      beginLinkWaypointDrag(e, link, point.x, point.y);
    },
    [beginLinkWaypointDrag, clientToMap]
  );

  const commitLinkWaypoint = useCallback(
    (d: Extract<DragState, { kind: 'link-waypoint' }>) => {
      if (d.moved && d.waypointIndex >= 0) {
        persist(updateLinkProps(storedMap, d.link.from, d.link.to, { waypoints: d.waypoints }));
      }
      setDragPreview(null);
    },
    [persist, setDragPreview, storedMap]
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

  /** Duplo clique no cabo remove o desvio mais próximo, se houver algum ao alcance. */
  const removeWaypointNearPointer = useCallback(
    (e: React.MouseEvent, link: TopologyLink) => {
      const point = clientToMap(e.clientX, e.clientY);
      if (!point) {
        return;
      }
      const index = nearestWaypointIndex(resolveLinkWaypoints(link), point, Math.max(12, 16 / view.scale));
      if (index >= 0) {
        removeLinkWaypoint(link, index);
      }
    },
    [clientToMap, removeLinkWaypoint, resolveLinkWaypoints, view.scale]
  );

  const resetLinkRoute = useCallback(
    (link: TopologyLink) => {
      persist(updateLinkProps(storedMap, link.from, link.to, { waypoints: [] }));
      setDragPreview(null);
    },
    [persist, setDragPreview, storedMap]
  );

  return {
    resolveLinkWaypoints,
    beginLinkWaypointDrag,
    beginWaypointDragFromPath,
    removeWaypointNearPointer,
    moveLinkWaypoint,
    commitLinkWaypoint,
    removeLinkWaypoint,
    resetLinkRoute,
  };
}
