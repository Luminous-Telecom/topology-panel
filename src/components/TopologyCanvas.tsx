import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import {
  HostStatusMap,
  TopologyLink,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
} from '../types';
import {
  addLinkToMap,
  addManualDeviceAt,
  addNetworkAt,
  addStaticAt,
  addSubmapAt,
  areNetworksLocked,
  clientToMapCoords,
  moveStoredNode,
  removeLinkByEndpoints,
  removeNodeFromMap,
  toggleMapLock,
  toggleNetworksLock,
  updateLinkMedium,
  updateStoredNode,
} from '../utils/mapEdits';
import { clamp, computeNetworkLayout, computeNodeLayout, DEFAULT_NETWORK_HEIGHT, DEFAULT_NETWORK_WIDTH, findScrollParents, NodeLayout, resolveLinkMedium, resolveNodeStatus, snapNodeCenterToGrid, snapToGrid } from '../utils';
import { HOST_TOOLS, hostIp, runHostTool } from '../utils/hostTools';
import {
  ContextMenuItem,
  TopologyContextMenu,
  TopologyEditHint,
  TopologyToast,
  TopologyToolbar,
} from './TopologyContextMenu';
import { NodeEditModal } from './NodeEditModal';

interface Props {
  map: TopologyMap;
  storedMap: TopologyMap;
  options: TopologyPanelOptions;
  statusMap: HostStatusMap;
  onMapChange?: (map: TopologyMap) => void;
}

const styles = {
  wrap: css`
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    background: #111217;
    cursor: grab;
    overscroll-behavior: none;
    touch-action: none;
    &:active {
      cursor: grabbing;
    }
  `,
  wrapEditing: css`
    cursor: default;
    &:active {
      cursor: default;
    }
  `,
  svg: css`
    display: block;
    user-select: none;
  `,
  empty: css`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #8e8e8e;
    font-size: 14px;
    padding: 16px;
    text-align: center;
  `,
};

type ContextState = {
  screenX: number;
  screenY: number;
  mapX: number;
  mapY: number;
  node?: TopologyNode;
  link?: TopologyLink;
};

function linkKey(link: TopologyLink): string {
  return `${link.from}-${link.to}`;
}

function nodeCenter(node: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

/** Ponto na borda do nó, voltado para outro centro (seta visível fora do host). */
function nodeEdgeToward(
  node: { x: number; y: number; w: number; h: number },
  toward: { x: number; y: number }
): { x: number; y: number } {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx >= 0 ? node.x + node.w : node.x, y: cy };
  }
  return { x: cx, y: dy >= 0 ? node.y + node.h : node.y };
}

/** Straight vertical/horizontal when endpoints are nearly axis-aligned (not Manhattan routing). */
function snapLinkEndpoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  gridStep: number
): { x: number; y: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const threshold = Math.max(6, gridStep * 0.55);
  if (Math.abs(dx) <= threshold && Math.abs(dy) > threshold) {
    return { x: start.x, y: end.y };
  }
  if (Math.abs(dy) <= threshold && Math.abs(dx) > threshold) {
    return { x: end.x, y: start.y };
  }
  return end;
}

function linkPath(
  from: NodeLayout & { x: number; y: number },
  to: NodeLayout & { x: number; y: number },
  gridStep: number
): string {
  const start = nodeCenter(from);
  const end = snapLinkEndpoint(start, nodeEdgeToward(to, start), gridStep);
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}

function LinkMarkers({ colorLink }: { colorLink: string }) {
  const arrow = (stroke: string, sw = 1.2) => (
    <path
      d="M1,1 L7,4 L1,7"
      fill="none"
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
  const origin = (stroke: string, filled = false, sw = 1) =>
    filled ? (
      <circle cx="3" cy="3" r="1.4" fill={stroke} />
    ) : (
      <circle cx="3" cy="3" r="1.5" fill="none" stroke={stroke} strokeWidth={sw} />
    );

  return (
    <defs>
      <marker id="link-dot-start" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="3.5" markerHeight="3.5" orient="auto">
        {origin(colorLink)}
      </marker>
      <marker id="link-arrow-end" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="4" markerHeight="4" orient="auto">
        {arrow(colorLink)}
      </marker>
      <marker
        id="link-dot-start-active"
        viewBox="0 0 6 6"
        refX="3"
        refY="3"
        markerWidth="4"
        markerHeight="4"
        orient="auto"
      >
        {origin('#4FC3F7', true)}
      </marker>
      <marker
        id="link-arrow-end-active"
        viewBox="0 0 8 8"
        refX="6.5"
        refY="4"
        markerWidth="4.5"
        markerHeight="4.5"
        orient="auto"
      >
        {arrow('#4FC3F7', 1.5)}
      </marker>
      <marker id="link-dot-start-hover" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="3.5" markerHeight="3.5" orient="auto">
        {origin('#81D4FA', true)}
      </marker>
      <marker id="link-arrow-end-hover" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="4" markerHeight="4" orient="auto">
        {arrow('#81D4FA', 1.3)}
      </marker>
    </defs>
  );
}

function nodeFill(
  node: TopologyNode,
  options: TopologyPanelOptions,
  statusMap: HostStatusMap
): string {
  if (node.type === 'submap') {
    return options.colorSubmap;
  }
  if (node.type === 'static') {
    return options.colorUnknown;
  }
  const st = resolveNodeStatus(node, statusMap, options.offlineThreshold);
  if (st === 'online') {
    return options.colorOnline;
  }
  if (st === 'offline') {
    return options.colorOffline;
  }
  return options.colorUnknown;
}

export function TopologyCanvas({ map, storedMap, options, statusMap, onMapChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const canPersist = Boolean(onMapChange);
  const canEditCanvas = canPersist && !map.locked;
  const editable = canEditCanvas;
  const dragRef = useRef<
    | { kind: 'pan'; ox: number; oy: number; nx: number; ny: number }
    | {
        kind: 'node';
        node: TopologyNode;
        ox: number;
        oy: number;
        startX: number;
        startY: number;
        startW: number;
        startH: number;
        moved: boolean;
      }
    | { kind: 'resize'; node: TopologyNode; ox: number; oy: number; startW: number; startH: number; moved: boolean }
    | null
  >(null);
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [editNode, setEditNode] = useState<TopologyNode | null>(null);
  const [linkHoverId, setLinkHoverId] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<TopologyLink | null>(null);
  const [hoveredLinkKey, setHoveredLinkKey] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    nodeId: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const layoutOpts = useMemo(
    () => ({ nodeFontSize: options.nodeFontSize, showSubtitle: options.showSubtitle }),
    [options.nodeFontSize, options.showSubtitle]
  );

  const nodeLayouts = useMemo(() => {
    const layouts = new Map<string, NodeLayout & TopologyNode>();
    for (const node of map.nodes) {
      const preview = dragPreview?.nodeId === node.id ? dragPreview : null;
      const positioned = preview
        ? {
            ...node,
            x: preview.x ?? node.x,
            y: preview.y ?? node.y,
            width: preview.width ?? node.width,
            height: preview.height ?? node.height,
          }
        : node;
      const layout =
        node.type === 'network'
          ? computeNetworkLayout(positioned, layoutOpts)
          : computeNodeLayout(positioned, layoutOpts);
      layouts.set(node.id, { ...positioned, ...layout });
    }
    return layouts;
  }, [map.nodes, layoutOpts, dragPreview]);

  const linkableNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of map.nodes) {
      if (node.type !== 'network') {
        ids.add(node.id);
      }
    }
    return ids;
  }, [map.nodes]);

  const validLinks = useMemo(() => {
    return map.links.filter(
      (l) =>
        linkableNodeIds.has(l.from) &&
        linkableNodeIds.has(l.to) &&
        nodeLayouts.has(l.from) &&
        nodeLayouts.has(l.to)
    );
  }, [map.links, linkableNodeIds, nodeLayouts]);

  const persist = useCallback(
    (next: TopologyMap) => {
      onMapChange?.(next);
    },
    [onMapChange]
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const blockBrowserMenu = (e: Event) => {
      e.preventDefault();
    };
    el.addEventListener('contextmenu', blockBrowserMenu, true);
    return () => el.removeEventListener('contextmenu', blockBrowserMenu, true);
  }, []);

  useEffect(() => {
    if (!canEditCanvas) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLinkFromId(null);
        setContextMenu(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [canEditCanvas]);

  const fitToView = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !map.width || !map.height) {
      return;
    }
    const pad = 24;
    const sx = (el.clientWidth - pad * 2) / map.width;
    const sy = (el.clientHeight - pad * 2) / map.height;
    const scale = clamp(Math.min(sx, sy), 0.15, 2);
    setView({
      scale,
      x: (el.clientWidth - map.width * scale) / 2,
      y: (el.clientHeight - map.height * scale) / 2,
    });
  }, [map.width, map.height]);

  useEffect(() => {
    fitToView();
  }, [fitToView, map.width, map.height]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const onResize = () => {
      setViewport({ w: el.clientWidth, h: el.clientHeight });
      fitToView();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    onResize();
    return () => ro.disconnect();
  }, [fitToView]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !options.enableZoom) {
      return;
    }

    const scrollParents = findScrollParents(el);
    const hoveringRef = { current: false };
    const prevOverflow = new Map<HTMLElement, string>();

    const isOverPanel = (e: { clientX: number; clientY: number }) => {
      const rect = el.getBoundingClientRect();
      return (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );
    };

    const applyZoom = (clientX: number, clientY: number, deltaY: number) => {
      const rect = el.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      const delta = deltaY > 0 ? 0.9 : 1.1;
      setView((v) => {
        const ns = clamp(v.scale * delta, 0.1, 4);
        return {
          scale: ns,
          x: mx - ((mx - v.x) * ns) / v.scale,
          y: my - ((my - v.y) * ns) / v.scale,
        };
      });
    };

    const lockScroll = () => {
      if (hoveringRef.current) {
        return;
      }
      for (const sp of scrollParents) {
        prevOverflow.set(sp, sp.style.overflow);
        sp.style.overflow = 'hidden';
      }
      hoveringRef.current = true;
    };

    const unlockScroll = () => {
      if (!hoveringRef.current) {
        return;
      }
      for (const sp of scrollParents) {
        sp.style.overflow = prevOverflow.get(sp) ?? '';
      }
      prevOverflow.clear();
      hoveringRef.current = false;
    };

    const freezeScrollPosition = () => {
      const tops = scrollParents.map((sp) => ({ sp, top: sp.scrollTop }));
      return () => {
        for (const { sp, top } of tops) {
          sp.scrollTop = top;
        }
      };
    };

    const onWheel = (e: WheelEvent) => {
      if (!isOverPanel(e)) {
        return;
      }

      const restoreScroll = freezeScrollPosition();
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      applyZoom(e.clientX, e.clientY, e.deltaY);
      restoreScroll?.();
      requestAnimationFrame(() => restoreScroll?.());
    };

    const onHoverCheck = (e: PointerEvent) => {
      if (isOverPanel(e)) {
        lockScroll();
      } else {
        unlockScroll();
      }
    };

    const onPointerLeavePanel = () => unlockScroll();

    document.addEventListener('pointermove', onHoverCheck, { passive: true });
    el.addEventListener('pointerleave', onPointerLeavePanel);

    for (const sp of scrollParents) {
      sp.addEventListener('wheel', onWheel, { passive: false, capture: true });
      sp.addEventListener('wheel', onWheel, { passive: false, capture: false });
    }

    return () => {
      document.removeEventListener('pointermove', onHoverCheck);
      el.removeEventListener('pointerleave', onPointerLeavePanel);
      for (const sp of scrollParents) {
        sp.removeEventListener('wheel', onWheel, { capture: true });
        sp.removeEventListener('wheel', onWheel, { capture: false });
      }
      unlockScroll();
    };
  }, [options.enableZoom, map.nodes.length]);

  const openSubmap = useCallback((node: TopologyNode) => {
    if (node.type !== 'submap' || !node.submapUid) {
      return;
    }
    const slug = node.submapSlug || node.submapUid;
    const orgMatch = window.location.search.match(/orgId=\d+/);
    const qs = orgMatch ? `?${orgMatch[0]}` : '';
    window.location.href = `/d/${node.submapUid}/${slug}${qs}`;
  }, []);

  const beginLinkFrom = useCallback((nodeId: string) => {
    setLinkFromId(nodeId);
    setContextMenu(null);
  }, []);

  const completeLink = useCallback(
    (targetId: string) => {
      if (linkFromId === null || linkFromId === '') {
        setLinkFromId(targetId);
        return;
      }
      if (linkFromId === targetId) {
        return;
      }
      persist(addLinkToMap(storedMap, linkFromId, targetId));
      setLinkFromId(null);
    },
    [linkFromId, persist, storedMap]
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent, node: TopologyNode) => {
      if (!editable || node.type !== 'network') {
        return;
      }
      e.stopPropagation();
      const layout = nodeLayouts.get(node.id);
      dragRef.current = {
        kind: 'resize',
        node,
        ox: e.clientX,
        oy: e.clientY,
        startW: layout?.w ?? node.width ?? 220,
        startH: layout?.h ?? node.height ?? 140,
        moved: false,
      };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    [editable, nodeLayouts]
  );

  const beginPan = useCallback(
    (e: React.PointerEvent) => {
      if (!options.enablePan) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { kind: 'pan', ox: e.clientX, oy: e.clientY, nx: view.x, ny: view.y };
      wrapRef.current?.setPointerCapture(e.pointerId);
    },
    [options.enablePan, view.x, view.y]
  );

  const onNodePointerDown = useCallback(
    (e: React.PointerEvent, node: TopologyNode) => {
      e.stopPropagation();
      if (!editable || node.type === 'network') {
        return;
      }
      const layout = nodeLayouts.get(node.id);
      dragRef.current = {
        kind: 'node',
        node,
        ox: e.clientX,
        oy: e.clientY,
        startX: node.x,
        startY: node.y,
        startW: layout?.w ?? node.width ?? 48,
        startH: layout?.h ?? node.height ?? 28,
        moved: false,
      };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    [editable, nodeLayouts]
  );

  /** Redes travadas por padrão — destrave na toolbar para arrastar a caixa. */
  const onNetworkPointerDown = useCallback(
    (e: React.PointerEvent, node: TopologyNode) => {
      if (e.button !== 0) {
        return;
      }
      e.stopPropagation();
      setSelectedLink(null);

      if (editable && !areNetworksLocked(storedMap)) {
        const layout = nodeLayouts.get(node.id);
        dragRef.current = {
          kind: 'node',
          node,
          ox: e.clientX,
          oy: e.clientY,
          startX: node.x,
          startY: node.y,
          startW: layout?.w ?? node.width ?? DEFAULT_NETWORK_WIDTH,
          startH: layout?.h ?? node.height ?? DEFAULT_NETWORK_HEIGHT,
          moved: false,
        };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        return;
      }

      beginPan(e);
    },
    [beginPan, editable, nodeLayouts, storedMap]
  );

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) {
        return;
      }
      setSelectedLink(null);
      beginPan(e);
    },
    [beginPan]
  );

  const onLinkSelect = useCallback((link: TopologyLink) => {
    setSelectedLink((prev) => (prev && linkKey(prev) === linkKey(link) ? null : link));
  }, []);

  const onWrapPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || e.target !== e.currentTarget) {
        return;
      }
      beginPan(e);
    },
    [beginPan]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) {
        return;
      }
      if (d.kind === 'pan') {
        setView((v) => ({
          ...v,
          x: d.nx + (e.clientX - d.ox),
          y: d.ny + (e.clientY - d.oy),
        }));
        return;
      }
      if (d.kind === 'node') {
        const dx = (e.clientX - d.ox) / view.scale;
        const dy = (e.clientY - d.oy) / view.scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          d.moved = true;
        }
        const snapped = snapNodeCenterToGrid(
          d.startX + dx,
          d.startY + dy,
          d.startW,
          d.startH,
          gridStep
        );
        setDragPreview({
          nodeId: d.node.id,
          x: snapped.x,
          y: snapped.y,
        });
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
      }
    },
    [snapCoord, view.scale, gridStep]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent, node?: TopologyNode) => {
      const d = dragRef.current;
      dragRef.current = null;
      wrapRef.current?.releasePointerCapture(e.pointerId);

      if (d?.kind === 'node' && dragPreview) {
        persist(
          moveStoredNode(storedMap, d.node, dragPreview.x ?? d.node.x, dragPreview.y ?? d.node.y)
        );
        setDragPreview(null);
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

      if (node && d?.kind === 'node' && !d.moved && linkFromId !== null) {
        completeLink(node.id);
      }
    },
    [completeLink, dragPreview, linkFromId, persist, storedMap]
  );

  const onNodeClick = useCallback(
    (e: React.MouseEvent, node: TopologyNode) => {
      e.stopPropagation();
      if (editable && linkFromId !== null) {
        completeLink(node.id);
        return;
      }
      if (!editable && node.type === 'submap') {
        openSubmap(node);
      }
    },
    [completeLink, editable, linkFromId, openSubmap]
  );

  const onNodeDoubleClick = useCallback(
    (e: React.MouseEvent, node: TopologyNode) => {
      e.stopPropagation();
      if (editable) {
        if (node.type === 'submap') {
          openSubmap(node);
        } else if (!node.zabbixHost) {
          setEditNode(node);
        }
        return;
      }
      if (node.type === 'submap') {
        openSubmap(node);
      }
    },
    [editable, openSubmap]
  );

  const showToast = useCallback((message: string | undefined) => {
    if (!message) {
      return;
    }
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const buildToolsMenu = useCallback(
    (node: TopologyNode): ContextMenuItem | null => {
      const ip = hostIp(node);
      if (!ip) {
        return null;
      }
      return {
        id: 'tools',
        label: 'Tools',
        variant: 'submenu',
        children: HOST_TOOLS.map((tool) => ({
          id: `tool-${tool.id}`,
          label: tool.label,
          variant: 'tool' as const,
          onClick: () => {
            void runHostTool(tool.id, ip).then(showToast);
          },
        })),
      };
    },
    [showToast]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, target?: { node?: TopologyNode; link?: TopologyLink }) => {
      e.preventDefault();
      e.stopPropagation();

      const node = target?.node;
      const isCanvas = !node && !target?.link;
      const isHost = (node?.type ?? 'host') === 'host';
      const hasTools = Boolean(node && isHost && hostIp(node));

      if (isCanvas) {
        if (!canEditCanvas) {
          if (map.locked) {
            showToast('Destrave o mapa (cadeado) para adicionar dispositivos, redes e submapas');
          } else if (!canPersist) {
            showToast('Entre no modo edição do dashboard (ícone lápis) para editar o mapa');
          }
          return;
        }
      } else if (target?.link) {
        if (!canEditCanvas) {
          return;
        }
      } else if (node && !hasTools && !canEditCanvas) {
        return;
      }

      const el = wrapRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const { x: mapX, y: mapY } = clientToMapCoords(e.clientX, e.clientY, rect, view);
      setContextMenu({
        screenX: e.clientX,
        screenY: e.clientY,
        mapX,
        mapY,
        node: target?.node,
        link: target?.link,
      });
    },
    [canEditCanvas, canPersist, map.locked, showToast, view]
  );

  const canvasMenuItems = useCallback((): ContextMenuItem[] => {
    const { mapX, mapY } = contextMenu ?? { mapX: 0, mapY: 0 };
    return [
      {
        id: 'add-device',
        label: 'Adicionar dispositivo',
        onClick: () => persist(addManualDeviceAt(storedMap, snapCoord(mapX), snapCoord(mapY))),
      },
      {
        id: 'add-submap',
        label: 'Adicionar submapa',
        onClick: () => persist(addSubmapAt(storedMap, snapCoord(mapX), snapCoord(mapY))),
      },
      {
        id: 'add-network',
        label: 'Adicionar rede',
        onClick: () => persist(addNetworkAt(storedMap, snapCoord(mapX), snapCoord(mapY))),
      },
      {
        id: 'add-static',
        label: 'Adicionar estático',
        onClick: () => persist(addStaticAt(storedMap, snapCoord(mapX), snapCoord(mapY))),
      },
      {
        id: 'add-link',
        label: 'Adicionar link',
        onClick: () => setLinkFromId(''),
      },
    ];
  }, [contextMenu, persist, snapCoord, storedMap]);

  const linkMenuItems = useCallback(
    (link: TopologyLink): ContextMenuItem[] => {
      const medium = resolveLinkMedium(link);
      return [
        {
          id: 'link-fiber',
          label: medium === 'fiber' ? '✓ Fibra (linha contínua)' : 'Marcar como fibra',
          onClick: () => persist(updateLinkMedium(storedMap, link.from, link.to, 'fiber')),
        },
        {
          id: 'link-radio',
          label: medium === 'radio' ? '✓ Rádio (linha tracejada)' : 'Marcar como rádio',
          onClick: () => persist(updateLinkMedium(storedMap, link.from, link.to, 'radio')),
        },
        {
          id: 'delete-link',
          label: 'Excluir link',
          variant: 'delete',
          onClick: () => persist(removeLinkByEndpoints(storedMap, link.from, link.to)),
        },
      ];
    },
    [persist, storedMap]
  );

  const nodeMenuItems = useCallback(
    (node: TopologyNode): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [];
      const tools = buildToolsMenu(node);
      if (tools) {
        items.push(tools);
      }

      if (!editable) {
        return items;
      }

      if (!node.zabbixHost) {
        items.push({
          id: 'props',
          label: 'Propriedades',
          onClick: () => setEditNode(node),
        });
      }
      if (node.type !== 'network') {
        items.push({
          id: 'link-from',
          label: 'Adicionar link daqui',
          onClick: () => beginLinkFrom(node.id),
        });
      }

      const deleteLabel =
        node.type === 'submap'
          ? 'Excluir submapa'
          : node.type === 'static'
            ? 'Excluir estático'
            : node.type === 'network'
              ? 'Excluir rede'
              : 'Excluir host';

      items.push({
        id: 'delete',
        label: deleteLabel,
        variant: 'delete',
        onClick: () => persist(removeNodeFromMap(storedMap, node.id)),
      });
      return items;
    },
    [beginLinkFrom, buildToolsMenu, editable, persist, storedMap]
  );

  const gridStep = options.gridSize ?? 10;
  const snapCoord = useCallback(
    (n: number) => (options.snapToGrid !== false ? snapToGrid(n, gridStep) : Math.round(n)),
    [gridStep, options.snapToGrid]
  );
  const showEmptyHint = map.nodes.length === 0;
  const majorGridEvery = gridStep <= 12 ? 5 : 4;

  /** Grid extent in map coords — grows with panel size, pan and zoom. */
  const gridBounds = useMemo(() => {
    const pad = gridStep * 2;
    let x0 = 0;
    let y0 = 0;
    let x1 = map.width;
    let y1 = map.height;

    if (viewport.w > 0 && viewport.h > 0 && view.scale > 0) {
      x0 = Math.min(x0, -view.x / view.scale);
      y0 = Math.min(y0, -view.y / view.scale);
      x1 = Math.max(x1, (viewport.w - view.x) / view.scale);
      y1 = Math.max(y1, (viewport.h - view.y) / view.scale);
    }

    return {
      x0: Math.floor((x0 - pad) / gridStep) * gridStep,
      y0: Math.floor((y0 - pad) / gridStep) * gridStep,
      x1: Math.ceil((x1 + pad) / gridStep) * gridStep,
      y1: Math.ceil((y1 + pad) / gridStep) * gridStep,
    };
  }, [gridStep, map.width, map.height, view.scale, view.x, view.y, viewport.h, viewport.w]);

  const gridVerticalLines = useMemo(() => {
    const start = Math.floor(gridBounds.x0 / gridStep);
    const end = Math.ceil(gridBounds.x1 / gridStep);
    return Array.from({ length: end - start + 1 }, (_, i) => (start + i) * gridStep);
  }, [gridBounds.x0, gridBounds.x1, gridStep]);

  const gridHorizontalLines = useMemo(() => {
    const start = Math.floor(gridBounds.y0 / gridStep);
    const end = Math.ceil(gridBounds.y1 / gridStep);
    return Array.from({ length: end - start + 1 }, (_, i) => (start + i) * gridStep);
  }, [gridBounds.y0, gridBounds.y1, gridStep]);

  const isMajorGridLine = useCallback(
    (coord: number) => {
      const idx = Math.round(coord / gridStep);
      return ((idx % majorGridEvery) + majorGridEvery) % majorGridEvery === 0;
    },
    [gridStep, majorGridEvery]
  );

  const selectedLinkLabels = useMemo(() => {
    if (!selectedLink) {
      return null;
    }
    const from = nodeLayouts.get(selectedLink.from);
    const to = nodeLayouts.get(selectedLink.to);
    if (!from || !to) {
      return null;
    }
    return { from: from.label, to: to.label, medium: resolveLinkMedium(selectedLink) };
  }, [nodeLayouts, selectedLink]);

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${editable ? styles.wrapEditing : ''}`}
      onPointerDown={onWrapPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onPointerUp(e)}
      onPointerLeave={(e) => onPointerUp(e)}
      onContextMenu={(e) => handleContextMenu(e)}
    >
      {canPersist && (
        <TopologyToolbar
          locked={Boolean(map.locked)}
          networksLocked={areNetworksLocked(storedMap)}
          editable={canEditCanvas}
          onToggleLock={() => persist(toggleMapLock(storedMap))}
          onToggleNetworksLock={() => persist(toggleNetworksLock(storedMap))}
        />
      )}

      {selectedLinkLabels && (
        <TopologyEditHint>
          Link ({selectedLinkLabels.medium === 'radio' ? 'Rádio' : 'Fibra'}):{' '}
          <strong>{selectedLinkLabels.from}</strong> → <strong>{selectedLinkLabels.to}</strong> (clique no fundo
          para desmarcar)
        </TopologyEditHint>
      )}

      {linkFromId !== null && editable && (
        <TopologyEditHint>
          {linkFromId === '' ? 'Clique no primeiro host do link' : 'Clique no host de destino (Esc cancela)'}
        </TopologyEditHint>
      )}

      {editable && showEmptyHint && (
        <div className={styles.empty} style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
          Clique com o <strong>botão direito</strong> para adicionar dispositivos, redes, submapas e links. Hosts
          Zabbix vêm da aba <strong>Query</strong>.
        </div>
      )}

      <svg className={styles.svg} width="100%" height="100%" onContextMenu={(e) => handleContextMenu(e)}>
        <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
          <LinkMarkers colorLink={options.colorLink} />
          <rect
            x={gridBounds.x0}
            y={gridBounds.y0}
            width={gridBounds.x1 - gridBounds.x0}
            height={gridBounds.y1 - gridBounds.y0}
            fill="transparent"
            style={{ cursor: options.enablePan ? 'grab' : 'default' }}
            onPointerDown={onCanvasPointerDown}
            onContextMenu={(e) => handleContextMenu(e)}
          />

          {options.showGrid && (
            <>
              {gridVerticalLines.map((x) => (
                <line
                  key={`gv-${x}`}
                  x1={x}
                  y1={gridBounds.y0}
                  x2={x}
                  y2={gridBounds.y1}
                  stroke="#2a2a2e"
                  strokeWidth={isMajorGridLine(x) ? 1.2 : 0.5}
                  strokeOpacity={isMajorGridLine(x) ? 0.5 : 0.22}
                  pointerEvents="none"
                />
              ))}
              {gridHorizontalLines.map((y) => (
                <line
                  key={`gh-${y}`}
                  x1={gridBounds.x0}
                  y1={y}
                  x2={gridBounds.x1}
                  y2={y}
                  stroke="#2a2a2e"
                  strokeWidth={isMajorGridLine(y) ? 1.2 : 0.5}
                  strokeOpacity={isMajorGridLine(y) ? 0.5 : 0.22}
                  pointerEvents="none"
                />
              ))}
            </>
          )}

          <rect
            x={0}
            y={0}
            width={map.width}
            height={map.height}
            fill="none"
            pointerEvents="none"
          />

          {map.nodes
            .filter((n) => n.type === 'network')
            .map((node) => {
              const layout = nodeLayouts.get(node.id);
              if (!layout) {
                return null;
              }
              const { w, h, label, labelY, x, y } = layout;
              const fill = node.fillColor ?? options.colorNetworkFill;
              const stroke = node.borderColor ?? options.colorNetworkBorder;

              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  onPointerDown={(e) => onNetworkPointerDown(e, node)}
                  onPointerUp={(e) => onPointerUp(e, node)}
                  onDoubleClick={(e) => onNodeDoubleClick(e, node)}
                  onContextMenu={(e) => handleContextMenu(e, { node })}
                  style={{
                    cursor:
                      editable && !areNetworksLocked(storedMap)
                        ? 'move'
                        : options.enablePan
                          ? 'grab'
                          : 'default',
                  }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={2}
                    ry={2}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={1.5}
                  />
                  <text
                    x={x + 8}
                    y={y + labelY}
                    textAnchor="start"
                    dominantBaseline="middle"
                    fill={options.colorNetworkLabel}
                    fontSize={options.nodeFontSize}
                    fontFamily="Inter, Helvetica, Arial, sans-serif"
                    pointerEvents="none"
                  >
                    {label}
                  </text>
                  {editable && (
                    <rect
                      x={x + w - 10}
                      y={y + h - 10}
                      width={10}
                      height={10}
                      fill="rgba(255,255,255,0.45)"
                      stroke="rgba(255,255,255,0.6)"
                      strokeWidth={1}
                      style={{ cursor: 'nwse-resize' }}
                      onPointerDown={(e) => onResizePointerDown(e, node)}
                      onPointerUp={(e) => onPointerUp(e)}
                    />
                  )}
                </g>
              );
            })}

          {validLinks
            .slice()
            .sort((a, b) => {
              const aKey = linkKey(a);
              const bKey = linkKey(b);
              const aActive = selectedLink && linkKey(selectedLink) === aKey ? 1 : 0;
              const bActive = selectedLink && linkKey(selectedLink) === bKey ? 1 : 0;
              return aActive - bActive;
            })
            .map((link, i) => (
            <LinkLine
              key={`${link.from}-${link.to}-${i}`}
              link={link}
              nodeLayouts={nodeLayouts}
              options={options}
              editable={editable}
              selected={Boolean(selectedLink && linkKey(selectedLink) === linkKey(link))}
              hovered={hoveredLinkKey === linkKey(link)}
              onSelect={() => onLinkSelect(link)}
              onHoverChange={(active) => setHoveredLinkKey(active ? linkKey(link) : null)}
              onContextMenu={(e) => handleContextMenu(e, { link })}
            />
          ))}

          {map.nodes
            .filter((n) => n.type !== 'network')
            .map((node) => {
            const layout = nodeLayouts.get(node.id);
            if (!layout) {
              return null;
            }
            const { w, h, label, sub, subFontSize, labelY, subY, x, y } = layout;
            const fill = nodeFill(node, options, statusMap);
            const isLinkSource = linkFromId === node.id;
            const isLinkTarget = linkFromId !== null && linkHoverId === node.id;
            const isSelectedLinkEndpoint =
              selectedLink !== null && (node.id === selectedLink.from || node.id === selectedLink.to);

            return (
              <g
                key={node.id}
                data-node-id={node.id}
                onPointerDown={(e) => onNodePointerDown(e, node)}
                onPointerUp={(e) => onPointerUp(e, node)}
                onClick={(e) => onNodeClick(e, node)}
                onDoubleClick={(e) => onNodeDoubleClick(e, node)}
                onContextMenu={(e) => handleContextMenu(e, { node })}
                onMouseEnter={() => setLinkHoverId(node.id)}
                onMouseLeave={() => setLinkHoverId(null)}
                style={{
                  cursor: editable
                    ? linkFromId !== null
                      ? 'crosshair'
                      : 'move'
                    : (node.type ?? 'host') === 'host' && hostIp(node)
                      ? 'context-menu'
                      : node.type === 'submap'
                        ? 'pointer'
                        : 'default',
                }}
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={4}
                  ry={4}
                  fill={fill}
                  stroke={
                    isSelectedLinkEndpoint
                      ? '#4FC3F7'
                      : isLinkSource || isLinkTarget
                        ? '#fff'
                        : 'rgba(255,255,255,0.35)'
                  }
                  strokeWidth={isSelectedLinkEndpoint ? 3 : isLinkSource || isLinkTarget ? 2 : 1}
                />
                <text
                  x={x + w / 2}
                  y={y + labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fff"
                  fontSize={options.nodeFontSize}
                  fontFamily="Inter, Helvetica, Arial, sans-serif"
                  pointerEvents="none"
                >
                  {label}
                </text>
                {sub && subY !== undefined && (
                  <text
                    x={x + w / 2}
                    y={y + subY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="rgba(255,255,255,0.85)"
                    fontSize={subFontSize}
                    fontFamily="Inter, Helvetica, Arial, sans-serif"
                    pointerEvents="none"
                  >
                    {sub}
                  </text>
                )}
                {node.type === 'submap' && (
                  <text
                    x={x + w - 8}
                    y={y + 12}
                    textAnchor="end"
                    fill="rgba(255,255,255,0.7)"
                    fontSize={10}
                    pointerEvents="none"
                  >
                    ↗
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {contextMenu && (
        <TopologyContextMenu
          x={contextMenu.screenX}
          y={contextMenu.screenY}
          items={
            contextMenu.link
              ? linkMenuItems(contextMenu.link)
              : contextMenu.node
                ? nodeMenuItems(contextMenu.node)
                : canvasMenuItems()
          }
          onClose={() => setContextMenu(null)}
        />
      )}

      {editNode && (
        <NodeEditModal
          node={editNode}
          onClose={() => setEditNode(null)}
          onSave={(patch) => persist(updateStoredNode(storedMap, editNode, patch))}
        />
      )}

      <TopologyToast message={toast} />
    </div>
  );
}

function LinkLine({
  link,
  nodeLayouts,
  options,
  editable,
  selected,
  hovered,
  onSelect,
  onHoverChange,
  onContextMenu,
}: {
  link: TopologyLink;
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  options: TopologyPanelOptions;
  editable: boolean;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHoverChange: (active: boolean) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const from = nodeLayouts.get(link.from);
  const to = nodeLayouts.get(link.to);
  if (!from || !to) {
    return null;
  }
  const d = linkPath(from, to, options.gridSize ?? 10);
  const hitWidth = Math.max(14, options.colorLinkWidth + 12);
  const active = selected || hovered;
  const medium = resolveLinkMedium(link);
  const dashArray = medium === 'radio' ? '10 6' : undefined;
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const strokeWidth = selected ? 4 : hovered ? 3 : options.colorLinkWidth;
  const strokeColor = selected ? '#4FC3F7' : hovered ? '#81D4FA' : options.colorLink;
  const markerStart = selected
    ? 'url(#link-dot-start-active)'
    : hovered
      ? 'url(#link-dot-start-hover)'
      : 'url(#link-dot-start)';
  const markerEnd = selected
    ? 'url(#link-arrow-end-active)'
    : hovered
      ? 'url(#link-arrow-end-hover)'
      : 'url(#link-arrow-end)';

  return (
    <g
      onContextMenu={editable ? onContextMenu : undefined}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <path
        d={d}
        stroke="transparent"
        strokeWidth={hitWidth}
        fill="none"
        pointerEvents="stroke"
        style={{ cursor: 'pointer' }}
      />
      {active && (
        <path
          d={d}
          stroke="#4FC3F7"
          strokeWidth={strokeWidth + 8}
          strokeOpacity={selected ? 0.35 : 0.2}
          strokeDasharray={dashArray}
          fill="none"
          pointerEvents="none"
        />
      )}
      <path
        d={d}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        markerStart={markerStart}
        markerEnd={markerEnd}
        fill="none"
        pointerEvents="none"
      />
      {selected && (
        <>
          <circle cx={fromCx} cy={fromCy} r={4} fill="#4FC3F7" fillOpacity={0.85} pointerEvents="none" />
          <circle cx={toCx} cy={toCy} r={4} fill="#4FC3F7" fillOpacity={0.85} pointerEvents="none" />
        </>
      )}
    </g>
  );
}
