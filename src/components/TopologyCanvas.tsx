import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { useTheme2 } from '@grafana/ui';
import {
  HostMetadataMap,
  HostProblemMap,
  HostStatusMap,
  TopologyLink,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
  TopologyView,
} from '../types';
import {
  addLinkToMap,
  addManualDeviceAt,
  addNetworkAt,
  addStaticAt,
  addSubmapAt,
  addZabbixHostAt,
  areNetworksLocked,
  rebindZabbixHost,
  clientToMapCoords,
  moveStoredNodesBulk,
  removeLinkByEndpoints,
  removeNodeFromMap,
  toggleMapLock,
  toggleNetworksLock,
  updateLinkMedium,
  updateLinkProps,
  updateStoredNode,
  updateHostsIconBulk,
  updateHostsCredentialsBulk,
} from '../utils/mapEdits';
import { clamp, computeNetworkLayout, computeNodeLayout, computeStaticLayout, DEFAULT_NETWORK_HEIGHT, DEFAULT_NETWORK_WIDTH, DEFAULT_STATIC_HEIGHT, DEFAULT_STATIC_WIDTH, effectiveStatusMetric, findScrollParents, NodeLayout, offlineThresholdForMetric, resolveLinkMedium, resolveNodeStatus, snapNodeCenterToGrid, snapToGrid } from '../utils';
import { HOST_TOOLS, hostIp, resolveToolAuth, runHostTool } from '../utils/hostTools';
import { HostIconGlyph, hostIconRenderSize, resolveHostIcon } from '../utils/hostIcons';
import { isDarkBackground, subtextOnBackground, textOnBackground } from '../utils/colorContrast';
import { resolvePanelColor } from '../utils/panelColors';
import { AlignGuideLine, computeAlignGuides } from '../utils/alignGuides';
import { buildRegionStatsMap, formatRegionStats, regionFillColor } from '../utils/networkStats';
import {
  ContextMenuItem,
  TopologyContextMenu,
  TopologyEditHint,
  TopologyToast,
  TopologyToolbar,
} from './TopologyContextMenu';
import { NodeEditModal } from './NodeEditModal';
import { BulkHostIconModal } from './BulkHostIconModal';
import { BulkHostCredentialsModal } from './BulkHostCredentialsModal';
import { ZabbixHostPickerModal } from './AddZabbixHostModal';
import { PingModal } from './PingModal';
import { LinkEditModal } from './LinkEditModal';
import { formatLinkBandwidth, linkStrokeWidth } from '../utils/linkBandwidth';
import {
  buildLinkPathD,
  closestPointOnPolyline,
  computeLinkGeometry,
  linkLabelAnchor,
  LinkPoint,
  nearestWaypointIndex,
} from '../utils/linkGeometry';
import { LINK_FLOW_DASH, LinkFlowController, startLinkFlowAnimation } from '../utils/linkFlow';

interface Props {
  map: TopologyMap;
  storedMap: TopologyMap;
  options: TopologyPanelOptions;
  statusMap: HostStatusMap;
  /** ICMP puro — estatísticas de rede/submapa (sem problemas Zabbix). */
  regionStatusMap?: HostStatusMap;
  /** ICMP carregado ao menos uma vez — evita vermelho/OK falso antes da API Zabbix. */
  icmpReady?: boolean;
  hostMetadata?: HostMetadataMap;
  problemMap?: HostProblemMap;
  submapHosts?: Record<string, string[] | null | undefined>;
  onMapChange?: (map: TopologyMap) => void;
  onViewChange?: (view: TopologyView) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
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
    &:fullscreen {
      width: 100vw;
      height: 100vh;
      background: #111217;
    }
    &:-webkit-full-screen {
      width: 100vw;
      height: 100vh;
      background: #111217;
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
  offlineBlink: css`
    animation: dude-offline-blink 1s ease-in-out infinite;
    @keyframes dude-offline-blink {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.28;
      }
    }
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

function isHostNode(node: TopologyNode): boolean {
  return (node.type ?? 'host') === 'host';
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

function linkWaypointsMatch(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
  return (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);
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
  statusMap: HostStatusMap,
  hostMetadata?: HostMetadataMap
): string {
  if (node.type === 'submap') {
    return options.colorSubmap;
  }
  if (node.type === 'static') {
    return node.fillColor || options.colorStatic || options.colorUnknown;
  }
  const st = resolveNodeStatus(
    node,
    statusMap,
    offlineThresholdForMetric(effectiveStatusMetric(options)),
    effectiveStatusMetric(options),
    hostMetadata
  );
  if (st === 'online') {
    return options.colorOnline;
  }
  if (st === 'offline') {
    return options.colorOffline;
  }
  return options.colorUnknown;
}

export function TopologyCanvas({
  map,
  storedMap,
  options,
  statusMap,
  regionStatusMap,
  icmpReady = false,
  hostMetadata,
  problemMap = {},
  submapHosts = {},
  onMapChange,
  onViewChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: Props) {
  const theme = useTheme2();
  const resolveColor = useCallback((color?: unknown) => resolvePanelColor(theme, color), [theme]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const linkFlowRef = useRef<LinkFlowController | null>(null);
  const savedView = options.view;
  const [view, setView] = useState<TopologyView>(() =>
    savedView && typeof savedView.scale === 'number'
      ? savedView
      : { x: 0, y: 0, scale: 1 }
  );
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [flowPaused, setFlowPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
        group?: Array<{ id: string; startX: number; startY: number; startW: number; startH: number }>;
      }
    | { kind: 'resize'; node: TopologyNode; ox: number; oy: number; startW: number; startH: number; moved: boolean }
    | { kind: 'marquee'; mapX0: number; mapY0: number }
    | {
        kind: 'link-waypoint';
        link: TopologyLink;
        waypointIndex: number;
        waypoints: LinkPoint[];
        moved: boolean;
        inserted: boolean;
      }
    | null
  >(null);
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [marqueeRect, setMarqueeRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [bulkIconEditOpen, setBulkIconEditOpen] = useState(false);
  const [bulkIconTargets, setBulkIconTargets] = useState<TopologyNode[]>([]);
  const [bulkCredsEditOpen, setBulkCredsEditOpen] = useState(false);
  const [bulkCredsTargets, setBulkCredsTargets] = useState<TopologyNode[]>([]);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [editNode, setEditNode] = useState<TopologyNode | null>(null);
  const [addHostAt, setAddHostAt] = useState<{ mapX: number; mapY: number } | null>(null);
  const [editZabbixHost, setEditZabbixHost] = useState<TopologyNode | null>(null);
  const [linkHoverId, setLinkHoverId] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<TopologyLink | null>(null);
  const [editLink, setEditLink] = useState<TopologyLink | null>(null);
  const [hoveredLinkKey, setHoveredLinkKey] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    nodeId?: string;
    positions?: Record<string, { x: number; y: number }>;
    width?: number;
    height?: number;
    linkWaypoints?: { from: string; to: string; waypoints: LinkPoint[] };
  } | null>(null);
  const [alignGuides, setAlignGuides] = useState<AlignGuideLine[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [pingTarget, setPingTarget] = useState<{
    label: string;
    ip: string;
    zabbixHost?: string;
  } | null>(null);

  const layoutOpts = useMemo(
    () => ({ nodeFontSize: options.nodeFontSize, showSubtitle: options.showSubtitle }),
    [options.nodeFontSize, options.showSubtitle]
  );

  const gridStep = options.gridSize ?? 10;
  const snapCoord = useCallback(
    (n: number) => (options.snapToGrid !== false ? snapToGrid(n, gridStep) : Math.round(n)),
    [gridStep, options.snapToGrid]
  );

  const nodeLayouts = useMemo(() => {
    const layouts = new Map<string, NodeLayout & TopologyNode>();
    for (const node of map.nodes) {
      const movePreview = dragPreview?.positions?.[node.id];
      const resizePreview =
        dragPreview?.nodeId === node.id && dragPreview.width !== undefined ? dragPreview : null;
      const positioned = movePreview
        ? { ...node, x: movePreview.x, y: movePreview.y }
        : resizePreview
          ? {
              ...node,
              width: resizePreview.width ?? node.width,
              height: resizePreview.height ?? node.height,
            }
          : node;
      const layout =
        node.type === 'network'
          ? computeNetworkLayout(positioned, layoutOpts)
          : node.type === 'static'
            ? computeStaticLayout(positioned, layoutOpts)
            : computeNodeLayout(positioned, layoutOpts);
      layouts.set(node.id, { ...positioned, ...layout });
    }

    const stats = buildRegionStatsMap(
      map.nodes,
      layouts,
      regionStatusMap ?? statusMap,
      options,
      submapHosts,
      hostMetadata,
      problemMap
    );
    for (const node of map.nodes) {
      if (node.type !== 'submap') {
        continue;
      }
      const region = stats.get(node.id);
      if (!region) {
        continue;
      }
      const positioned = layouts.get(node.id);
      if (!positioned) {
        continue;
      }
      const withStats = { ...positioned, subtitle: formatRegionStats(region, icmpReady, 'submap') };
      const layout = computeNodeLayout(withStats, layoutOpts);
      layouts.set(node.id, { ...positioned, ...layout, subtitle: withStats.subtitle });
    }

    return layouts;
  }, [map.nodes, layoutOpts, dragPreview, regionStatusMap, statusMap, options, submapHosts, hostMetadata, icmpReady, problemMap]);

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

  const regionStats = useMemo(
    () =>
      buildRegionStatsMap(
        map.nodes,
        nodeLayouts,
        regionStatusMap ?? statusMap,
        options,
        submapHosts,
        hostMetadata,
        problemMap
      ),
    [map.nodes, nodeLayouts, regionStatusMap, statusMap, options, submapHosts, hostMetadata, problemMap]
  );

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
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const controller = startLinkFlowAnimation(el);
    linkFlowRef.current = controller;
    return () => {
      controller.stop();
      if (linkFlowRef.current === controller) {
        linkFlowRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    linkFlowRef.current?.setPaused(flowPaused);
  }, [flowPaused]);

  useEffect(() => {
    const syncFullscreen = () => {
      const el = wrapRef.current;
      setIsFullscreen(Boolean(el && document.fullscreenElement === el));
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    syncFullscreen();
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        await el.requestFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      setToast('Não foi possível alternar a tela cheia neste navegador');
      window.setTimeout(() => setToast(null), 3500);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);

      if (canPersist && !inField && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo?.();
        return;
      }
      if (
        canPersist &&
        !inField &&
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        onRedo?.();
        return;
      }

      if (!canEditCanvas) {
        return;
      }

      if (e.key === 'Escape') {
        setLinkFromId(null);
        setContextMenu(null);
        setSelectedNodeIds([]);
        setMarqueeRect(null);
        setAlignGuides([]);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [canEditCanvas, canPersist, onRedo, onUndo]);

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

  const didInitialFitRef = useRef(false);
  useEffect(() => {
    if (didInitialFitRef.current || !map.width || !map.height) {
      return;
    }
    if (savedView && typeof savedView.scale === 'number') {
      setView(savedView);
    } else {
      fitToView();
    }
    didInitialFitRef.current = true;
  }, [fitToView, map.width, map.height, savedView]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const onResize = () => {
      setViewport({ w: el.clientWidth, h: el.clientHeight });
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    onResize();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!onViewChange || !didInitialFitRef.current) {
      return;
    }
    const current = options.view;
    if (
      current &&
      current.x === view.x &&
      current.y === view.y &&
      current.scale === view.scale
    ) {
      return;
    }
    const timer = window.setTimeout(() => onViewChange(view), 400);
    return () => window.clearTimeout(timer);
  }, [onViewChange, options.view, view]);

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
      if (!editable || (node.type !== 'network' && node.type !== 'static' && node.type !== 'submap')) {
        return;
      }
      e.stopPropagation();
      const layout = nodeLayouts.get(node.id);
      const defaultW =
        node.type === 'static' ? DEFAULT_STATIC_WIDTH : node.type === 'submap' ? 120 : DEFAULT_NETWORK_WIDTH;
      const defaultH =
        node.type === 'static' ? DEFAULT_STATIC_HEIGHT : node.type === 'submap' ? 36 : DEFAULT_NETWORK_HEIGHT;
      dragRef.current = {
        kind: 'resize',
        node,
        ox: e.clientX,
        oy: e.clientY,
        startW: layout?.w ?? node.width ?? defaultW,
        startH: layout?.h ?? node.height ?? defaultH,
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
      let group: Array<{ id: string; startX: number; startY: number; startW: number; startH: number }> | undefined;
      if (isHostNode(node) && selectedNodeIds.length >= 2 && selectedNodeIds.includes(node.id)) {
        group = selectedNodeIds
          .map((id) => map.nodes.find((n) => n.id === id))
          .filter((n): n is TopologyNode => Boolean(n && isHostNode(n)))
          .map((n) => {
            const memberLayout = nodeLayouts.get(n.id);
            return {
              id: n.id,
              startX: n.x,
              startY: n.y,
              startW: memberLayout?.w ?? n.width ?? 48,
              startH: memberLayout?.h ?? n.height ?? 28,
            };
          });
      }
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
        group,
      };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    [editable, map.nodes, nodeLayouts, selectedNodeIds]
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
      if (e.shiftKey && editable) {
        e.stopPropagation();
        const el = wrapRef.current;
        if (!el) {
          return;
        }
        const rect = el.getBoundingClientRect();
        const { x, y } = clientToMapCoords(e.clientX, e.clientY, rect, view);
        dragRef.current = { kind: 'marquee', mapX0: x, mapY0: y };
        setMarqueeRect({ x0: x, y0: y, x1: x, y1: y });
        wrapRef.current?.setPointerCapture(e.pointerId);
        return;
      }
      setSelectedNodeIds([]);
      setSelectedLink(null);
      setContextMenu(null);
      beginPan(e);
    },
    [beginPan, editable, view]
  );

  const onLinkSelect = useCallback((link: TopologyLink) => {
    setSelectedNodeIds([]);
    setSelectedLink((prev) => (prev && linkKey(prev) === linkKey(link) ? null : link));
  }, []);

  const resolveLinkWaypoints = useCallback(
    (link: TopologyLink): LinkPoint[] => {
      const preview = dragPreview?.linkWaypoints;
      if (preview && linkWaypointsMatch(preview, link)) {
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
      const hitRadius = Math.max(10, 14 / view.scale);
      let index = waypointIndex;
      let inserted = false;
      let waypoints = currentWaypoints;

      if (index === undefined) {
        index = currentWaypoints.findIndex((wp) => Math.hypot(wp.x - mapX, wp.y - mapY) <= hitRadius);
      }

      if (index < 0) {
        const hit = closestPointOnPolyline(geom.pathPoints, point);
        if (hit.distance > hitRadius * 1.5) {
          return;
        }
        index = hit.insertIndex;
        waypoints = [...currentWaypoints];
        waypoints.splice(index, 0, { x: snapCoord(hit.x), y: snapCoord(hit.y) });
        inserted = true;
      }

      setSelectedNodeIds([]);
      setSelectedLink(link);
      dragRef.current = {
        kind: 'link-waypoint',
        link,
        waypointIndex: index,
        waypoints,
        moved: false,
        inserted,
      };
      setDragPreview({ linkWaypoints: { from: link.from, to: link.to, waypoints } });
      wrapRef.current?.setPointerCapture(e.pointerId);
    },
    [editable, gridStep, nodeLayouts, resolveLinkWaypoints, snapCoord, view.scale]
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
    [persist, resolveLinkWaypoints, storedMap]
  );

  const resetLinkRoute = useCallback(
    (link: TopologyLink) => {
      persist(updateLinkProps(storedMap, link.from, link.to, { waypoints: [] }));
      setDragPreview(null);
    },
    [persist, storedMap]
  );

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
        const members = d.group && d.group.length > 1 ? d.group : [d.node].map((n) => ({
          id: n.id,
          startX: d.startX,
          startY: d.startY,
          startW: d.startW,
          startH: d.startH,
        }));
        const primary = members.find((m) => m.id === d.node.id) ?? members[0];
        const primarySnapped = snapNodeCenterToGrid(
          primary.startX + dx,
          primary.startY + dy,
          primary.startW,
          primary.startH,
          gridStep
        );
        const sdx = primarySnapped.x - primary.startX;
        const sdy = primarySnapped.y - primary.startY;
        const positions: Record<string, { x: number; y: number }> = {};
        for (const member of members) {
          const snapped = snapNodeCenterToGrid(
            member.startX + sdx,
            member.startY + sdy,
            member.startW,
            member.startH,
            gridStep
          );
          positions[member.id] = { x: snapped.x, y: snapped.y };
        }
        setDragPreview({ positions });

        const primaryPos = positions[primary.id];
        if (primaryPos) {
          const draggedIds = new Set(Object.keys(positions));
          const guideThreshold = Math.max(6, gridStep * 0.5);
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
        }
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
        const rect = el.getBoundingClientRect();
        const { x, y } = clientToMapCoords(e.clientX, e.clientY, rect, view);
        d.moved = true;
        const waypoints = d.waypoints.map((wp, i) =>
          i === d.waypointIndex ? { x: snapCoord(x), y: snapCoord(y) } : wp
        );
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
    [map.height, map.nodes, map.width, nodeLayouts, snapCoord, view, viewport.h, viewport.w, gridStep]
  );

  const clearDragUi = useCallback(() => {
    setAlignGuides([]);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent, node?: TopologyNode) => {
      const d = dragRef.current;
      dragRef.current = null;
      wrapRef.current?.releasePointerCapture(e.pointerId);

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
              if (!isHostNode(n)) {
                continue;
              }
              const layout = nodeLayouts.get(n.id);
              if (!layout) {
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
            setSelectedNodeIds(ids);
          }
        }
        return;
      }

      if (d?.kind === 'link-waypoint') {
        if (d.moved || d.inserted) {
          persist(updateLinkProps(storedMap, d.link.from, d.link.to, { waypoints: d.waypoints }));
        }
        setDragPreview(null);
        return;
      }

      if (d?.kind === 'node' && dragPreview?.positions && d.moved) {
        const moves = Object.entries(dragPreview.positions).map(([nodeId, pos]) => ({
          nodeId,
          x: pos.x,
          y: pos.y,
        }));
        persist(moveStoredNodesBulk(storedMap, moves));
        setDragPreview(null);
        clearDragUi();
      } else if (d?.kind === 'node') {
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

      if (node && d?.kind === 'node' && !d.moved && linkFromId !== null) {
        completeLink(node.id);
        return;
      }

      if (node && d?.kind === 'node' && !d.moved && linkFromId === null && isHostNode(node)) {
        if (e.ctrlKey || e.metaKey) {
          setSelectedNodeIds((prev) => {
            const next = new Set(prev);
            if (next.has(node.id)) {
              next.delete(node.id);
            } else {
              next.add(node.id);
            }
            return [...next];
          });
        } else {
          setSelectedNodeIds([node.id]);
        }
        setSelectedLink(null);
      }
    },
    [clearDragUi, completeLink, dragPreview, linkFromId, map.nodes, nodeLayouts, persist, storedMap, view]
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

  const openHostEditor = useCallback((node: TopologyNode) => {
    // Propriedades (inclui usuário/senha das Tools) — hosts Zabbix e manuais
    setEditNode(node);
  }, []);

  const openZabbixRebind = useCallback((node: TopologyNode) => {
    if (node.zabbixHost?.trim()) {
      setEditZabbixHost(node);
    }
  }, []);

  const onNodeDoubleClick = useCallback(
    (e: React.MouseEvent, node: TopologyNode) => {
      e.stopPropagation();
      if (editable) {
        if (node.type === 'submap' || node.type === 'network' || node.type === 'static') {
          setEditNode(node);
        } else if ((node.type ?? 'host') === 'host') {
          openHostEditor(node);
        }
        return;
      }
      if (node.type === 'submap') {
        openSubmap(node);
      }
    },
    [editable, openHostEditor, openSubmap]
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
            if (tool.id === 'ping') {
              setPingTarget({
                label: node.label ?? node.zabbixHost ?? ip,
                ip,
                zabbixHost: node.zabbixHost,
              });
              return;
            }
            void runHostTool(tool.id, ip, resolveToolAuth(node, options)).then(showToast);
          },
        })),
      };
    },
    [options, showToast]
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

      if (node && isHost && !selectedNodeIds.includes(node.id)) {
        if (selectedNodeIds.length === 0 || !(e.shiftKey || e.ctrlKey || e.metaKey)) {
          setSelectedNodeIds([node.id]);
        } else {
          setSelectedNodeIds((prev) => (prev.includes(node.id) ? prev : [...prev, node.id]));
        }
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
    [canEditCanvas, canPersist, map.locked, selectedNodeIds, showToast, view]
  );

  const openBulkIconEdit = useCallback(() => {
    const selected = selectedNodeIds
      .map((id) => map.nodes.find((n) => n.id === id))
      .filter((n): n is TopologyNode => Boolean(n && isHostNode(n)));
    if (!selected.length) {
      showToast('Nenhum host válido na seleção');
      return;
    }
    setBulkIconTargets(selected);
    setContextMenu(null);
    setBulkIconEditOpen(true);
  }, [map.nodes, selectedNodeIds, showToast]);

  const openBulkCredsEdit = useCallback(() => {
    const selected = selectedNodeIds
      .map((id) => map.nodes.find((n) => n.id === id))
      .filter((n): n is TopologyNode => Boolean(n && isHostNode(n)));
    if (!selected.length) {
      showToast('Nenhum host válido na seleção');
      return;
    }
    setBulkCredsTargets(selected);
    setContextMenu(null);
    setBulkCredsEditOpen(true);
  }, [map.nodes, selectedNodeIds, showToast]);

  const canvasMenuItems = useCallback((): ContextMenuItem[] => {
    const { mapX, mapY } = contextMenu ?? { mapX: 0, mapY: 0 };
    const items: ContextMenuItem[] = [];

    if (selectedNodeIds.length >= 1) {
      items.push({
        id: 'bulk-icon',
        label: `Alterar tipo / ícone (${selectedNodeIds.length} hosts)`,
        onClick: openBulkIconEdit,
      });
      items.push({
        id: 'bulk-creds',
        label: `Usuário / senha Tools (${selectedNodeIds.length} hosts)`,
        onClick: openBulkCredsEdit,
      });
    }

    items.push(
      {
        id: 'add-host',
        label: 'Adicionar host',
        onClick: () => {
          setContextMenu(null);
          setAddHostAt({ mapX: snapCoord(mapX), mapY: snapCoord(mapY) });
        },
      },
      {
        id: 'add-device',
        label: 'Adicionar dispositivo manual',
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
      }
    );

    return items;
  }, [contextMenu, openBulkCredsEdit, openBulkIconEdit, persist, selectedNodeIds.length, snapCoord, storedMap]);

  const linkMenuItems = useCallback(
    (link: TopologyLink): ContextMenuItem[] => {
      const medium = resolveLinkMedium(link);
      return [
        {
          id: 'link-edit',
          label: 'Editar link…',
          onClick: () => {
            setContextMenu(null);
            setEditLink(link);
          },
        },
        {
          id: 'link-straight',
          label: 'Linha reta (remover desvios)',
          onClick: () => {
            setContextMenu(null);
            resetLinkRoute(link);
          },
        },
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
    [persist, resetLinkRoute, storedMap]
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

      if (selectedNodeIds.length >= 1 && selectedNodeIds.includes(node.id) && isHostNode(node)) {
        items.push({
          id: 'bulk-icon',
          label: `Alterar tipo / ícone (${selectedNodeIds.length} hosts)`,
          onClick: openBulkIconEdit,
        });
        items.push({
          id: 'bulk-creds',
          label: `Usuário / senha Tools (${selectedNodeIds.length} hosts)`,
          onClick: openBulkCredsEdit,
        });
      }

      if (
        (node.type ?? 'host') === 'host' ||
        node.type === 'network' ||
        node.type === 'static' ||
        node.type === 'submap'
      ) {
        if (selectedNodeIds.length < 2 || !selectedNodeIds.includes(node.id)) {
          items.push({
            id: 'props',
            label: 'Propriedades',
            onClick: () => openHostEditor(node),
          });
          if (node.zabbixHost?.trim()) {
            items.push({
              id: 'rebind-zabbix',
              label: 'Trocar host Zabbix',
              onClick: () => openZabbixRebind(node),
            });
          }
        }
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
        onClick: () =>
          persist(
            removeNodeFromMap(storedMap, node.id, { zabbixHost: node.zabbixHost, type: node.type })
          ),
      });
      return items;
    },
    [beginLinkFrom, buildToolsMenu, editable, openBulkCredsEdit, openBulkIconEdit, openHostEditor, openZabbixRebind, persist, selectedNodeIds, storedMap]
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
      <TopologyToolbar
        locked={Boolean(map.locked)}
        networksLocked={areNetworksLocked(storedMap)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onToggleLock={() => persist(toggleMapLock(storedMap))}
        onToggleNetworksLock={() => persist(toggleNetworksLock(storedMap))}
        flowPaused={flowPaused}
        onToggleFlow={() => setFlowPaused((p) => !p)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => void toggleFullscreen()}
        showEditControls={canPersist}
      />

      {selectedLinkLabels && (
        <TopologyEditHint>
          Link ({selectedLinkLabels.medium === 'radio' ? 'Rádio' : 'Fibra'}):{' '}
          <strong>{selectedLinkLabels.from}</strong> → <strong>{selectedLinkLabels.to}</strong>
          {editable ? (
            <>
              {' '}
              · Arraste a linha para desviar · Duplo-clique na curva para remover · Botão direito → Linha reta
            </>
          ) : (
            <> (clique no fundo para desmarcar)</>
          )}
        </TopologyEditHint>
      )}

      {linkFromId !== null && editable && (
        <TopologyEditHint>
          {linkFromId === '' ? 'Clique no primeiro host do link' : 'Clique no host de destino (Esc cancela)'}
        </TopologyEditHint>
      )}

      {editable && selectedNodeIds.length > 0 && (
        <TopologyEditHint>
          <strong>{selectedNodeIds.length}</strong> host(s) selecionado(s).
          {selectedNodeIds.length >= 1 && (
            <>
              {' '}
              <span
                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={openBulkIconEdit}
              >
                Alterar tipo
              </span>
              {' · '}
              <span
                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={openBulkCredsEdit}
              >
                Usuário/senha
              </span>
              {' · '}
            </>
          )}
          Shift+arrastar no fundo para caixa de seleção · Ctrl+clique alterna · Arraste para mover · Esc limpa
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
              const stats = regionStats.get(node.id);
              const fillOverride = regionFillColor(stats, options, 'network', icmpReady);
              const fillRaw =
                fillOverride ??
                (node.fillColor ? node.fillColor : undefined) ??
                options.colorNetworkFill;
              const fill = resolveColor(fillRaw);
              const strokeRaw =
                stats && stats.offline > 0
                  ? options.colorOffline
                  : stats && stats.online > 0
                    ? options.colorOnline
                    : node.borderColor ?? options.colorNetworkBorder;
              const stroke = resolveColor(strokeRaw);
              const statsLabel = stats ? formatRegionStats(stats, icmpReady) : undefined;
              const statsPad = 8;
              const statsFontSize = Math.max(9, options.nodeFontSize - 1);
              const statsY = statsLabel ? y + h - statsPad - statsFontSize / 2 : y + labelY;

              const networkOffline =
                Boolean(icmpReady && stats && !stats.loadFailed && stats.total > 0 && stats.offline > 0);

              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  className={networkOffline ? styles.offlineBlink : undefined}
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
                    fill={resolveColor(options.colorNetworkLabel)}
                    fontSize={options.nodeFontSize}
                    fontFamily="Inter, Helvetica, Arial, sans-serif"
                    pointerEvents="none"
                  >
                    {label}
                  </text>
                  {statsLabel && (
                    <text
                      x={x + 8}
                      y={statsY}
                      textAnchor="start"
                      dominantBaseline="middle"
                      fill={stats!.offline > 0 ? '#ffcdd2' : '#c8e6c9'}
                      fontSize={statsFontSize}
                      fontFamily="Inter, Helvetica, Arial, sans-serif"
                      pointerEvents="none"
                    >
                      {statsLabel}
                    </text>
                  )}
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
              waypoints={resolveLinkWaypoints(link)}
              nodeLayouts={nodeLayouts}
              options={options}
              editable={editable}
              selected={Boolean(selectedLink && linkKey(selectedLink) === linkKey(link))}
              hovered={hoveredLinkKey === linkKey(link)}
              onSelect={() => onLinkSelect(link)}
              onHoverChange={(active) => setHoveredLinkKey(active ? linkKey(link) : null)}
              onContextMenu={(e) => handleContextMenu(e, { link })}
              onPathPointerDown={(e) => {
                const el = wrapRef.current;
                if (!el) {
                  return;
                }
                const rect = el.getBoundingClientRect();
                const { x, y } = clientToMapCoords(e.clientX, e.clientY, rect, view);
                beginLinkWaypointDrag(e, link, x, y);
              }}
              onPathDoubleClick={(e) => {
                const el = wrapRef.current;
                if (!el || !editable) {
                  return;
                }
                e.stopPropagation();
                const rect = el.getBoundingClientRect();
                const { x, y } = clientToMapCoords(e.clientX, e.clientY, rect, view);
                const wps = resolveLinkWaypoints(link);
                const idx = nearestWaypointIndex(wps, { x, y }, Math.max(12, 16 / view.scale));
                if (idx >= 0) {
                  removeLinkWaypoint(link, idx);
                }
              }}
            />
          ))}

          {alignGuides.map((guide, i) => (
            <line
              key={`guide-${guide.orientation}-${guide.position}-${guide.kind}-${i}`}
              x1={guide.x1}
              y1={guide.y1}
              x2={guide.x2}
              y2={guide.y2}
              stroke={guide.kind === 'center' ? '#FF4081' : '#00E5FF'}
              strokeWidth={guide.kind === 'center' ? 1.5 : 1}
              strokeDasharray={guide.kind === 'center' ? undefined : '6 4'}
              strokeOpacity={0.95}
              pointerEvents="none"
            />
          ))}

          {marqueeRect && (
            <rect
              x={Math.min(marqueeRect.x0, marqueeRect.x1)}
              y={Math.min(marqueeRect.y0, marqueeRect.y1)}
              width={Math.abs(marqueeRect.x1 - marqueeRect.x0)}
              height={Math.abs(marqueeRect.y1 - marqueeRect.y0)}
              fill="rgba(79,195,247,0.12)"
              stroke="#4FC3F7"
              strokeWidth={1}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}

          {map.nodes
            .filter((n) => n.type !== 'network')
            .map((node) => {
            const layout = nodeLayouts.get(node.id);
            if (!layout) {
              return null;
            }
            const { w, h, label, sub, labelFontSize, subFontSize, labelY, subY, iconCenterY, x, y } = layout as typeof layout & {
              x: number;
              y: number;
            };
              const fillOverride =
                node.type === 'submap'
                  ? regionFillColor(regionStats.get(node.id), options, 'submap', icmpReady)
                  : undefined;
              const fillRaw =
                fillOverride ??
                (node.fillColor ? node.fillColor : undefined) ??
                nodeFill(node, options, statusMap, hostMetadata);
              const fill = resolveColor(fillRaw);
            const regionLabel =
              node.type === 'submap' && regionStats.has(node.id)
                ? formatRegionStats(regionStats.get(node.id)!, icmpReady, 'submap')
                : undefined;
            const labelColor =
              node.type === 'static' && node.labelColor
                ? resolveColor(node.labelColor)
                : textOnBackground(fill);
            const subtitleColor =
              node.type === 'static' && node.labelColor
                ? resolveColor(node.labelColor)
                : regionLabel
                  ? regionStats.get(node.id)!.offline > 0
                    ? isDarkBackground(fill)
                      ? '#ffcdd2'
                      : '#b71c1c'
                    : isDarkBackground(fill)
                      ? '#c8e6c9'
                      : '#1b5e20'
                  : subtextOnBackground(fill);
            const displaySub = regionLabel ?? sub;
            const displaySubY = subY;
            const isHostNode = (node.type ?? 'host') === 'host';
            const hostStatus = isHostNode
              ? resolveNodeStatus(
                  node,
                  statusMap,
                  offlineThresholdForMetric(effectiveStatusMetric(options)),
                  effectiveStatusMetric(options),
                  hostMetadata
                )
              : null;
            const submapOffline =
              node.type === 'submap' &&
              Boolean(
                icmpReady &&
                  regionStats.get(node.id) &&
                  !regionStats.get(node.id)!.loadFailed &&
                  regionStats.get(node.id)!.total > 0 &&
                  regionStats.get(node.id)!.offline > 0
              );
            const isOfflineBlink = hostStatus === 'offline' || submapOffline;
            const hostIcon = isHostNode ? resolveHostIcon(node) : null;
            const textCenterX = x + w / 2;
            const iconX = x + w / 2;
            const iconY = iconCenterY !== undefined ? y + iconCenterY : y + h / 2;
            const isLinkSource = linkFromId === node.id;
            const isLinkTarget = linkFromId !== null && linkHoverId === node.id;
            const isSelected = selectedNodeIds.includes(node.id);
            const isSelectedLinkEndpoint =
              selectedLink !== null && (node.id === selectedLink.from || node.id === selectedLink.to);

            return (
              <g
                key={node.id}
                data-node-id={node.id}
                className={isOfflineBlink ? styles.offlineBlink : undefined}
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
                    isSelected || isSelectedLinkEndpoint
                      ? '#4FC3F7'
                      : isLinkSource || isLinkTarget
                        ? '#fff'
                        : 'rgba(255,255,255,0.35)'
                  }
                  strokeWidth={isSelected || isSelectedLinkEndpoint ? 3 : isLinkSource || isLinkTarget ? 2 : 1}
                />
                {hostIcon && (
                  <HostIconGlyph
                    icon={hostIcon}
                    x={iconX}
                    y={iconY}
                    size={hostIconRenderSize(hostIcon)}
                  />
                )}
                {editable && (node.type === 'static' || node.type === 'submap') && (
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
                <text
                  x={textCenterX}
                  y={y + labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={labelColor}
                  fontSize={labelFontSize}
                  fontFamily="Inter, Helvetica, Arial, sans-serif"
                  pointerEvents="none"
                >
                  {label}
                </text>
                {displaySub && displaySubY !== undefined && (
                  <text
                    x={textCenterX}
                    y={y + displaySubY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={subtitleColor}
                    fontSize={Math.max(9, subFontSize)}
                    fontFamily="Inter, Helvetica, Arial, sans-serif"
                    pointerEvents="none"
                  >
                    {displaySub}
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

      {addHostAt && (
        <ZabbixHostPickerModal
          mode="add"
          datasourceUid={options.zabbixDatasourceUid}
          storedMap={storedMap}
          onClose={() => setAddHostAt(null)}
          onConfirm={(visibleName, ip, icon) =>
            persist(addZabbixHostAt(storedMap, addHostAt.mapX, addHostAt.mapY, visibleName, ip, icon))
          }
        />
      )}

      {editZabbixHost && (
        <ZabbixHostPickerModal
          mode="edit"
          datasourceUid={options.zabbixDatasourceUid}
          storedMap={storedMap}
          initialVisibleName={editZabbixHost.zabbixHost}
          initialIcon={editZabbixHost.icon}
          onClose={() => setEditZabbixHost(null)}
          onConfirm={(visibleName, ip, icon) =>
            persist(rebindZabbixHost(storedMap, editZabbixHost.id, visibleName, ip, icon))
          }
        />
      )}

      {bulkIconEditOpen && bulkIconTargets.length >= 1 && (
        <BulkHostIconModal
          count={bulkIconTargets.length}
          onClose={() => {
            setBulkIconEditOpen(false);
            setBulkIconTargets([]);
          }}
          onSave={(icon) => {
            persist(updateHostsIconBulk(storedMap, bulkIconTargets, icon));
            showToast(`Tipo aplicado a ${bulkIconTargets.length} hosts`);
            setBulkIconTargets([]);
          }}
        />
      )}

      {bulkCredsEditOpen && bulkCredsTargets.length >= 1 && (
        <BulkHostCredentialsModal
          count={bulkCredsTargets.length}
          onClose={() => {
            setBulkCredsEditOpen(false);
            setBulkCredsTargets([]);
          }}
          onSave={(creds) => {
            persist(updateHostsCredentialsBulk(storedMap, bulkCredsTargets, creds));
            showToast(`Credenciais aplicadas a ${bulkCredsTargets.length} hosts`);
            setBulkCredsTargets([]);
          }}
        />
      )}

      {pingTarget && (
        <PingModal
          label={pingTarget.label}
          ip={pingTarget.ip}
          zabbixHost={pingTarget.zabbixHost}
          datasourceUid={options.zabbixDatasourceUid}
          onClose={() => setPingTarget(null)}
        />
      )}

      {editLink && (
        <LinkEditModal
          link={editLink}
          onClose={() => setEditLink(null)}
          onSave={(patch) => persist(updateLinkProps(storedMap, editLink.from, editLink.to, patch))}
        />
      )}

      <TopologyToast message={toast} />
    </div>
  );
}

function LinkLineComponent({
  link,
  waypoints,
  nodeLayouts,
  options,
  editable,
  selected,
  hovered,
  onSelect,
  onHoverChange,
  onContextMenu,
  onPathPointerDown,
  onPathDoubleClick,
}: {
  link: TopologyLink;
  waypoints: LinkPoint[];
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  options: TopologyPanelOptions;
  editable: boolean;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHoverChange: (active: boolean) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPathPointerDown: (e: React.PointerEvent) => void;
  onPathDoubleClick: (e: React.MouseEvent) => void;
}) {
  const from = nodeLayouts.get(link.from);
  const to = nodeLayouts.get(link.to);
  if (!from || !to) {
    return null;
  }
  const gridStep = options.gridSize ?? 10;
  const geom = computeLinkGeometry(from, to, gridStep, waypoints);
  const { d, pathPoints } = geom;
  const hasWaypoints = waypoints.length > 0;
  const hitWidth = Math.max(14, linkStrokeWidth(link.bandwidthMbps, options.colorLinkWidth, false, false) + 12);
  const active = selected || hovered;
  const medium = resolveLinkMedium(link);
  const dashArray = medium === 'radio' ? '10 6' : undefined;
  const strokeWidth = linkStrokeWidth(link.bandwidthMbps, options.colorLinkWidth, selected, hovered);
  const laneOffset = Math.max(2, strokeWidth * 0.75);
  const downloadD = buildLinkPathD(pathPoints, gridStep, hasWaypoints, laneOffset);
  const uploadD = buildLinkPathD(pathPoints, gridStep, hasWaypoints, -laneOffset);
  const bandwidthLabel = formatLinkBandwidth(link.bandwidthMbps);
  const mid = linkLabelAnchor(pathPoints, from, to);
  const bandwidthLabelWidth = bandwidthLabel ? bandwidthLabel.length * 6 : 0;
  const strokeColor = selected ? '#4FC3F7' : hovered ? '#81D4FA' : options.colorLink;
  const lineCap = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
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
  const downloadColor = options.colorLinkDownload ?? '#4FC3F7';
  const uploadColor = options.colorLinkUpload ?? '#FFB74D';
  const flowStroke = Math.max(1.5, strokeWidth - 1);

  return (
    <g
      onContextMenu={editable ? onContextMenu : undefined}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <path
        d={d}
        stroke="transparent"
        strokeWidth={hitWidth}
        fill="none"
        pointerEvents="stroke"
        style={{ cursor: editable ? 'grab' : 'pointer' }}
        onPointerDown={(e) => {
          if (editable) {
            onPathPointerDown(e);
            return;
          }
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!editable) {
            onSelect();
          }
        }}
        onDoubleClick={(e) => {
          if (editable) {
            onPathDoubleClick(e);
          }
        }}
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
          {...lineCap}
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
        {...lineCap}
      />
      <path
        d={downloadD}
        data-link-flow="download"
        stroke={downloadColor}
        strokeWidth={flowStroke}
        strokeDasharray={LINK_FLOW_DASH}
        strokeDashoffset="0"
        fill="none"
        pointerEvents="none"
        opacity={selected ? 0.95 : hovered ? 0.9 : 0.82}
        {...lineCap}
      />
      <path
        d={uploadD}
        data-link-flow="upload"
        stroke={uploadColor}
        strokeWidth={flowStroke}
        strokeDasharray={LINK_FLOW_DASH}
        strokeDashoffset="0"
        fill="none"
        pointerEvents="none"
        opacity={selected ? 0.95 : hovered ? 0.9 : 0.82}
        {...lineCap}
      />
      {bandwidthLabel && (
        <g transform={`translate(${mid.x}, ${mid.y}) rotate(${mid.angle})`} pointerEvents="none">
          <rect
            x={-bandwidthLabelWidth / 2}
            y={-7}
            width={bandwidthLabelWidth}
            height={14}
            rx={3}
            fill="rgba(18,18,20,0.82)"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={0.5}
          />
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#E3F2FD"
            fontSize={9}
            fontFamily="Inter, Helvetica, Arial, sans-serif"
            fontWeight={500}
          >
            {bandwidthLabel}
          </text>
        </g>
      )}
    </g>
  );
}

const LinkLine = React.memo(LinkLineComponent, (prev, next) => {
  if (prev.selected !== next.selected || prev.hovered !== next.hovered || prev.editable !== next.editable) {
    return false;
  }
  if (prev.link.from !== next.link.from || prev.link.to !== next.link.to) {
    return false;
  }
  if (prev.link.medium !== next.link.medium || prev.link.bandwidthMbps !== next.link.bandwidthMbps) {
    return false;
  }
  if (JSON.stringify(prev.waypoints) !== JSON.stringify(next.waypoints)) {
    return false;
  }
  const pf = prev.nodeLayouts.get(prev.link.from);
  const pt = prev.nodeLayouts.get(prev.link.to);
  const nf = next.nodeLayouts.get(next.link.from);
  const nt = next.nodeLayouts.get(next.link.to);
  if (!pf || !pt || !nf || !nt) {
    return false;
  }
  if (pf.x !== nf.x || pf.y !== nf.y || pf.w !== nf.w || pf.h !== nf.h) {
    return false;
  }
  if (pt.x !== nt.x || pt.y !== nt.y || pt.w !== nt.w || pt.h !== nt.h) {
    return false;
  }
  return (
    prev.options.colorLink === next.options.colorLink &&
    prev.options.colorLinkDownload === next.options.colorLinkDownload &&
    prev.options.colorLinkUpload === next.options.colorLinkUpload &&
    prev.options.colorLinkWidth === next.options.colorLinkWidth &&
    prev.options.gridSize === next.options.gridSize
  );
});
