import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { PanelData, TimeRange } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import {
  HostDisplayMap,
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
  addDashboardPickerAt,
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
  removeNodesFromMap,
  toggleMapLock,
  toggleNetworksLock,
  updateLinkProps,
  updateStoredNode,
  updateHostsIconBulk,
  updateHostsCredentialsBulk,
  updateSubmapsBulk,
} from '../utils/mapEdits';
import { clamp, computeNetworkLayout, computeNodeLayout, computeStaticLayout, DEFAULT_NETWORK_HEIGHT, DEFAULT_NETWORK_WIDTH, DEFAULT_STATIC_HEIGHT, DEFAULT_STATIC_WIDTH, effectiveStatusMetric, eventTargetsElement, findScrollParents, HostLookupRef, lookupHostDisplay, lookupHostStatus, lookupProblemCount, measureTextWidth, NodeLayout, offlineThresholdForMetric, resolveLinkMedium, resolveNodeStatus, snapNodeCenterToGrid, snapToGrid, withLiveZabbixMeta } from '../utils';
import { HOST_TOOLS, hostIp, resolveToolAuth, runHostTool } from '../utils/hostTools';
import { HostIconGlyph, hostIconRenderSize } from '../utils/hostIcons';
import { isDarkBackground, subtextOnBackground, textOnBackground } from '../utils/colorContrast';
import { resolvePanelColor } from '../utils/panelColors';
import { AlignGuideLine, computeAlignGuides } from '../utils/alignGuides';
import { buildRegionStatsMap, formatRegionStats, regionFillColor } from '../utils/networkStats';
import { isNetworkNode } from '../utils/mapBounds';
import {
  CanvasTool,
  ContextMenuItem,
  TopologyColorLegend,
  TopologyContextMenu,
  TopologyToast,
  TopologyToolbar,
} from './TopologyContextMenu';
import { DashboardNavButton } from './DashboardNavButton';
import { DashboardPickerModal, openDashboardUrl } from './DashboardPickerModal';
import { NodeEditModal, NodeEditSavePayload } from './NodeEditModal';
import { BulkHostIconModal } from './BulkHostIconModal';
import { BulkHostCredentialsModal } from './BulkHostCredentialsModal';
import { BulkSubmapEditModal } from './BulkSubmapEditModal';
import { ZabbixHostPickerModal } from './AddZabbixHostModal';
import { PingModal } from './PingModal';
import { HostHoverPopover } from './HostHoverPopover';
import { LinkEditModal } from './LinkEditModal';
import { TopologyMinimap } from './TopologyMinimap';
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
import { computeEdgePanVelocity } from '../utils/edgePan';
import {
  copyTopologySelection,
  getTopologyClipboard,
  hasTopologyClipboard,
  pasteTopologySelection,
  subscribeTopologyClipboard,
} from '../utils/topologyClipboard';

interface Props {
  map: TopologyMap;
  storedMap: TopologyMap;
  options: TopologyPanelOptions;
  /** UID do datasource Zabbix da aba Query do painel */
  zabbixDatasourceUid?: string;
  /** Host groups definidos na query Zabbix do painel */
  zabbixGroupNames?: string[];
  statusMap: HostStatusMap;
  /** Cores/textos dos Value mappings / Thresholds da Query */
  hostDisplay?: HostDisplayMap;
  /** ICMP puro — estatísticas de rede/submapa (sem problemas Zabbix). */
  regionStatusMap?: HostStatusMap;
  /** ICMP carregado ao menos uma vez — evita vermelho/OK falso antes da API Zabbix. */
  icmpReady?: boolean;
  hostMetadata?: HostMetadataMap;
  problemMap?: HostProblemMap;
  submapHosts?: Record<string, string[] | null | undefined>;
  /** Segundos restantes até o próximo auto-refresh do dashboard */
  refreshCountdown?: number | null;
  /** Intervalo de auto-refresh do dashboard em segundos (null = off/manual) */
  refreshIntervalSec?: number | null;
  /** Frames da Query Zabbix (com overrides de cor/threshold) */
  queryData?: PanelData;
  /** Período selecionado no dashboard */
  timeRange?: TimeRange;
  onMapChange?: (map: TopologyMap) => void;
  onViewChange?: (view: TopologyView) => void;
  onShowMinimapChange?: (show: boolean) => void;
  onShowLegendChange?: (show: boolean) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

/** Faixa nas bordas do painel que dispara pan automático ao arrastar nó/rede. */
const EDGE_PAN_THRESHOLD = 64;
/** Velocidade máxima do pan automático (px de tela por segundo). */
const EDGE_PAN_MAX_SPEED = 720;
/** Movimento mínimo em px de tela antes de arrastar nó (clique vs drag). */
const NODE_DRAG_THRESHOLD_PX = 8;

const styles = {
  wrap: css`
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    background: #111217;
    overscroll-behavior: none;
    touch-action: none;
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
  wrapSelect: css`
    cursor: default;
    &:active {
      cursor: default;
    }
  `,
  wrapPan: css`
    cursor: grab;
    &:active {
      cursor: grabbing;
    }
  `,
  svg: css`
    display: block;
    user-select: none;
    touch-action: none;
  `,
  offlineBlink: css`
    animation: topology-offline-blink 1s ease-in-out infinite;
    @keyframes topology-offline-blink {
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

/** Intervalo máximo entre dois cliques para abrir propriedades (pointer capture bloqueia dblclick nativo). */
const NODE_DOUBLE_TAP_MS = 400;

function nodeSupportsProperties(node: TopologyNode): boolean {
  return (
    node.type === 'submap' ||
    node.type === 'network' ||
    node.type === 'static' ||
    node.type === 'dashboard_picker' ||
    (node.type ?? 'host') === 'host'
  );
}

function linkKey(link: TopologyLink): string {
  return `${link.from}-${link.to}`;
}

function isHostNode(node: TopologyNode): boolean {
  return (node.type ?? 'host') === 'host';
}

function isSubmapNode(node: TopologyNode): boolean {
  return node.type === 'submap';
}

function canMoveSelectedNode(node: TopologyNode, networksLocked: boolean): boolean {
  return node.type === 'network' ? !networksLocked : true;
}

function deleteNodesMenuLabel(count: number): string {
  return count > 1 ? `Excluir seleção (${count})` : 'Excluir seleção';
}

function buildDragGroupMembers(
  selectedNodeIds: string[],
  nodes: TopologyNode[],
  nodeLayouts: Map<string, NodeLayout & TopologyNode>,
  networksLocked: boolean
): Array<{ id: string; startX: number; startY: number; startW: number; startH: number }> {
  return selectedNodeIds
    .map((id) => nodes.find((n) => n.id === id))
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
  hostMetadata?: HostMetadataMap,
  problemMap: HostProblemMap = {},
  hostDisplay?: HostDisplayMap,
  resolveMappedColor?: (color?: unknown) => string | undefined
): string {
  if (node.type === 'submap') {
    return options.colorSubmap;
  }
  if (node.type === 'dashboard_picker') {
    return node.fillColor || options.colorSubmap;
  }
  if (node.type === 'static') {
    return node.fillColor || options.colorStatic;
  }
  const metric = effectiveStatusMetric(options);
  const threshold = offlineThresholdForMetric(metric);
  const lookupRef: HostLookupRef = {
    zabbixHost: node.zabbixHost,
    subtitle: node.subtitle,
    label: node.label,
  };
  const raw = lookupHostStatus(statusMap, lookupRef, hostMetadata);
  const st = resolveNodeStatus(node, statusMap, threshold, metric, hostMetadata);
  const mapped = lookupHostDisplay(hostDisplay, lookupRef, hostMetadata);
  const mappedColor = resolveMappedColor?.(mapped?.color) || mapped?.color;

  // ICMP 0 (ou perda >= limiar) → offline (mapeamento ou fallback); nunca laranja
  const icmpDown =
    raw !== null &&
    raw !== undefined &&
    (metric === 'packet_loss' ? raw >= threshold : raw <= 0);
  if (st === 'offline' || icmpDown) {
    return mappedColor || options.colorOffline;
  }

  // Laranja só se online no ICMP e com problema Zabbix
  if (
    st === 'online' &&
    options.useZabbixProblems !== false &&
    lookupRef.zabbixHost &&
    lookupProblemCount(problemMap, lookupRef, hostMetadata) > 0
  ) {
    return options.colorAlert || '#EF6C00';
  }
  if (st === 'online') {
    return mappedColor || options.colorOnline;
  }
  return options.colorUnknown;
}

export function TopologyCanvas({
  map,
  storedMap,
  options,
  zabbixDatasourceUid,
  zabbixGroupNames = [],
  statusMap,
  hostDisplay,
  regionStatusMap,
  icmpReady = false,
  hostMetadata,
  problemMap = {},
  submapHosts = {},
  refreshCountdown = null,
  refreshIntervalSec = null,
  queryData,
  timeRange,
  onMapChange,
  onViewChange,
  onShowMinimapChange,
  onShowLegendChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: Props) {
  const theme = useTheme2();
  const resolveColor = useCallback((color?: unknown) => resolvePanelColor(theme, color), [theme]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const linkFlowRef = useRef<LinkFlowController | null>(null);
  const savedView = options.view;
  const [view, setView] = useState<TopologyView>(() =>
    savedView && typeof savedView.scale === 'number'
      ? savedView
      : { x: 0, y: 0, scale: 1 }
  );
  const viewRef = useRef(view);
  const commitView = useCallback((next: TopologyView | ((prev: TopologyView) => TopologyView)) => {
    if (typeof next === 'function') {
      setView((prev) => {
        const resolved = next(prev);
        viewRef.current = resolved;
        return resolved;
      });
      return;
    }
    viewRef.current = next;
    setView(next);
  }, []);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [flowPaused, setFlowPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canPersist = Boolean(onMapChange);
  const canEditCanvas = canPersist && !map.locked;
  const editable = canEditCanvas;
  const networksLocked = areNetworksLocked(storedMap);
  const showMinimap = options.showMinimap !== false;
  const showLegend = options.showLegend !== false;
  const [tool, setTool] = useState<CanvasTool>(() => (canEditCanvas ? 'select' : 'pan'));
  const panTool = tool === 'pan';
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const [searchOpen, setSearchOpen] = useState(false);
  const [clipboardReady, setClipboardReady] = useState(() => hasTopologyClipboard());

  useEffect(() => {
    const sync = () => setClipboardReady(hasTopologyClipboard());
    sync();
    return subscribeTopologyClipboard(sync);
  }, []);

  useEffect(() => {
    setTool(canEditCanvas ? 'select' : 'pan');
  }, [canEditCanvas]);
  const dragRef = useRef<
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
        group?: Array<{ id: string; startX: number; startY: number; startW: number; startH: number }>;
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
      }
    | null
  >(null);
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
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const pasteOffsetRef = useRef(0);
  const lastNodeTapRef = useRef<{ nodeId: string; time: number } | null>(null);
  /** True while two-finger pinch zoom is active (blocks single-finger pan). */
  const pinchActiveRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [marqueeRect, setMarqueeRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [bulkIconEditOpen, setBulkIconEditOpen] = useState(false);
  const [bulkIconTargets, setBulkIconTargets] = useState<TopologyNode[]>([]);
  const [bulkCredsEditOpen, setBulkCredsEditOpen] = useState(false);
  const [bulkCredsTargets, setBulkCredsTargets] = useState<TopologyNode[]>([]);
  const [bulkSubmapEditOpen, setBulkSubmapEditOpen] = useState(false);
  const [bulkSubmapTargets, setBulkSubmapTargets] = useState<TopologyNode[]>([]);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [editNode, setEditNode] = useState<TopologyNode | null>(null);
  const [pickerNode, setPickerNode] = useState<TopologyNode | null>(null);
  const [addHostAt, setAddHostAt] = useState<{ mapX: number; mapY: number } | null>(null);
  const [linkHoverId, setLinkHoverId] = useState<string | null>(null);
  const [hostHover, setHostHover] = useState<{
    node: TopologyNode;
    screenX: number;
    screenY: number;
  } | null>(null);
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

  const { nodeLayouts, regionStats } = useMemo(() => {
    const layouts = new Map<string, NodeLayout & TopologyNode>();
    for (const node of map.nodes) {
      const liveNode = withLiveZabbixMeta(node, hostMetadata);
      const movePreview = dragPreview?.positions?.[node.id];
      const resizePreview =
        dragPreview?.nodeId === node.id && dragPreview.width !== undefined ? dragPreview : null;
      const positioned = movePreview
        ? { ...liveNode, x: movePreview.x, y: movePreview.y }
        : resizePreview
          ? {
              ...liveNode,
              width: resizePreview.width ?? liveNode.width,
              height: resizePreview.height ?? liveNode.height,
            }
          : liveNode;
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

    return { nodeLayouts: layouts, regionStats: stats };
  }, [map.nodes, layoutOpts, dragPreview, regionStatusMap, statusMap, options, submapHosts, hostMetadata, icmpReady, problemMap]);

  const validLinks = useMemo(() => {
    return map.links.filter((l) => {
      const from = nodeLayouts.get(l.from);
      const to = nodeLayouts.get(l.to);
      return from && to && from.type !== 'network' && to.type !== 'network';
    });
  }, [map.links, nodeLayouts]);

  const persist = useCallback(
    (next: TopologyMap) => {
      onMapChange?.(next);
    },
    [onMapChange]
  );

  const showToast = useCallback((message: string | undefined) => {
    if (!message) {
      return;
    }
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const copySelection = useCallback(() => {
    const payload = copyTopologySelection(map, storedMap, selectedNodeIds, selectedLink);
    if (!payload) {
      showToast('Nada selecionado para copiar');
      return;
    }
    pasteOffsetRef.current = 0;
    const linkHint = payload.links.length > 0 ? ` · ${payload.links.length} link(s)` : '';
    showToast(`${payload.nodes.length} elemento(s) copiado(s)${linkHint}`);
  }, [map, selectedLink, selectedNodeIds, showToast, storedMap]);

  const pasteAt = useCallback(
    (anchorX: number, anchorY: number) => {
      const payload = getTopologyClipboard();
      if (!payload) {
        showToast('Nada copiado — selecione e use Ctrl+C primeiro');
        return;
      }
      const offset = pasteOffsetRef.current;
      pasteOffsetRef.current += 1;
      const result = pasteTopologySelection(storedMap, payload, anchorX, anchorY, snapCoord, offset);
      persist(result.map);
      setSelectedNodeIds(result.pastedNodeIds);
      setSelectedLink(null);
      setContextMenu(null);
      showToast(`${result.pastedNodeIds.length} elemento(s) colado(s)`);
    },
    [persist, showToast, snapCoord, storedMap]
  );

  const pasteAtViewCenter = useCallback(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const x = (el.clientWidth / 2 - view.x) / view.scale;
    const y = (el.clientHeight / 2 - view.y) / view.scale;
    pasteAt(x, y);
  }, [pasteAt, view.scale, view.x, view.y]);

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
      const fs = Boolean(el && document.fullscreenElement === el);
      setIsFullscreen(fs);
      if (fs) {
        setSearchOpen(false);
      }
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

  const focusNodeOnMap = useCallback(
    (nodeId: string) => {
      const layout = nodeLayouts.get(nodeId);
      const el = wrapRef.current;
      if (!layout || !el) {
        return;
      }
      const cx = layout.x + layout.w / 2;
      const cy = layout.y + layout.h / 2;
      const scale = clamp(Math.max(viewRef.current.scale, 0.55), 0.15, 3);
      commitView({
        scale,
        x: el.clientWidth / 2 - cx * scale,
        y: el.clientHeight / 2 - cy * scale,
      });
      setSelectedNodeIds([nodeId]);
      setSelectedLink(null);
      setLinkFromId(null);
      setContextMenu(null);
      setMarqueeRect(null);
      setAlignGuides([]);
    },
    [commitView, nodeLayouts]
  );

  const fitToView = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !map.width || !map.height) {
      return;
    }
    const pad = 24;
    const sx = (el.clientWidth - pad * 2) / map.width;
    const sy = (el.clientHeight - pad * 2) / map.height;
    const scale = clamp(Math.min(sx, sy), 0.15, 2);
    commitView({
      scale,
      x: (el.clientWidth - map.width * scale) / 2,
      y: (el.clientHeight - map.height * scale) / 2,
    });
  }, [commitView, map.width, map.height]);

  const didInitialFitRef = useRef(false);
  useEffect(() => {
    if (didInitialFitRef.current || !map.width || !map.height) {
      return;
    }
    if (savedView && typeof savedView.scale === 'number') {
      commitView(savedView);
    } else {
      fitToView();
    }
    didInitialFitRef.current = true;
  }, [commitView, fitToView, map.width, map.height, savedView]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const onResize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setViewport({ w, h });
      }
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

    type PinchState = {
      dist0: number;
      mid0x: number;
      mid0y: number;
      view0: TopologyView;
    };
    let pinch: PinchState | null = null;
    let pinchRaf: number | null = null;
    let pinchPending: TopologyView | null = null;

    const isOverPanel = (e: Event) => eventTargetsElement(e, el);

    const applyZoomAt = (clientX: number, clientY: number, nextScale: number, from: TopologyView) => {
      const rect = el.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      const ns = clamp(nextScale, 0.1, 4);
      return {
        scale: ns,
        x: mx - ((mx - from.x) * ns) / from.scale,
        y: my - ((my - from.y) * ns) / from.scale,
      };
    };

    const applyZoom = (clientX: number, clientY: number, deltaY: number) => {
      commitView((v) => {
        const delta = deltaY > 0 ? 0.9 : 1.1;
        return applyZoomAt(clientX, clientY, v.scale * delta, v);
      });
    };

    const flushPinch = () => {
      pinchRaf = null;
      if (!pinchPending) {
        return;
      }
      const next = pinchPending;
      pinchPending = null;
      commitView(next);
    };

    const touchPair = (touches: TouchList) => {
      if (touches.length < 2) {
        return null;
      }
      const a = touches[0];
      const b = touches[1];
      const rect = el.getBoundingClientRect();
      return {
        dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY) || 1,
        midX: (a.clientX + b.clientX) / 2 - rect.left,
        midY: (a.clientY + b.clientY) / 2 - rect.top,
      };
    };

    const endPinch = () => {
      pinchActiveRef.current = false;
      pinch = null;
      if (pinchRaf != null) {
        cancelAnimationFrame(pinchRaf);
        pinchRaf = null;
      }
      if (pinchPending) {
        flushPinch();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        return;
      }
      const pair = touchPair(e.touches);
      if (!pair) {
        return;
      }
      e.preventDefault();
      // Interrompe pan/drag de 1 dedo — pinch assume o gesto.
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
      pinchActiveRef.current = true;
      pinch = {
        dist0: pair.dist,
        mid0x: pair.midX,
        mid0y: pair.midY,
        view0: { ...viewRef.current },
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length < 2) {
        return;
      }
      const pair = touchPair(e.touches);
      if (!pair) {
        return;
      }
      e.preventDefault();
      const ns = clamp(pinch.view0.scale * (pair.dist / pinch.dist0), 0.1, 4);
      // Mantém o ponto do mapa sob o meio dos dedos (zoom + pan com 2 dedos).
      pinchPending = {
        scale: ns,
        x: pair.midX - ((pinch.mid0x - pinch.view0.x) * ns) / pinch.view0.scale,
        y: pair.midY - ((pinch.mid0y - pinch.view0.y) * ns) / pinch.view0.scale,
      };
      if (pinchRaf == null) {
        pinchRaf = requestAnimationFrame(flushPinch);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        endPinch();
      }
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

    let lastWheelTs = -1;
    // Listener genérico (Event) — attachado em document/el/scrollParents, tipos mistos
    // não compartilham o overload específico de WheelEvent do addEventListener.
    const onWheel = (evt: Event) => {
      if (!(evt instanceof WheelEvent)) {
        return;
      }
      const e = evt;
      if (e.timeStamp === lastWheelTs || !isOverPanel(e)) {
        return;
      }
      lastWheelTs = e.timeStamp;

      const restoreScroll = freezeScrollPosition();
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      applyZoom(e.clientX, e.clientY, e.deltaY);
      restoreScroll?.();
      requestAnimationFrame(() => restoreScroll?.());
    };

    const wheelOpts: AddEventListenerOptions = { passive: false, capture: true };
    const wheelTargets = [document, el, ...scrollParents];

    const onHoverCheck = (e: PointerEvent) => {
      if (isOverPanel(e)) {
        lockScroll();
      } else {
        unlockScroll();
      }
    };

    const onPointerLeavePanel = () => unlockScroll();

    document.addEventListener('pointermove', onHoverCheck, { passive: true });
    for (const target of wheelTargets) {
      target.addEventListener('wheel', onWheel, wheelOpts);
    }
    el.addEventListener('pointerleave', onPointerLeavePanel);
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      document.removeEventListener('pointermove', onHoverCheck);
      for (const target of wheelTargets) {
        target.removeEventListener('wheel', onWheel, wheelOpts);
      }
      el.removeEventListener('pointerleave', onPointerLeavePanel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      endPinch();
      unlockScroll();
    };
  }, [commitView, options.enableZoom, map.nodes.length]);

  const openSubmap = useCallback((node: TopologyNode) => {
    if (node.type !== 'submap' || !node.submapUid) {
      return;
    }
    openDashboardUrl(node.submapUid, node.submapSlug);
  }, []);

  const openDashboardPicker = useCallback((node: TopologyNode) => {
    if (node.type !== 'dashboard_picker') {
      return;
    }
    const choices = (node.dashboardChoices ?? []).filter((c) => c.uid?.trim());
    if (choices.length === 1) {
      openDashboardUrl(choices[0].uid, choices[0].slug);
      return;
    }
    setPickerNode(node);
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
      if (
        !editable ||
        (node.type !== 'network' &&
          node.type !== 'static' &&
          node.type !== 'submap' &&
          node.type !== 'dashboard_picker')
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

  const beginPan = useCallback(
    (e: React.PointerEvent, tapNode?: TopologyNode, tapLink?: TopologyLink) => {
      if (pinchActiveRef.current) {
        return;
      }
      if (!options.enablePan) {
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
    [options.enablePan, view.x, view.y]
  );

  const beginMarquee = useCallback((e: React.PointerEvent, mapX: number, mapY: number) => {
    e.stopPropagation();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!additive) {
      setSelectedNodeIds([]);
    }
    dragRef.current = { kind: 'marquee', mapX0: mapX, mapY0: mapY, additive };
    setMarqueeRect({ x0: mapX, y0: mapY, x1: mapX, y1: mapY });
    wrapRef.current?.setPointerCapture(e.pointerId);
  }, []);

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
    [editable, gridStep, nodeLayouts, resolveLinkWaypoints, view.scale]
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
      if (toolRef.current === 'pan') {
        setSelectedNodeIds([]);
        setSelectedLink(null);
        setContextMenu(null);
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
        setContextMenu(null);
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
      setContextMenu(null);
    },
    [beginPan, editable, view]
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
  }, []);

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
        if (options.enablePan && canMoveSelectedNode(d.node, areNetworksLocked(storedMap))) {
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
      const primarySnapped = snapNodeCenterToGrid(
        rawPrimaryX,
        rawPrimaryY,
        d.startW,
        d.startH,
        gridStep
      );
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
    [edgePanRect, gridStep, map.height, map.nodes, map.width, nodeLayouts, options.enablePan, storedMap]
  );

  const runEdgePanFrame = useCallback(
    (timestamp: number) => {
      const d = dragRef.current;
      const ptr = dragPointerRef.current;
      if (!d || d.kind !== 'node' || !d.moved || !options.enablePan || !ptr) {
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

      const { vx, vy } = computeEdgePanVelocity(
        ptr.clientX,
        ptr.clientY,
        rect,
        EDGE_PAN_THRESHOLD,
        EDGE_PAN_MAX_SPEED
      );

      if (vx !== 0 || vy !== 0) {
        const v = viewRef.current;
        commitView({ ...v, x: v.x + vx * dt, y: v.y + vy * dt });
        applyNodeDragMove(ptr.clientX, ptr.clientY);
      }

      edgePanRafRef.current = requestAnimationFrame(runEdgePanFrame);
    },
    [applyNodeDragMove, commitView, edgePanRect, options.enablePan]
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
    (
      e: React.PointerEvent,
      node: TopologyNode,
      startX: number,
      startY: number,
      startW: number,
      startH: number
    ) => {
      e.preventDefault();
      const el = wrapRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const currentView = viewRef.current;
      const pointerWorld = clientToMapCoords(e.clientX, e.clientY, rect, currentView);
      const networksLocked = areNetworksLocked(storedMap);
      let group: Array<{ id: string; startX: number; startY: number; startW: number; startH: number }> | undefined;
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
    [map.nodes, nodeLayouts, selectedNodeIds, storedMap]
  );

  useEffect(() => () => stopEdgePanLoop(), [stopEdgePanLoop]);

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
      beginNodeDrag(
        e,
        node,
        startX,
        startY,
        layout?.w ?? node.width ?? 48,
        layout?.h ?? node.height ?? 28
      );
    },
    [beginNodeDrag, beginPan, editable, nodeLayouts]
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
    [beginMarquee, beginNodeDrag, beginPan, editable, nodeLayouts, storedMap, view]
  );

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) {
        return;
      }
      setSelectedLink(null);
      setContextMenu(null);
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
    [beginMarquee, beginPan, editable, view]
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
    [applyNodeDragMove, commitView, nodeLayouts, snapCoord, storedMap, view, viewport.h, viewport.w, gridStep]
  );

  const clearDragUi = useCallback(() => {
    setAlignGuides([]);
  }, []);

  const openNodeProperties = useCallback(
    (node: TopologyNode) => {
      const stored = storedMap.nodes.find((n) => n.id === node.id);
      setEditNode(stored ?? node);
    },
    [storedMap]
  );

  const tryDoubleTapOpenProperties = useCallback(
    (tapNode: TopologyNode): boolean => {
      if (!editable || linkFromId !== null || !nodeSupportsProperties(tapNode)) {
        return false;
      }
      const now = Date.now();
      const last = lastNodeTapRef.current;
      if (last && last.nodeId === tapNode.id && now - last.time <= NODE_DOUBLE_TAP_MS) {
        lastNodeTapRef.current = null;
        openNodeProperties(tapNode);
        return true;
      }
      lastNodeTapRef.current = { nodeId: tapNode.id, time: now };
      return false;
    },
    [editable, linkFromId, openNodeProperties]
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
          persist(
            moveStoredNodesBulk(storedMap, moves, (nodeId) => map.nodes.find((n) => n.id === nodeId))
          );
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
    [applyNodeDragMove, clearDragUi, commitView, completeLink, editable, linkFromId, map.nodes, nodeLayouts, onLinkSelect, openDashboardPicker, openSubmap, persist, stopEdgePanLoop, storedMap, tryDoubleTapOpenProperties, view]
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
      if (!editable && node.type === 'dashboard_picker') {
        openDashboardPicker(node);
      }
    },
    [completeLink, editable, linkFromId, openDashboardPicker, openSubmap]
  );

  const onNodeDoubleClick = useCallback(
    (e: React.MouseEvent, node: TopologyNode) => {
      e.stopPropagation();
      if (editable) {
        if (nodeSupportsProperties(node)) {
          lastNodeTapRef.current = null;
          openNodeProperties(node);
        }
        return;
      }
      if (node.type === 'submap') {
        openSubmap(node);
      }
      if (node.type === 'dashboard_picker') {
        openDashboardPicker(node);
      }
    },
    [editable, openDashboardPicker, openNodeProperties, openSubmap]
  );

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
                label: node.label?.trim() ?? '',
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

      const rawNode = target?.node;
      const node =
        rawNode?.type === 'network' && areNetworksLocked(storedMap) ? undefined : rawNode;
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

      if (node && !selectedNodeIds.includes(node.id)) {
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
        node,
        link: target?.link,
      });
    },
    [canEditCanvas, canPersist, map.locked, selectedNodeIds, showToast, storedMap, view]
  );

  const selectedHostNodes = useMemo(
    () =>
      selectedNodeIds
        .map((id) => map.nodes.find((n) => n.id === id))
        .filter((n): n is TopologyNode => Boolean(n && isHostNode(n))),
    [map.nodes, selectedNodeIds]
  );

  const selectedSubmapNodes = useMemo(
    () =>
      selectedNodeIds
        .map((id) => map.nodes.find((n) => n.id === id))
        .filter((n): n is TopologyNode => Boolean(n && isSubmapNode(n))),
    [map.nodes, selectedNodeIds]
  );

  const selectedNodes = useMemo(
    () =>
      selectedNodeIds
        .map((id) => map.nodes.find((n) => n.id === id))
        .filter((n): n is TopologyNode => Boolean(n)),
    [map.nodes, selectedNodeIds]
  );

  const clearNodeDragUi = useCallback(() => {
    dragPositionsRef.current = null;
    setDragPreview(null);
    clearDragUi();
  }, [clearDragUi]);

  const removeNodesFromCanvas = useCallback(
    (nodesToRemove: TopologyNode[]) => {
      if (!nodesToRemove.length) {
        return;
      }
      const removedIds = new Set(nodesToRemove.map((n) => n.id));
      persist(removeNodesFromMap(storedMap, nodesToRemove));
      setSelectedNodeIds((prev) => prev.filter((id) => !removedIds.has(id)));
      clearNodeDragUi();
      setContextMenu(null);
    },
    [clearNodeDragUi, persist, storedMap]
  );

  const deleteSelectedNodes = useCallback(() => {
    if (!selectedNodes.length) {
      return;
    }
    removeNodesFromCanvas(selectedNodes);
  }, [removeNodesFromCanvas, selectedNodes]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const el = wrapRef.current;
        if (el && (searchOpen || el.matches(':hover') || el.contains(document.activeElement))) {
          e.preventDefault();
          setSearchOpen(true);
        }
        return;
      }

      if (e.key === 'Escape' && searchOpen) {
        e.preventDefault();
        setSearchOpen(false);
        return;
      }

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

      const el = wrapRef.current;
      const panelActive = Boolean(el && (el.matches(':hover') || el.contains(document.activeElement)));

      if (canEditCanvas && !inField && panelActive) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
          if (selectedNodeIds.length > 0 || selectedLink) {
            e.preventDefault();
            copySelection();
          }
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
          if (hasTopologyClipboard()) {
            e.preventDefault();
            pasteAtViewCenter();
          }
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedNodeIds.length > 0) {
            e.preventDefault();
            deleteSelectedNodes();
            return;
          }
          if (selectedLink) {
            e.preventDefault();
            persist(removeLinkByEndpoints(storedMap, selectedLink.from, selectedLink.to));
            setSelectedLink(null);
            return;
          }
        }
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
  }, [
    canEditCanvas,
    canPersist,
    copySelection,
    deleteSelectedNodes,
    onRedo,
    onUndo,
    pasteAtViewCenter,
    persist,
    searchOpen,
    selectedLink,
    selectedNodeIds,
    storedMap,
  ]);

  const openBulkIconEdit = useCallback(() => {
    if (!selectedHostNodes.length) {
      showToast('Nenhum host válido na seleção');
      return;
    }
    setBulkIconTargets(selectedHostNodes);
    setContextMenu(null);
    setBulkIconEditOpen(true);
  }, [selectedHostNodes, showToast]);

  const openBulkCredsEdit = useCallback(() => {
    if (!selectedHostNodes.length) {
      showToast('Nenhum host válido na seleção');
      return;
    }
    setBulkCredsTargets(selectedHostNodes);
    setContextMenu(null);
    setBulkCredsEditOpen(true);
  }, [selectedHostNodes, showToast]);

  const openBulkSubmapEdit = useCallback(() => {
    if (!selectedSubmapNodes.length) {
      showToast('Nenhum submapa válido na seleção');
      return;
    }
    setBulkSubmapTargets(selectedSubmapNodes);
    setContextMenu(null);
    setBulkSubmapEditOpen(true);
  }, [selectedSubmapNodes, showToast]);

  const canvasMenuItems = useCallback((): ContextMenuItem[] => {
    const { mapX, mapY } = contextMenu ?? { mapX: 0, mapY: 0 };
    const items: ContextMenuItem[] = [];

    if (selectedNodeIds.length > 0 || selectedLink) {
      items.push({
        id: 'copy-selection',
        label:
          selectedNodeIds.length > 1
            ? `Copiar seleção (${selectedNodeIds.length})`
            : 'Copiar seleção',
        onClick: () => {
          setContextMenu(null);
          copySelection();
        },
      });
    }

    if (hasTopologyClipboard()) {
      items.push({
        id: 'paste-here',
        label: 'Colar aqui',
        onClick: () => pasteAt(snapCoord(mapX), snapCoord(mapY)),
      });
    }

    if (selectedHostNodes.length >= 1) {
      items.push({
        id: 'bulk-icon',
        label: `Alterar tipo / ícone (${selectedHostNodes.length} hosts)`,
        onClick: openBulkIconEdit,
      });
      items.push({
        id: 'bulk-creds',
        label: `Usuário / senha Tools (${selectedHostNodes.length} hosts)`,
        onClick: openBulkCredsEdit,
      });
    }

    if (selectedSubmapNodes.length >= 1) {
      items.push({
        id: 'bulk-submap',
        label: `Editar submapas (${selectedSubmapNodes.length})`,
        onClick: openBulkSubmapEdit,
      });
    }

    if (selectedNodes.length > 0) {
      items.push({
        id: 'delete-selection',
        label: deleteNodesMenuLabel(selectedNodes.length),
        variant: 'delete',
        onClick: deleteSelectedNodes,
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
        id: 'add-dashboard-picker',
        label: 'Adicionar seletor de dashboards',
        onClick: () => persist(addDashboardPickerAt(storedMap, snapCoord(mapX), snapCoord(mapY))),
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
  }, [
    contextMenu,
    copySelection,
    deleteSelectedNodes,
    openBulkCredsEdit,
    openBulkIconEdit,
    openBulkSubmapEdit,
    pasteAt,
    persist,
    selectedHostNodes.length,
    selectedLink,
    selectedNodes.length,
    selectedSubmapNodes.length,
    snapCoord,
    storedMap,
  ]);

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
          onClick: () => persist(updateLinkProps(storedMap, link.from, link.to, { medium: 'fiber' })),
        },
        {
          id: 'link-radio',
          label: medium === 'radio' ? '✓ Rádio (linha tracejada)' : 'Marcar como rádio',
          onClick: () => persist(updateLinkProps(storedMap, link.from, link.to, { medium: 'radio' })),
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

      if (selectedNodeIds.length > 0) {
        items.push({
          id: 'copy-selection',
          label:
            selectedNodeIds.length > 1
              ? `Copiar seleção (${selectedNodeIds.length})`
              : 'Copiar seleção',
          onClick: () => {
            setContextMenu(null);
            copySelection();
          },
        });
      }

      if (hasTopologyClipboard()) {
        items.push({
          id: 'paste-here',
          label: 'Colar',
          onClick: () => {
            const anchor = contextMenu ?? { mapX: node.x, mapY: node.y };
            pasteAt(snapCoord(anchor.mapX), snapCoord(anchor.mapY));
          },
        });
      }

      if (selectedNodeIds.includes(node.id) && isHostNode(node) && selectedHostNodes.length >= 1) {
        items.push({
          id: 'bulk-icon',
          label: `Alterar tipo / ícone (${selectedHostNodes.length} hosts)`,
          onClick: openBulkIconEdit,
        });
        items.push({
          id: 'bulk-creds',
          label: `Usuário / senha Tools (${selectedHostNodes.length} hosts)`,
          onClick: openBulkCredsEdit,
        });
      }

      if (selectedNodeIds.includes(node.id) && isSubmapNode(node) && selectedSubmapNodes.length >= 1) {
        items.push({
          id: 'bulk-submap',
          label: `Editar submapas (${selectedSubmapNodes.length})`,
          onClick: openBulkSubmapEdit,
        });
      }

      if (
        (node.type ?? 'host') === 'host' ||
        node.type === 'network' ||
        node.type === 'static' ||
        node.type === 'submap' ||
        node.type === 'dashboard_picker'
      ) {
        if (selectedNodeIds.length < 2 || !selectedNodeIds.includes(node.id)) {
          items.push({
            id: 'props',
            label: 'Propriedades',
            onClick: () => openNodeProperties(node),
          });
        }
      }
      if (node.type !== 'network') {
        items.push({
          id: 'link-from',
          label: 'Adicionar link daqui',
          onClick: () => beginLinkFrom(node.id),
        });
      }

      const multiDelete =
        selectedNodeIds.length >= 2 && selectedNodeIds.includes(node.id) && selectedNodes.length >= 2;

      if (multiDelete) {
        items.push({
          id: 'delete-selection',
          label: deleteNodesMenuLabel(selectedNodes.length),
          variant: 'delete',
          onClick: deleteSelectedNodes,
        });
      } else {
        const deleteLabel =
          node.type === 'submap'
            ? 'Excluir submapa'
            : node.type === 'dashboard_picker'
              ? 'Excluir seletor'
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
            removeNodesFromCanvas([
              {
                ...node,
                zabbixHost: node.zabbixHost,
                subtitle: node.subtitle,
                label: node.label,
              },
            ]),
        });
      }
      return items;
    },
    [
      beginLinkFrom,
      buildToolsMenu,
      contextMenu,
      copySelection,
      deleteSelectedNodes,
      editable,
      openBulkCredsEdit,
      openBulkIconEdit,
      openBulkSubmapEdit,
      openNodeProperties,
      pasteAt,
      removeNodesFromCanvas,
      selectedHostNodes.length,
      selectedNodeIds,
      selectedNodes.length,
      selectedSubmapNodes.length,
      snapCoord,
    ]
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

  const legendItems = useMemo(() => {
    if (options.showLegend === false) {
      return [];
    }
    const items: Array<{ label: string; color: string }> = [];
    if (options.legendOnline !== false) {
      items.push({ label: 'Online', color: options.colorOnline });
    }
    if (options.legendOffline !== false) {
      items.push({ label: 'Offline', color: options.colorOffline });
    }
    if (options.legendAlert !== false) {
      items.push({ label: 'Alerta', color: options.colorAlert || '#EF6C00' });
    }
    if (options.legendUnknown !== false) {
      items.push({ label: 'Sem gerência', color: options.colorUnknown });
    }
    if (options.legendStatic) {
      items.push({ label: 'Estático', color: options.colorStatic });
    }
    if (options.legendSubmap) {
      items.push({ label: 'Submapa', color: options.colorSubmap });
    }
    if (options.legendLink) {
      items.push({ label: 'Cabos', color: options.colorLink });
    }
    if (options.legendDownload) {
      items.push({ label: 'Download (origem)', color: options.colorLinkDownload });
    }
    if (options.legendUpload) {
      items.push({ label: 'Upload (destino)', color: options.colorLinkUpload });
    }
    return items;
  }, [
    options.showLegend,
    options.legendOnline,
    options.legendOffline,
    options.legendAlert,
    options.legendUnknown,
    options.legendStatic,
    options.legendSubmap,
    options.legendLink,
    options.legendDownload,
    options.legendUpload,
    options.colorOnline,
    options.colorOffline,
    options.colorAlert,
    options.colorUnknown,
    options.colorStatic,
    options.colorSubmap,
    options.colorLink,
    options.colorLinkDownload,
    options.colorLinkUpload,
  ]);

  const resolveMiniNodeFill = useCallback(
    (node: TopologyNode): string => {
      if (isNetworkNode(node)) {
        const stats = regionStats.get(node.id);
        const fillOverride = regionFillColor(stats, options, 'network', icmpReady);
        const fillRaw = fillOverride ?? node.fillColor ?? options.colorNetworkFill;
        return resolveColor(fillRaw);
      }
      const fillOverride =
        node.type === 'submap'
          ? regionFillColor(regionStats.get(node.id), options, 'submap', icmpReady)
          : undefined;
      const fillRaw =
        fillOverride ??
        (node.fillColor ? node.fillColor : undefined) ??
        nodeFill(node, options, statusMap, hostMetadata, problemMap, hostDisplay, resolveColor);
      return resolveColor(fillRaw);
    },
    [
      regionStats,
      options,
      icmpReady,
      statusMap,
      hostMetadata,
      problemMap,
      hostDisplay,
      resolveColor,
    ]
  );

  const resolveMiniNetworkStroke = useCallback(
    (node: TopologyNode): string => {
      const stats = regionStats.get(node.id);
      const networkAlert = Boolean(
        icmpReady &&
          stats &&
          !stats.loadFailed &&
          stats.total > 0 &&
          stats.offline === 0 &&
          stats.alert > 0
      );
      const networkOnline = Boolean(
        icmpReady &&
          stats &&
          !stats.loadFailed &&
          stats.total > 0 &&
          stats.offline === 0 &&
          stats.alert === 0 &&
          stats.online > 0
      );
      const strokeRaw =
        stats && stats.offline > 0
          ? options.colorOffline
          : networkAlert
            ? options.colorAlert
            : networkOnline
              ? options.colorOnline
              : node.borderColor ?? options.colorNetworkBorder;
      return resolveColor(strokeRaw);
    },
    [regionStats, options, icmpReady, resolveColor]
  );

  const miniLinkColor = resolveColor(options.colorLink);

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${panTool ? styles.wrapPan : styles.wrapSelect}`}
      onPointerDown={onWrapPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onPointerUp(e)}
      onPointerCancel={(e) => onPointerUp(e)}
      onLostPointerCapture={(e) => {
        // Arraste de nó continua via listeners globais — não abortar ao sair do painel.
        if (dragRef.current?.kind === 'node') {
          return;
        }
        if (dragRef.current) {
          onPointerUp(e);
        }
      }}
      onContextMenu={(e) => handleContextMenu(e)}
    >
      <TopologyToolbar
        tool={tool}
        onToolChange={setTool}
        locked={Boolean(map.locked)}
        networksLocked={networksLocked}
        canUndo={canUndo}
        canRedo={canRedo}
        canCopy={canEditCanvas && (selectedNodeIds.length > 0 || selectedLink !== null)}
        canPaste={canEditCanvas && clipboardReady}
        onUndo={onUndo}
        onRedo={onRedo}
        onCopy={copySelection}
        onPaste={pasteAtViewCenter}
        onToggleLock={() => persist(toggleMapLock(storedMap))}
        onToggleNetworksLock={() => persist(toggleNetworksLock(storedMap))}
        flowPaused={flowPaused}
        onToggleFlow={() => setFlowPaused((p) => !p)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => void toggleFullscreen()}
        showMinimap={showMinimap}
        onToggleMinimap={() => onShowMinimapChange?.(!showMinimap)}
        showLegend={showLegend}
        onToggleLegend={() => onShowLegendChange?.(!showLegend)}
        showEditControls={canPersist}
        searchNodes={map.nodes}
        searchOpen={searchOpen}
        onSearchOpenChange={setSearchOpen}
        onSearchFocusNode={focusNodeOnMap}
      />

      {options.showDashboardNav !== false && (
        <DashboardNavButton
          label={options.dashboardNavLabel?.trim() || 'Dashboards'}
          choices={options.dashboardNavChoices ?? []}
        />
      )}

      {editable && showEmptyHint && (
        <div className={styles.empty} style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
          Clique com o <strong>botão direito</strong> para adicionar dispositivos, redes, submapas, seletores e links. Hosts
          Zabbix vêm da aba <strong>Query</strong>.
        </div>
      )}

      <svg ref={svgRef} className={styles.svg} width="100%" height="100%" onContextMenu={(e) => handleContextMenu(e)}>
        <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
          <LinkMarkers colorLink={options.colorLink} />
          <rect
            x={gridBounds.x0}
            y={gridBounds.y0}
            width={gridBounds.x1 - gridBounds.x0}
            height={gridBounds.y1 - gridBounds.y0}
            fill="transparent"
            style={{ cursor: panTool && options.enablePan ? 'grab' : 'default' }}
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
              const { w, h, label, x, y } = layout;
              const stats = regionStats.get(node.id);
              const fillOverride = regionFillColor(stats, options, 'network', icmpReady);
              const fillRaw =
                fillOverride ??
                (node.fillColor ? node.fillColor : undefined) ??
                options.colorNetworkFill;
              const fill = resolveColor(fillRaw);
              const networkOffline =
                Boolean(icmpReady && stats && !stats.loadFailed && stats.total > 0 && stats.offline > 0);
              const networkAlert =
                Boolean(
                  icmpReady &&
                    stats &&
                    !stats.loadFailed &&
                    stats.total > 0 &&
                    stats.offline === 0 &&
                    stats.alert > 0
                );
              const networkOnline =
                Boolean(
                  icmpReady &&
                    stats &&
                    !stats.loadFailed &&
                    stats.total > 0 &&
                    stats.offline === 0 &&
                    stats.alert === 0 &&
                    stats.online > 0
                );
              const strokeRaw =
                stats && stats.offline > 0
                  ? options.colorOffline
                  : networkAlert
                    ? options.colorAlert
                    : networkOnline
                      ? options.colorOnline
                      : node.borderColor ?? options.colorNetworkBorder;
              const stroke = resolveColor(strokeRaw);
              const strokeOpacity = networkOffline ? 1 : networkAlert ? 0.85 : networkOnline ? 0.35 : 0.85;
              const statsLabel = stats ? formatRegionStats(stats, icmpReady) : undefined;
              const statsPad = 8;
              const statsFontSize = Math.max(9, options.nodeFontSize - 1);
              const statsY = statsLabel ? y + h - statsPad - statsFontSize / 2 : undefined;

              const titleFs = options.nodeFontSize;
              const titlePadX = 8;
              const titlePadY = 4;
              const titleMargin = 8;
              const titleH = Math.ceil(titleFs + titlePadY * 2);
              const titleW = Math.max(48, Math.ceil(measureTextWidth(label, titleFs) + titlePadX * 2));
              const titleX = x + (w - titleW) / 2;
              const titleY = y + titleMargin;
              const titleFill = resolveColor(options.colorStatic);
              const titleText = textOnBackground(titleFill);

              const isSelected = selectedNodeIds.includes(node.id);

              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  className={networkOffline ? styles.offlineBlink : undefined}
                  pointerEvents="auto"
                  onPointerDown={(e) => onNetworkPointerDown(e, node)}
                  onDoubleClick={(e) => onNodeDoubleClick(e, node)}
                  onContextMenu={(e) => handleContextMenu(e, { node })}
                  style={{
                    cursor: panTool
                      ? options.enablePan
                        ? 'grab'
                        : 'default'
                      : editable && !networksLocked
                        ? 'move'
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
                    stroke={isSelected ? '#4FC3F7' : stroke}
                    strokeWidth={isSelected ? 3 : 1.5}
                    strokeOpacity={isSelected ? 1 : strokeOpacity}
                  />
                  <rect
                    x={titleX}
                    y={titleY}
                    width={titleW}
                    height={titleH}
                    rx={4}
                    ry={4}
                    fill={titleFill}
                    stroke={isSelected ? '#4FC3F7' : 'rgba(255,255,255,0.35)'}
                    strokeWidth={isSelected ? 2 : 1}
                    pointerEvents="none"
                  />
                  <text
                    x={titleX + titleW / 2}
                    y={titleY + titleH / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={titleText}
                    fontSize={titleFs}
                    fontFamily="Inter, Helvetica, Arial, sans-serif"
                    pointerEvents="none"
                  >
                    {label}
                  </text>
                  {statsLabel && statsY !== undefined && (
                    <text
                      x={x + 8}
                      y={statsY}
                      textAnchor="start"
                      dominantBaseline="middle"
                      fill={
                        stats!.offline > 0 ? '#ffcdd2' : stats!.alert > 0 ? '#ffcc80' : '#c8e6c9'
                      }
                      fontSize={statsFontSize}
                      fontFamily="Inter, Helvetica, Arial, sans-serif"
                      pointerEvents="none"
                    >
                      {statsLabel}
                    </text>
                  )}
                  {editable && !networksLocked && (
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
              panTool={panTool}
              selected={Boolean(selectedLink && linkKey(selectedLink) === linkKey(link))}
              hovered={hoveredLinkKey === linkKey(link)}
              onSelect={() => onLinkSelect(link)}
              onHoverChange={(active) => setHoveredLinkKey(active ? linkKey(link) : null)}
              onContextMenu={(e) => handleContextMenu(e, { link })}
              onPathPointerDown={(e) => {
                if (panTool || !editable) {
                  // Mão: pan no cabo; seta em visualização: só seleciona.
                  if (panTool && options.enablePan) {
                    beginPan(e, undefined, link);
                  } else {
                    onLinkSelect(link);
                  }
                  return;
                }
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
            const { w, h, label, sub, labelFontSize, subFontSize, labelY, subY, iconCenterY, x, y } = layout;
              const fillOverride =
                node.type === 'submap'
                  ? regionFillColor(regionStats.get(node.id), options, 'submap', icmpReady)
                  : undefined;
              const fillRaw =
                fillOverride ??
                (node.fillColor ? node.fillColor : undefined) ??
                nodeFill(node, options, statusMap, hostMetadata, problemMap, hostDisplay, resolveColor);
              const fill = resolveColor(fillRaw);
            const region = node.type === 'submap' ? regionStats.get(node.id) : undefined;
            const regionLabel = region ? formatRegionStats(region, icmpReady, 'submap') : undefined;
            const labelColor =
              node.type === 'static' && node.labelColor
                ? resolveColor(node.labelColor)
                : textOnBackground(fill);
            const subtitleColor =
              node.type === 'static' && node.labelColor
                ? resolveColor(node.labelColor)
                : region
                  ? region.offline > 0
                    ? isDarkBackground(fill)
                      ? '#ffcdd2'
                      : '#b71c1c'
                    : isDarkBackground(fill)
                      ? '#c8e6c9'
                      : '#1b5e20'
                  : subtextOnBackground(fill);
            const displaySub = regionLabel ?? sub;
            const displaySubY = subY;
            const nodeIsHost = isHostNode(node);
            const hostStatus = nodeIsHost
              ? resolveNodeStatus(
                  node,
                  statusMap,
                  offlineThresholdForMetric(effectiveStatusMetric(options)),
                  effectiveStatusMetric(options),
                  hostMetadata
                )
              : null;
            const submapOffline = Boolean(
              icmpReady && region && !region.loadFailed && region.total > 0 && region.offline > 0
            );
            const isOfflineBlink = hostStatus === 'offline' || submapOffline;
            const hostIcon = nodeIsHost ? node.icon ?? null : null;
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
                onClick={(e) => onNodeClick(e, node)}
                onDoubleClick={(e) => onNodeDoubleClick(e, node)}
                onContextMenu={(e) => handleContextMenu(e, { node })}
                onMouseEnter={(e) => {
                  setLinkHoverId(node.id);
                  if (nodeIsHost && node.zabbixHost?.trim()) {
                    setHostHover({ node, screenX: e.clientX, screenY: e.clientY });
                  }
                }}
                onMouseMove={(e) => {
                  if (nodeIsHost && node.zabbixHost?.trim()) {
                    setHostHover((prev) =>
                      prev?.node.id === node.id
                        ? { node, screenX: e.clientX, screenY: e.clientY }
                        : prev
                    );
                  }
                }}
                onMouseLeave={() => {
                  setLinkHoverId(null);
                  setHostHover((prev) => (prev?.node.id === node.id ? null : prev));
                }}
                style={{
                  cursor: panTool
                    ? options.enablePan
                      ? 'grab'
                      : 'default'
                    : editable
                      ? linkFromId !== null
                        ? 'crosshair'
                        : 'move'
                      : (node.type ?? 'host') === 'host' && hostIp(node)
                        ? 'context-menu'
                        : node.type === 'submap' || node.type === 'dashboard_picker'
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
                {editable &&
                  (node.type === 'static' ||
                    node.type === 'submap' ||
                    node.type === 'dashboard_picker') && (
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
                {node.type === 'dashboard_picker' && (
                  <text
                    x={x + w - 8}
                    y={y + 12}
                    textAnchor="end"
                    fill="rgba(255,255,255,0.7)"
                    fontSize={10}
                    pointerEvents="none"
                  >
                    ▾
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {canPersist && showMinimap && !isFullscreen && viewport.w > 0 && viewport.h > 0 && (
        <TopologyMinimap
          map={map}
          nodes={map.nodes}
          links={validLinks}
          nodeLayouts={nodeLayouts}
          view={view}
          viewport={viewport}
          onViewChange={commitView}
          resolveNodeFill={resolveMiniNodeFill}
          resolveNetworkStroke={resolveMiniNetworkStroke}
          linkColor={miniLinkColor}
        />
      )}

      {showLegend && (
        <TopologyColorLegend
          items={legendItems}
          refreshCountdown={refreshCountdown}
          refreshIntervalSec={refreshIntervalSec}
        />
      )}

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
          queryRefInfos={options.queryRefInfosAvailable ?? []}
          zabbixDatasourceUid={zabbixDatasourceUid}
          zabbixGroupNames={zabbixGroupNames}
          storedMap={storedMap}
          onClose={() => setEditNode(null)}
          onSave={(payload: NodeEditSavePayload) => {
            let next = storedMap;
            if (payload.rebind) {
              next = rebindZabbixHost(
                next,
                editNode.id,
                payload.rebind.visibleName,
                payload.rebind.ip,
                payload.rebind.icon
              );
            }
            const savedNode = next.nodes.find((n) => n.id === editNode.id);
            if (savedNode && Object.keys(payload.patch).length > 0) {
              next = updateStoredNode(next, savedNode, payload.patch);
            }
            persist(next);
          }}
        />
      )}

      {pickerNode && (
        <DashboardPickerModal
          node={pickerNode}
          onClose={() => setPickerNode(null)}
          onSelect={(choice) => {
            setPickerNode(null);
            openDashboardUrl(choice.uid, choice.slug);
          }}
        />
      )}

      {addHostAt && (
        <ZabbixHostPickerModal
          mode="add"
          datasourceUid={zabbixDatasourceUid}
          zabbixGroupNames={zabbixGroupNames}
          storedMap={storedMap}
          onClose={() => setAddHostAt(null)}
          onConfirm={(visibleName, ip, icon) =>
            persist(addZabbixHostAt(storedMap, addHostAt.mapX, addHostAt.mapY, visibleName, ip, icon))
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

      {bulkSubmapEditOpen && bulkSubmapTargets.length >= 1 && (
        <BulkSubmapEditModal
          count={bulkSubmapTargets.length}
          onClose={() => {
            setBulkSubmapEditOpen(false);
            setBulkSubmapTargets([]);
          }}
          onSave={(patch) => {
            persist(updateSubmapsBulk(storedMap, bulkSubmapTargets, patch));
            showToast(`Submapas atualizados (${bulkSubmapTargets.length})`);
            setBulkSubmapTargets([]);
          }}
        />
      )}

      {pingTarget && (
        <PingModal
          label={pingTarget.label}
          ip={pingTarget.ip}
          zabbixHost={pingTarget.zabbixHost}
          datasourceUid={zabbixDatasourceUid}
          onClose={() => setPingTarget(null)}
        />
      )}

      {hostHover && !editNode && !searchOpen ? (
        <HostHoverPopover
          node={hostHover.node}
          screenX={hostHover.screenX}
          screenY={hostHover.screenY}
          queryData={queryData}
          timeRange={timeRange}
          hostMetadata={hostMetadata}
          hostDisplay={hostDisplay}
          problemMap={problemMap}
          options={options}
          icmpReady={icmpReady}
        />
      ) : null}

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
  panTool,
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
  panTool: boolean;
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
  const hitWidth = Math.max(10, linkStrokeWidth(link.bandwidthMbps, options.colorLinkWidth, false, false) + 8);
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
  const downloadColor = options.colorLinkDownload;
  const uploadColor = options.colorLinkUpload;
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
        style={{ cursor: panTool ? 'grab' : 'pointer' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPathPointerDown(e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          // Seleção quando a mão não captura o ponteiro.
          if (!panTool && !editable) {
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
  if (
    prev.selected !== next.selected ||
    prev.hovered !== next.hovered ||
    prev.editable !== next.editable ||
    prev.panTool !== next.panTool
  ) {
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
