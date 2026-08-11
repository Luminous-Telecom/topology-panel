import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { PanelData } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import {
  HostDisplayMap,
  HostMetadataMap,
  TopologyHostIcon,
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
  linkKey,
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
import { clamp, computeNetworkLayout, computeNodeLayout, computeStaticLayout, findNodeById, isHostNode, isSubmapNode, lookupHostDisplay, measureTextWidth, NodeLayout, QueryHostOption, resolveHostIp, resolveHostLayoutKey, resolveLinkMedium, snapToGrid, upsertHostLayout, withLiveZabbixMeta } from '../utils';
import { HOST_TOOLS, resolveToolAuth, runHostTool } from '../utils/hostTools';
import { HOST_ICON_LABELS, HostIconGlyph, hostIconRenderSize } from '../utils/hostIcons';
import { subtextOnBackground, textOnBackground } from '../utils/colorContrast';
import { hostTypeFillColor, resolvePanelColor } from '../utils/panelColors';
import { AlignGuideLine } from '../utils/alignGuides';
import { buildRegionStatsMap, formatRegionStats, regionFillColor, regionHasOfflineHosts, regionStatsTextColor, regionStrokeColor, resolveHostNodeStatus } from '../utils/networkStats';
import { isNetworkNode, computeTopologyContentBounds } from '../utils/mapBounds';
import { useMapContentScroll } from '../hooks/useMapContentScroll';
import { useDeferredDuringGesture } from '../hooks/useDeferredDuringGesture';
import {
  CanvasTool,
  ContextMenuItem,
  TopologyColorLegend,
  TopologyContextMenu,
  TopologyQueryErrorBadge,
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
  computeLinkGeometry,
  linkLabelAnchor,
  LinkPoint,
  nearestWaypointIndex,
} from '../utils/linkGeometry';
import { LINK_FLOW_DASH } from '../utils/linkFlow';
import { hasTopologyClipboard } from '../utils/topologyClipboard';
import { useGridLines } from '../hooks/useGridLines';
import { useLinkFlowAnimation } from '../hooks/useLinkFlowAnimation';
import { useTopologySelection } from '../hooks/useTopologySelection';
import { useBulkEditModals } from '../hooks/useBulkEditModals';
import { nodeSupportsProperties, useNodePropertiesModals } from '../hooks/useNodePropertiesModals';
import { useTopologyClipboardActions } from '../hooks/useTopologyClipboardActions';
import { useTopologyViewport } from '../hooks/useTopologyViewport';
import { useTopologyDragController } from '../hooks/useTopologyDragController';

interface Props {
  map: TopologyMap;
  storedMap: TopologyMap;
  options: TopologyPanelOptions;
  /** Hosts disponíveis nas séries da Query do painel */
  queryHostOptions?: QueryHostOption[];
  /** Cores/status via mapeamento de valor do painel */
  hostDisplay?: HostDisplayMap;
  /** Status por refId da Query — usado pelo submapa para não misturar com o mapa pai */
  hostDisplayByRefId?: Record<string, HostDisplayMap>;
  /** Query carregada ao menos uma vez — evita status falso antes dos dados. */
  queryReady?: boolean;
  /** Query do painel em LoadingState.Error — status ao vivo indisponível (mostra aviso, não mascara). */
  queryError?: boolean;
  hostMetadata?: HostMetadataMap;
  submapHosts?: Record<string, string[] | null | undefined>;
  /**
   * Intervalo de auto-refresh do dashboard em segundos (null = off/manual). O contador
   * "Atualiza em Ns" conta o tempo sozinho dentro de `TopologyColorLegend` — não fica em estado
   * do painel para não forçar um re-render do mapa inteiro a cada segundo.
   */
  refreshIntervalSec?: number | null;
  /** Frames da Query Zabbix (com overrides de cor/threshold) */
  queryData?: PanelData;
  /** UID do datasource Zabbix (aba Query) — usado pelo modal de ping */
  zabbixDatasourceUid?: string;
  onMapChange?: (map: TopologyMap) => void;
  onViewChange?: (view: TopologyView) => void;
  onShowMinimapChange?: (show: boolean) => void;
  onShowLegendChange?: (show: boolean) => void;
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
  scrollPane: css`
    position: absolute;
    inset: 0;
    overflow: auto;
    z-index: 0;
    overscroll-behavior: contain;
    /* Deixa a faixa das barras clicável; o SVG cobre só a client area. */
    &::-webkit-scrollbar {
      width: 22px;
      height: 22px;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.28);
      border-radius: 10px;
    }
    &::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.42);
    }
    &::-webkit-scrollbar-corner {
      background: transparent;
    }
  `,
  scrollSizer: css`
    pointer-events: none;
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
    position: absolute;
    left: 0;
    top: 0;
    z-index: 1;
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
};

type ContextState = {
  screenX: number;
  screenY: number;
  mapX: number;
  mapY: number;
  node?: TopologyNode;
  link?: TopologyLink;
};

function deleteNodesMenuLabel(count: number): string {
  return count > 1 ? `Excluir seleção (${count})` : 'Excluir seleção';
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
  hostMetadata?: HostMetadataMap,
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
  if (!node.zabbixHost?.trim()) {
    return options.colorUnknown;
  }
  const lookupRef = {
    zabbixHost: node.zabbixHost,
    subtitle: node.subtitle,
    label: node.label,
  };
  const mapped = lookupHostDisplay(hostDisplay, lookupRef, hostMetadata);
  if (!mapped?.color) {
    return options.colorUnknown;
  }
  const typeFill = hostTypeFillColor(node.icon, options.hostTypeColors);
  if (mapped.status === 'online' && typeFill) {
    return typeFill;
  }
  const color = resolveMappedColor?.(mapped.color);
  if (!color) {
    return options.colorUnknown;
  }
  return color;
}

export function TopologyCanvas({
  map: liveMap,
  storedMap,
  options,
  queryHostOptions = [],
  hostDisplay: liveHostDisplay,
  hostDisplayByRefId: liveHostDisplayByRefId = {},
  queryReady: liveQueryReady = false,
  queryError: liveQueryError = false,
  hostMetadata: liveHostMetadata,
  submapHosts: liveSubmapHosts = {},
  refreshIntervalSec = null,
  queryData: liveQueryData,
  zabbixDatasourceUid,
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
  /** True do pointerdown ao pointerup/cancel (pan, nó, resize, marquee, scrollbar) — usado só
   * para congelar `liveDataSnapshot` abaixo; não é a máquina de estado do drag em si. */
  const isGestureActiveRef = useRef(false);
  const liveDataSnapshot = useMemo(
    () => ({
      map: liveMap,
      hostDisplay: liveHostDisplay,
      hostDisplayByRefId: liveHostDisplayByRefId,
      queryReady: liveQueryReady,
      queryError: liveQueryError,
      hostMetadata: liveHostMetadata,
      submapHosts: liveSubmapHosts,
      queryData: liveQueryData,
    }),
    [
      liveMap,
      liveHostDisplay,
      liveHostDisplayByRefId,
      liveQueryReady,
      liveQueryError,
      liveHostMetadata,
      liveSubmapHosts,
      liveQueryData,
    ]
  );
  const [frozenData, flushFrozenData] = useDeferredDuringGesture(liveDataSnapshot, isGestureActiveRef);
  const {
    map,
    hostDisplay,
    hostDisplayByRefId,
    queryReady,
    queryError,
    hostMetadata,
    submapHosts,
    queryData,
  } = frozenData;
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const bindScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollElement(node);
  }, []);
  const svgRef = useRef<SVGSVGElement>(null);
  const { flowPaused, setFlowPaused } = useLinkFlowAnimation(wrapRef);
  const savedView = options.view;
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

  useEffect(() => {
    setTool(canEditCanvas ? 'select' : 'pan');
  }, [canEditCanvas]);

  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((message: string | undefined) => {
    if (!message) {
      return;
    }
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  /** Encaminha o cancelamento de drag para o pinch de 2 dedos — `useTopologyDragController` só
   * fica disponível depois de `nodeLayouts`, então o pinch (que precisa existir antes) chama
   * sempre a versão mais recente via ref, no mesmo padrão de `startEdgePanLoopRef`. */
  const cancelActiveDragRef = useRef<() => void>(() => {});
  const onPinchStart = useCallback(() => cancelActiveDragRef.current(), []);
  const onFullscreenChange = useCallback(
    (fs: boolean) => {
      if (fs) {
        setSearchOpen(false);
      }
    },
    []
  );
  const {
    view,
    viewRef,
    commitView,
    viewport,
    viewportRef,
    isFullscreen,
    toggleFullscreen,
    pinchActiveRef,
  } = useTopologyViewport({
    wrapRef,
    sizeElement: scrollElement,
    mapWidth: map.width,
    mapHeight: map.height,
    savedView,
    onViewChange,
    enableZoom: Boolean(options.enableZoom),
    mapNodesLength: map.nodes.length,
    onPinchStart,
    onFullscreenChange,
    showToast,
  });
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const {
    selectedNodeIds,
    setSelectedNodeIds,
    selectedLink,
    setSelectedLink,
    selectedHostNodes,
    selectedSubmapNodes,
    selectedNodes,
  } = useTopologySelection(map.nodes);
  const [marqueeRect, setMarqueeRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const {
    editNode,
    setEditNode,
    pickerNode,
    setPickerNode,
    editLink,
    setEditLink,
    addHostAt,
    setAddHostAt,
    openNodeProperties,
    openDashboardPicker,
    tryDoubleTapOpenProperties,
    resetDoubleTapState,
  } = useNodePropertiesModals({ storedMap, editable, linkFromId });
  const [linkHoverId, setLinkHoverId] = useState<string | null>(null);
  const [hostHover, setHostHover] = useState<{
    node: TopologyNode;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [hoveredLinkKey, setHoveredLinkKey] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    nodeId?: string;
    positions?: Record<string, { x: number; y: number }>;
    width?: number;
    height?: number;
    linkWaypoints?: { from: string; to: string; waypoints: LinkPoint[] };
  } | null>(null);
  const [alignGuides, setAlignGuides] = useState<AlignGuideLine[]>([]);
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
      hostDisplay ?? {},
      submapHosts,
      hostMetadata,
      hostDisplayByRefId
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
      const withStats = { ...positioned, subtitle: formatRegionStats(region, queryReady, 'submap') };
      const layout = computeNodeLayout(withStats, layoutOpts);
      layouts.set(node.id, { ...positioned, ...layout, subtitle: withStats.subtitle });
    }

    return { nodeLayouts: layouts, regionStats: stats };
  }, [map.nodes, layoutOpts, dragPreview, hostDisplay, hostDisplayByRefId, options, submapHosts, hostMetadata, queryReady]);

  const contentBounds = useMemo(
    () => computeTopologyContentBounds(map, nodeLayouts),
    [map, nodeLayouts]
  );

  const suspendScrollSyncRef = useRef(false);
  const { contentWidth, contentHeight, onScroll, syncScrollFromView } = useMapContentScroll({
    scrollRef,
    bounds: contentBounds,
    view,
    viewRef,
    commitView,
    viewport,
    suspendSyncRef: suspendScrollSyncRef,
  });

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

  const { clipboardReady, copySelection, pasteAt, pasteAtViewCenter } = useTopologyClipboardActions({
    map,
    storedMap,
    selectedNodeIds,
    selectedLink,
    showToast,
    persist,
    snapCoord,
    setSelectedNodeIds,
    setSelectedLink,
    closeContextMenu,
    wrapRef,
    view,
  });

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

  const focusNodeOnMap = useCallback(
    (nodeId: string) => {
      const layout = nodeLayouts.get(nodeId);
      if (!layout) {
        return;
      }
      const cx = layout.x + layout.w / 2;
      const cy = layout.y + layout.h / 2;
      const scale = clamp(Math.max(viewRef.current.scale, 0.55), 0.15, 3);
      const vw = viewportRef.current.w;
      const vh = viewportRef.current.h;
      if (vw <= 0 || vh <= 0) {
        return;
      }
      commitView({
        scale,
        x: vw / 2 - cx * scale,
        y: vh / 2 - cy * scale,
      });
      setSelectedNodeIds([nodeId]);
      setSelectedLink(null);
      setLinkFromId(null);
      setContextMenu(null);
      setMarqueeRect(null);
      setAlignGuides([]);
    },
    [commitView, nodeLayouts, viewRef, viewportRef]
  );

  const openSubmap = useCallback((node: TopologyNode) => {
    if (node.type !== 'submap' || !node.submapUid) {
      return;
    }
    openDashboardUrl(node.submapUid, node.submapSlug);
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

  const onLinkSelect = useCallback((link: TopologyLink) => {
    setSelectedNodeIds([]);
    setSelectedLink((prev) => (prev && linkKey(prev) === linkKey(link) ? null : link));
  }, []);

  const {
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
  } = useTopologyDragController({
    wrapRef,
    svgRef,
    map,
    storedMap,
    nodeLayouts,
    editable,
    enablePan: Boolean(options.enablePan),
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
  });

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) {
        suspendScrollSyncRef.current = true;
      }
      onPointerMove(e);
    },
    [dragRef, onPointerMove]
  );

  /**
   * Clique na faixa da barra de rolagem nativa não pode borbulhar pra fora do painel: em modo de
   * edição do dashboard, o Grafana tem seu próprio listener (fora do nosso controle, na
   * PanelChrome) que abre o painel lateral de opções ao detectar clique no painel. `pointerdown`,
   * `mousedown` e `click` são eventos nativos independentes (parar um não para os outros), então
   * paramos os três explicitamente — só quando o alvo é o `scrollPane` em si (nunca um nó/link).
   */
  const stopScrollbarBubble = useCallback(
    (e: React.SyntheticEvent) => {
      if (e.target === scrollRef.current) {
        e.stopPropagation();
      }
    },
    [scrollRef]
  );

  /** Limpeza comum de fim de gesto (pointerup normal ou cancelamento por pinch): libera o sync
   * de scroll, descongela `liveDataSnapshot` e realinha a scrollbar à view final. */
  const finishGesture = useCallback(() => {
    suspendScrollSyncRef.current = false;
    isGestureActiveRef.current = false;
    flushFrozenData();
    syncScrollFromView();
  }, [syncScrollFromView, flushFrozenData]);

  const endPointerGesture = useCallback(
    (e: React.PointerEvent) => {
      onPointerUp(e);
      finishGesture();
    },
    [onPointerUp, finishGesture]
  );

  cancelActiveDragRef.current = () => {
    cancelActiveDrag();
    finishGesture();
  };

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
          resetDoubleTapState();
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
    [editable, openDashboardPicker, openNodeProperties, openSubmap, resetDoubleTapState]
  );

  const buildToolsMenu = useCallback(
    (node: TopologyNode): ContextMenuItem | null => {
      const ip = resolveHostIp(node, hostMetadata);
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
    [hostMetadata, options, showToast]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, target?: { node?: TopologyNode; link?: TopologyLink }) => {
      e.preventDefault();
      e.stopPropagation();

      const rawNode = target?.node;
      const node =
        rawNode?.type === 'network' && areNetworksLocked(storedMap) ? undefined : rawNode;
      const isCanvas = !node && !target?.link;
      const isHost = Boolean(node && isHostNode(node));
      const hasTools = Boolean(node && isHost && resolveHostIp(node, hostMetadata));

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

  const {
    bulkIconEditOpen,
    setBulkIconEditOpen,
    bulkIconTargets,
    setBulkIconTargets,
    bulkCredsEditOpen,
    setBulkCredsEditOpen,
    bulkCredsTargets,
    setBulkCredsTargets,
    bulkSubmapEditOpen,
    setBulkSubmapEditOpen,
    bulkSubmapTargets,
    setBulkSubmapTargets,
    openBulkIconEdit,
    openBulkCredsEdit,
    openBulkSubmapEdit,
  } = useBulkEditModals({ selectedHostNodes, selectedSubmapNodes, showToast, closeContextMenu });

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
        isHostNode(node) ||
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

  const { gridBounds, gridVerticalLines, gridHorizontalLines, isMajorGridLine } = useGridLines({
    gridStep,
    mapWidth: map.width,
    mapHeight: map.height,
    view,
    viewport,
  });

  const legendItems = useMemo(() => {
    if (options.showLegend === false) {
      return [];
    }
    const items: Array<{ label: string; color: string }> = [];
    if (options.legendUnknown !== false) {
      items.push({ label: 'Sem query', color: options.colorUnknown });
    }
    if (options.legendOnline !== false) {
      items.push({ label: 'Online', color: options.colorOnline });
    }
    if (options.legendOffline !== false) {
      items.push({ label: 'Offline', color: options.colorOffline });
    }
    if (options.legendAlert !== false) {
      items.push({ label: 'Alerta', color: options.colorAlert });
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
    if (options.legendHostTypes) {
      for (const [icon, color] of Object.entries(options.hostTypeColors ?? {})) {
        const trimmed = color?.trim();
        if (!trimmed) {
          continue;
        }
        items.push({ label: HOST_ICON_LABELS[icon as TopologyHostIcon], color: trimmed });
      }
    }
    return items;
  }, [
    options.showLegend,
    options.legendUnknown,
    options.legendOnline,
    options.legendOffline,
    options.legendAlert,
    options.legendStatic,
    options.legendSubmap,
    options.legendLink,
    options.legendDownload,
    options.legendUpload,
    options.legendHostTypes,
    options.colorUnknown,
    options.colorOnline,
    options.colorOffline,
    options.colorAlert,
    options.colorStatic,
    options.colorSubmap,
    options.colorLink,
    options.colorLinkDownload,
    options.colorLinkUpload,
    options.hostTypeColors,
  ]);

  const resolveMiniNodeFill = useCallback(
    (node: TopologyNode): string => {
      if (isNetworkNode(node)) {
        const stats = regionStats.get(node.id);
        const fillOverride = regionFillColor(stats, options, 'network', queryReady);
        const fillRaw = fillOverride ?? node.fillColor ?? options.colorNetworkFill;
        return resolveColor(fillRaw);
      }
      const fillOverride =
        node.type === 'submap'
          ? regionFillColor(regionStats.get(node.id), options, 'submap', queryReady)
          : undefined;
      const fillRaw =
        fillOverride ??
        (node.fillColor ? node.fillColor : undefined) ??
        nodeFill(node, options, hostMetadata, hostDisplay, resolveColor);
      return resolveColor(fillRaw);
    },
    [regionStats, options, queryReady, hostMetadata, hostDisplay, resolveColor]
  );

  const resolveMiniNetworkStroke = useCallback(
    (node: TopologyNode): string => {
      const stats = regionStats.get(node.id);
      const strokeRaw = regionStrokeColor(stats, options, queryReady, node.borderColor);
      return resolveColor(strokeRaw);
    },
    [regionStats, options, queryReady, resolveColor]
  );

  const miniLinkColor = resolveColor(options.colorLink);

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${panTool ? styles.wrapPan : styles.wrapSelect}`}
      onPointerDownCapture={(e) => {
        // Fase de captura — dispara mesmo quando um filho (nó, link, scrollbar) chama
        // stopPropagation() no pointerdown. Congela `liveDataSnapshot` (useDeferredDuringGesture)
        // até o pointerup/cancel, para um auto-refresh do dashboard não trocar cores/hosts/
        // posições no meio do arraste.
        isGestureActiveRef.current = true;
        // Clique na faixa da barra de rolagem nativa (o `svg` cobre só a client area; o alvo aqui
        // só é o próprio `scrollPane` quando o clique cai fora dele, na faixa da scrollbar). A
        // `scrollLeft/scrollTop` já é a fonte de verdade durante esse arraste — suspende só o
        // "sync view -> scrollLeft" (efeito passivo em `useMapContentScroll`) pra não competir com
        // o drag nativo e causar o "pulo".
        if (e.target === scrollRef.current) {
          suspendScrollSyncRef.current = true;
        }
        stopScrollbarBubble(e);
      }}
      onMouseDownCapture={stopScrollbarBubble}
      onClickCapture={stopScrollbarBubble}
      onPointerDown={onWrapPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointerGesture}
      onPointerCancel={endPointerGesture}
      onLostPointerCapture={(e) => {
        // Arraste de nó continua via listeners globais — não abortar ao sair do painel.
        if (dragRef.current?.kind === 'node') {
          return;
        }
        if (dragRef.current) {
          endPointerGesture(e);
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

      <TopologyQueryErrorBadge visible={queryError} />

      {editable && showEmptyHint && (
        <div className={styles.empty} style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
          Clique com o <strong>botão direito</strong> para adicionar dispositivos, redes, submapas, seletores e links. Hosts
          Zabbix vêm da aba <strong>Query</strong>.
        </div>
      )}

      <div ref={bindScrollRef} className={styles.scrollPane} onScroll={onScroll}>
        <div
          className={styles.scrollSizer}
          style={{
            width: Math.max(contentWidth, 1),
            height: Math.max(contentHeight, 1),
          }}
          aria-hidden
        />
      </div>

      <svg
        ref={svgRef}
        className={styles.svg}
        width={viewport.w > 0 ? viewport.w : '100%'}
        height={viewport.h > 0 ? viewport.h : '100%'}
        onContextMenu={(e) => handleContextMenu(e)}
      >
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
              const fillOverride = regionFillColor(stats, options, 'network', queryReady);
              const fillRaw =
                fillOverride ??
                (node.fillColor ? node.fillColor : undefined) ??
                options.colorNetworkFill;
              const fill = resolveColor(fillRaw);
              const networkOffline = regionHasOfflineHosts(stats, queryReady);
              const stroke = resolveColor(
                regionStrokeColor(stats, options, queryReady, node.borderColor)
              );
              const statsLabel = stats ? formatRegionStats(stats, queryReady) : undefined;
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
                    strokeOpacity={isSelected ? 1 : 0.85}
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
                      fill={regionStatsTextColor(stats)}
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
                  ? regionFillColor(regionStats.get(node.id), options, 'submap', queryReady)
                  : undefined;
              const fillRaw =
                fillOverride ??
                (node.fillColor ? node.fillColor : undefined) ??
                nodeFill(node, options, hostMetadata, hostDisplay, resolveColor);
              const fill = resolveColor(fillRaw);
            const region = node.type === 'submap' ? regionStats.get(node.id) : undefined;
            const regionLabel = region ? formatRegionStats(region, queryReady, 'submap') : undefined;
            const labelColor =
              node.type === 'static' && node.labelColor
                ? resolveColor(node.labelColor)
                : textOnBackground(fill);
            const subtitleColor =
              node.type === 'static' && node.labelColor
                ? resolveColor(node.labelColor)
                : region
                  ? region.offline > 0
                    ? '#ffcdd2'
                    : region.alert > 0
                      ? '#ffcc80'
                      : '#c8e6c9'
                  : subtextOnBackground(fill);
            const displaySub = regionLabel ?? sub;
            const statsSubFontSize = Math.max(9, subFontSize);
            const displaySubY =
              subY ??
              (displaySub
                ? labelY !== undefined && labelY < h * 0.45
                  ? h - 8 - statsSubFontSize / 2
                  : labelY !== undefined
                    ? labelY + labelFontSize / 2 + 4 + statsSubFontSize / 2
                    : h - 8 - statsSubFontSize / 2
                : undefined);
            const nodeIsHost = isHostNode(node);
            const hostStatus = nodeIsHost
              ? resolveHostNodeStatus(node, hostDisplay, hostMetadata)
              : undefined;
            const submapOffline = regionHasOfflineHosts(region, queryReady);
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
                      : isHostNode(node) && resolveHostIp(node, hostMetadata)
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
          refreshIntervalSec={refreshIntervalSec}
          refreshResetKey={queryData}
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
          queryHostOptions={queryHostOptions}
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
                payload.rebind.icon,
                editNode
              );
            }

            const findSavedNode = () =>
              findNodeById(next.nodes, editNode.id) ??
              (editNode.zabbixHost?.trim()
                ? next.nodes.find(
                    (n) => isHostNode(n) && n.zabbixHost?.trim() === editNode.zabbixHost?.trim()
                  )
                : undefined) ??
              (payload.rebind?.ip
                ? next.nodes.find(
                    (n) =>
                      isHostNode(n) &&
                      (n.subtitle?.trim() === payload.rebind?.ip ||
                        n.zabbixHost?.trim() === payload.rebind?.ip)
                  )
                : undefined);

            let savedNode = findSavedNode();

            if (!savedNode && !payload.rebind && Object.keys(payload.patch).length > 0) {
              const key = resolveHostLayoutKey(editNode);
              if (key) {
                next = upsertHostLayout(next, key, {
                  id: editNode.id,
                  x: editNode.x,
                  y: editNode.y,
                  width: editNode.width,
                  height: editNode.height,
                  label: editNode.label,
                  subtitle: editNode.subtitle ?? key,
                  type: 'host',
                  ...payload.patch,
                });
                savedNode = findSavedNode();
              }
            }

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
          queryHostOptions={queryHostOptions}
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
          hostMetadata={hostMetadata}
          hostDisplay={hostDisplay}
          options={options}
          queryReady={queryReady}
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
