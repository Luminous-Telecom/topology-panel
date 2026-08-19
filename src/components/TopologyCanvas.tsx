import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanelData } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { CanvasTool, HostDisplayMap, HostMetadataMap, LinkRuntimeMetricsMap, TopologyBlueprint, TopologyInterfaceReference, TopologyLink, TopologyMap, TopologyNode, TopologyPanelOptions, TopologyView } from '../types';
import { HostProblemsMap, TopologyMapFilterId } from '../utils/noc/types';
import { collectAlertHostEntries, isLinkVisibleForFilters, TopologyFilterContext } from '../utils/noc/topologyFilters';
import { TopologyFilterBar } from './canvas/TopologyFilterBar';
import { TopologyHostAlertList } from './canvas/TopologyHostAlertList';
import { areNetworksLocked, removeNodesFromMap, toggleMapLock, toggleNetworksLock } from '../utils/mapEdits';
import { addLinkToMap, addLinkWithInterfaces, linkKey, removeLinkByEndpoints } from '../utils/mapLinkEdits';
import { clamp, snapToGrid } from '../utils/mapCoords';
import { QueryHostOption } from '../utils/queryHostPicker';
import { isHostNode, findNodeById, submapHasChildMapId } from '../utils/topologyNodes';
import { TopologyBreadcrumbItem } from '../utils/topologyMapNavigation';
import { resolvePanelColor } from '../utils/panelColors';
import { buildLegendItems } from '../utils/legendItems';
import { AlignGuideLine } from '../utils/alignGuides';
import {
  computeFitToContentBoundsTransform,
  computeTopologyContentBounds,
  computeTopologyFitBounds,
} from '../utils/mapBounds';
import { useMapContentScroll } from '../hooks/useMapContentScroll';
import { canvasStyles } from './canvas/canvasStyles';
import { CanvasControlsOverlay } from './canvas/CanvasControlsOverlay';
import { CanvasGridLayer } from './canvas/CanvasGridLayer';
import { CanvasHudOverlay } from './canvas/CanvasHudOverlay';
import { CanvasModals } from './canvas/CanvasModals';
import { CanvasSelectionShapes } from './canvas/CanvasSelectionShapes';
import { LinksLayer } from './canvas/LinksLayer';
import { HostNodesLayer, NetworkNodesLayer } from './canvas/NodeLayers';
import { LinkMarkers } from './canvas/LinkMarkers';
import { TopologyToast } from './canvas/TopologyToast';
import { LinkDetailsDrawer, resolveLinkDetailsMetrics } from './LinkDetailsDrawer';
import { discoverTopologyNeighbors } from '../utils/topologyDiscovery/discoverTopologyNeighbors';
import {
  confirmAllSuggestedLinks,
  confirmSuggestedLink,
  ignoreSuggestedLink,
  mergeSuggestedLinks,
} from '../utils/mapSuggestedLinkEdits';
import { SuggestedLinksReviewModal, NeighborDiscoveryReport } from './SuggestedLinksReviewModal';
import { TopologyBlueprintModal } from './lazyModals';
import { applyTopologyBlueprint } from '../utils/mapTemplateEdits';
import { SuggestedLinkLine } from './canvas/SuggestedLinkLine';
import { openDashboardUrl } from './DashboardPickerModal';
import { LinkPoint } from '../utils/linkGeometry';
import { useGridLines } from '../hooks/useGridLines';
import { useLinkFlowAnimation } from '../hooks/useLinkFlowAnimation';
import { useTopologySelection } from '../hooks/useTopologySelection';
import { useBulkEditModals } from '../hooks/useBulkEditModals';
import { nodeSupportsProperties, NODE_DOUBLE_TAP_MS, useNodePropertiesModals } from '../hooks/useNodePropertiesModals';
import { useTopologyClipboardActions } from '../hooks/useTopologyClipboardActions';
import { useTopologyViewport } from '../hooks/useTopologyViewport';
import { useTopologyDragController } from '../hooks/useTopologyDragController';
import { useHostHoverTarget } from '../hooks/useHostHoverTarget';
import { useCanvasContextMenu } from '../hooks/useCanvasContextMenu';
import { useCanvasToast } from '../hooks/useCanvasToast';
import { useFrozenCanvasData } from '../hooks/useFrozenCanvasData';
import { useCanvasKeyboardShortcuts } from '../hooks/useCanvasKeyboardShortcuts';
import { useMinimapColors } from '../hooks/useMinimapColors';
import { useNodeLayouts } from '../hooks/useNodeLayouts';
import { useRenderLinks } from '../hooks/useRenderLinks';
import { useTopologyMenuItems } from '../hooks/useTopologyMenuItems';

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
  /** Métricas voláteis de links (RX/TX/utilização) */
  linkMetricsByLink?: LinkRuntimeMetricsMap;
  /** Problemas Zabbix para badges NOC */
  hostProblems?: HostProblemsMap;
  onNocModeChange?: (enabled: boolean) => void;
  /** Buscando IP da interface principal no Zabbix (fallback quando a Query não traz IP). */
  zabbixMetadataLoading?: boolean;
  onMapChange?: (map: TopologyMap) => void;
  onViewChange?: (view: TopologyView) => void;
  onShowMinimapChange?: (show: boolean) => void;
  onShowLegendChange?: (show: boolean) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Esconde toolbar/nav do mapa (lista de reprodução / kiosk). */
  hideOverlayControls?: boolean;
  /** View salva do mapa ativo (raiz ou filho na navegação hierárquica). */
  savedView?: TopologyView;
  /** Chave do mapa ativo — reinicia pan/zoom ao trocar. */
  mapNavigationKey?: string;
  mapNavigationBreadcrumb?: TopologyBreadcrumbItem[];
  canMapNavigateBack?: boolean;
  canMapNavigateForward?: boolean;
  onMapNavigateBack?: (currentView: TopologyView) => void;
  onMapNavigateForward?: (currentView: TopologyView) => void;
  onMapNavigateBreadcrumb?: (index: number, currentView: TopologyView) => void;
  onNavigateToChildMap?: (childMapId: string, label: string, currentView: TopologyView) => void;
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
  linkMetricsByLink = {},
  hostProblems,
  onNocModeChange,
  zabbixMetadataLoading = false,
  onMapChange,
  onViewChange,
  onShowMinimapChange,
  onShowLegendChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  hideOverlayControls = false,
  savedView: savedViewProp,
  mapNavigationKey = 'root',
  mapNavigationBreadcrumb = [] as TopologyBreadcrumbItem[],
  canMapNavigateBack = false,
  canMapNavigateForward = false,
  onMapNavigateBack,
  onMapNavigateForward,
  onMapNavigateBreadcrumb,
  onNavigateToChildMap,
}: Props) {
  const theme = useTheme2();
  const resolveColor = useCallback((color?: unknown) => resolvePanelColor(theme, color), [theme]);
  /** True do pointerdown ao pointerup/cancel (pan, nó, resize, marquee, scrollbar) — usado só
   * para congelar `liveDataSnapshot` abaixo; não é a máquina de estado do drag em si. */
  const isGestureActiveRef = useRef(false);
  const [frozenData, flushFrozenData] = useFrozenCanvasData(
    {
      map: liveMap,
      hostDisplay: liveHostDisplay,
      hostDisplayByRefId: liveHostDisplayByRefId,
      queryReady: liveQueryReady,
      queryError: liveQueryError,
      hostMetadata: liveHostMetadata,
      submapHosts: liveSubmapHosts,
      queryData: liveQueryData,
    },
    isGestureActiveRef
  );
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
  const savedView = savedViewProp ?? options.view;
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

  const { toast, showToast } = useCanvasToast();

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
  const {
    selectedNodeIds,
    setSelectedNodeIds,
    selectedLink,
    setSelectedLink,
    selectedHostNodes,
    selectedSubmapNodes,
    selectedNodes,
  } = useTopologySelection(map.nodes);
  const { contextMenu, closeContextMenu, handleContextMenu, handleNodeContextMenu } =
    useCanvasContextMenu({
      wrapRef,
      map,
      storedMap,
      view,
      canEditCanvas,
      canPersist,
      hostMetadata,
      selectedNodeIds,
      setSelectedNodeIds,
      showToast,
    });
  const [marqueeRect, setMarqueeRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<{
    from: string;
    to: string;
    fromNode: TopologyNode;
    toNode: TopologyNode;
  } | null>(null);
  const [detailsLink, setDetailsLink] = useState<TopologyLink | null>(null);
  const [suggestedReviewOpen, setSuggestedReviewOpen] = useState(false);
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<TopologyMapFilterId>>(() => new Set());
  /** Sobrescreve `options.nocMode` na sessão quando o dashboard não está em modo edição. */
  const [nocModeLocalOverride, setNocModeLocalOverride] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    setNocModeLocalOverride(undefined);
  }, [options.nocMode]);
  const effectiveNocMode =
    Boolean(hideOverlayControls) || (nocModeLocalOverride ?? Boolean(options.nocMode));
  const handleToggleNocMode = useCallback(() => {
    const current = nocModeLocalOverride ?? Boolean(options.nocMode);
    const next = !current;
    setNocModeLocalOverride(next);
    onNocModeChange?.(next);
  }, [nocModeLocalOverride, onNocModeChange, options.nocMode]);
  const viewEditable = editable && !effectiveNocMode;
  const [discoveringNeighbors, setDiscoveringNeighbors] = useState(false);
  const [neighborReport, setNeighborReport] = useState<NeighborDiscoveryReport | undefined>();
  const [neighborError, setNeighborError] = useState<string | undefined>();
  const modals = useNodePropertiesModals({ storedMap, editable, linkFromId });
  const {
    editNode,
    openNodeProperties,
    openDashboardPicker,
    tryDoubleTapOpenProperties,
    resetDoubleTapState,
    setAddHostAt,
    setEditLink,
  } = modals;
  const [linkHoverId, setLinkHoverId] = useState<string | null>(null);
  const { hostHover, beginHostHover, moveHostHover, endHostHover, clearHostHover } = useHostHoverTarget();
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
    () => ({
      nodeFontSize: Math.round(options.nodeFontSize * (effectiveNocMode ? 1.2 : 1)),
      showSubtitle: options.showSubtitle,
    }),
    [options.nodeFontSize, options.showSubtitle, effectiveNocMode]
  );

  const filterContext = useMemo<TopologyFilterContext>(
    () => ({
      map,
      hostDisplay,
      hostMetadata,
      hostProblems,
      linkMetricsByLink,
      options,
    }),
    [map, hostDisplay, hostMetadata, hostProblems, linkMetricsByLink, options]
  );

  const alertHostEntries = useMemo(() => collectAlertHostEntries(filterContext), [filterContext]);
  const minimapVisible = canPersist && showMinimap && !isFullscreen && viewport.w > 0 && viewport.h > 0;

  const toggleFilter = useCallback((filter: TopologyMapFilterId) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }, []);

  const gridStep = options.gridSize ?? 10;
  const snapCoord = useCallback(
    (n: number) => (options.snapToGrid !== false ? snapToGrid(n, gridStep) : Math.round(n)),
    [gridStep, options.snapToGrid]
  );

  const { nodeLayouts, regionStats } = useNodeLayouts({
    map,
    layoutOpts,
    templateOpts: options,
    dragPreview,
    hostDisplay,
    hostDisplayByRefId,
    hostMetadata,
    submapHosts,
    queryReady,
  });

  const contentBounds = useMemo(
    () => computeTopologyContentBounds(map, nodeLayouts),
    [map, nodeLayouts]
  );

  const fitBounds = useMemo(
    () => computeTopologyFitBounds(map, nodeLayouts),
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

  // Encaixa a topologia ao abrir/trocar mapa (antes do paint).
  useLayoutEffect(() => {
    const el = scrollRef.current ?? wrapRef.current;
    if (!el) {
      return;
    }
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w <= 0 || h <= 0) {
      return;
    }
    if (map.nodes.length > 0 && nodeLayouts.size === 0) {
      return;
    }

    const transform = computeFitToContentBoundsTransform(fitBounds, w, h);
    if (!transform) {
      return;
    }

    commitView(transform);
    syncScrollFromView();
  }, [
    commitView,
    fitBounds,
    isFullscreen,
    map.nodes.length,
    mapNavigationKey,
    nodeLayouts.size,
    scrollElement,
    syncScrollFromView,
  ]);

  const { validLinks, renderLinks } = useRenderLinks(map.links, nodeLayouts, selectedLink);
  const filteredRenderLinks = useMemo(() => {
    if (!activeFilters.size) {
      return renderLinks;
    }
    return renderLinks.filter(({ link }) => isLinkVisibleForFilters(link, activeFilters, filterContext));
  }, [renderLinks, activeFilters, filterContext]);

  const persist = useCallback(
    (next: TopologyMap) => {
      onMapChange?.(next);
    },
    [onMapChange]
  );

  const handleBlueprintApply = useCallback(
    (blueprint: TopologyBlueprint) => {
      const { map: next, addedNodes, addedLinks } = applyTopologyBlueprint(storedMap, blueprint);
      persist(next);
      setBlueprintOpen(false);
      showToast(`Modelo inserido: ${addedNodes} nó(s), ${addedLinks} link(s).`);
    },
    [persist, showToast, storedMap]
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
      closeContextMenu();
      setMarqueeRect(null);
      setAlignGuides([]);
    },
    [commitView, nodeLayouts, viewRef, viewportRef]
  );

  const openSubmap = useCallback(
    (node: TopologyNode) => {
      if (node.type !== 'submap') {
        return;
      }
      const childMapId = node.submapChildMapId?.trim();
      if (childMapId) {
        const childMap = options.childMaps?.[childMapId];
        if (childMap && onNavigateToChildMap) {
          onNavigateToChildMap(
            childMapId,
            node.label?.trim() || childMapId,
            viewRef.current
          );
          return;
        }
        showToast('Mapa interno não encontrado');
        return;
      }
      const uid = node.submapUid?.trim();
      if (uid) {
        openDashboardUrl(uid, node.submapSlug);
        return;
      }
      showToast('Submapa sem destino configurado');
    },
    [onNavigateToChildMap, options.childMaps, showToast]
  );

  const lastChildMapTapRef = useRef<{ nodeId: string; time: number } | null>(null);

  const tryDoubleTapEnterChildMap = useCallback(
    (tapNode: TopologyNode): boolean => {
      if (!editable || !submapHasChildMapId(tapNode)) {
        return false;
      }
      const now = Date.now();
      const last = lastChildMapTapRef.current;
      if (last && last.nodeId === tapNode.id && now - last.time <= NODE_DOUBLE_TAP_MS) {
        lastChildMapTapRef.current = null;
        openSubmap(tapNode);
        return true;
      }
      lastChildMapTapRef.current = { nodeId: tapNode.id, time: now };
      return false;
    },
    [editable, openSubmap]
  );

  /** Entra no modo link sem origem: o próximo clique num nó define o ponto de partida. */
  const beginLinkFromCanvas = useCallback(() => setLinkFromId(''), []);

  const beginLinkFrom = useCallback((nodeId: string) => {
    setLinkFromId(nodeId);
    closeContextMenu();
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
      const fromNode = findNodeById(storedMap.nodes, linkFromId);
      const toNode = findNodeById(storedMap.nodes, targetId);
      if (fromNode && toNode && isHostNode(fromNode) && isHostNode(toNode) && zabbixDatasourceUid) {
        setPendingLink({ from: linkFromId, to: targetId, fromNode, toNode });
        setLinkFromId(null);
        return;
      }
      persist(addLinkToMap(storedMap, linkFromId, targetId));
      setLinkFromId(null);
    },
    [linkFromId, persist, storedMap, zabbixDatasourceUid]
  );

  const handlePendingLinkSave = useCallback(
    (
      fromInterface: TopologyInterfaceReference | undefined,
      toInterface: TopologyInterfaceReference | undefined,
      bandwidthMbps?: number
    ) => {
      if (!pendingLink) {
        return;
      }
      persist(
        addLinkWithInterfaces(storedMap, pendingLink.from, pendingLink.to, {
          fromInterface,
          toInterface,
          bandwidthMbps,
        })
      );
      setPendingLink(null);
    },
    [pendingLink, persist, storedMap]
  );

  const onLinkSelect = useCallback(
    (link: TopologyLink) => {
      setSelectedNodeIds([]);
      setSelectedLink((prev) => {
        const isSame = prev && linkKey(prev) === linkKey(link);
        if (!editable) {
          setDetailsLink(isSame ? null : link);
        }
        return isSame ? null : link;
      });
    },
    [editable]
  );

  const openLinkDetails = useCallback((link: TopologyLink) => {
    setDetailsLink(link);
    setSelectedLink(link);
    setSelectedNodeIds([]);
  }, []);

  const pendingSuggestions = useMemo(
    () => (storedMap.suggestedLinks ?? []).filter((s) => s.state === 'suggested'),
    [storedMap.suggestedLinks]
  );

  const runNeighborDiscovery = useCallback(async () => {
    if (!zabbixDatasourceUid) {
      setNeighborError('Configure o datasource Zabbix na aba Query do painel.');
      setSuggestedReviewOpen(true);
      return;
    }
    setDiscoveringNeighbors(true);
    setNeighborError(undefined);
    setSuggestedReviewOpen(true);
    try {
      const result = await discoverTopologyNeighbors(zabbixDatasourceUid, storedMap, hostMetadata, queryData);
      const merged = mergeSuggestedLinks(storedMap, result.suggestions);
      if (merged !== storedMap) {
        persist(merged);
      }
      setNeighborReport({
        hostsScanned: result.hostsScanned,
        neighborRecords: result.neighborRecords,
        lldpAvailable: result.lldpAvailable,
        cdpAvailable: result.cdpAvailable,
        newSuggestions: result.suggestions.length,
      });
    } catch {
      setNeighborError('Não foi possível consultar vizinhos no Zabbix.');
    } finally {
      setDiscoveringNeighbors(false);
    }
  }, [hostMetadata, persist, queryData, storedMap, zabbixDatasourceUid]);

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
    beginWaypointDragFromPath,
    removeWaypointNearPointer,
    resolveLinkWaypoints,
    resetLinkRoute,
    clearNodeDragUi,
    cancelActiveDrag,
  } = useTopologyDragController({
    wrapRef,
    svgRef,
    map,
    storedMap,
    nodeLayouts,
    editable: viewEditable,
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
        if (submapHasChildMapId(node)) {
          resetDoubleTapState();
          openSubmap(node);
          return;
        }
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

  const handleNodeMouseEnter = useCallback(
    (e: React.MouseEvent, node: TopologyNode) => {
      setLinkHoverId(node.id);
      if (isHostNode(node) && node.zabbixHost?.trim()) {
        beginHostHover({ node, screenX: e.clientX, screenY: e.clientY });
      }
    },
    [beginHostHover]
  );

  const handleNodeMouseMove = useCallback(
    (e: React.MouseEvent, node: TopologyNode) => {
      if (isHostNode(node) && node.zabbixHost?.trim()) {
        moveHostHover({ node, screenX: e.clientX, screenY: e.clientY });
      }
    },
    [moveHostHover]
  );

  const handleNodeMouseLeave = useCallback(
    (_e: React.MouseEvent, node: TopologyNode) => {
      setLinkHoverId(null);
      endHostHover(node.id);
    },
    [endHostHover]
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
      closeContextMenu();
    },
    [clearNodeDragUi, closeContextMenu, persist, setSelectedNodeIds, storedMap]
  );

  const deleteSelectedNodes = useCallback(() => {
    if (!selectedNodes.length) {
      return;
    }
    removeNodesFromCanvas(selectedNodes);
  }, [removeNodesFromCanvas, selectedNodes]);

  const deleteSelectedLink = useCallback(() => {
    if (!selectedLink) {
      return;
    }
    persist(removeLinkByEndpoints(storedMap, selectedLink.from, selectedLink.to));
    setSelectedLink(null);
  }, [persist, selectedLink, setSelectedLink, storedMap]);

  /** Esc: abandona o modo link, fecha menu e zera seleção, marquee e guias de alinhamento. */
  const cancelInteractions = useCallback(() => {
    setLinkFromId(null);
    closeContextMenu();
    setSelectedNodeIds([]);
    setMarqueeRect(null);
    setAlignGuides([]);
  }, [setSelectedNodeIds]);

  useCanvasKeyboardShortcuts({
    wrapRef,
    canPersist,
    canEditCanvas,
    searchOpen,
    setSearchOpen,
    selectedNodeIds,
    selectedLink,
    onUndo,
    onRedo,
    copySelection,
    pasteAtViewCenter,
    deleteSelectedNodes,
    deleteSelectedLink,
    cancelInteractions,
  });

  const bulk = useBulkEditModals({ selectedHostNodes, selectedSubmapNodes, showToast, closeContextMenu });
  const { openBulkIconEdit, openBulkCredsEdit, openBulkSubmapEdit } = bulk;

  const { canvasMenuItems, nodeMenuItems, linkMenuItems } = useTopologyMenuItems({
    storedMap,
    editable,
    options,
    hostMetadata,
    anchor: contextMenu,
    selectedNodeIds,
    selectedNodes,
    selectedHostNodes,
    selectedSubmapNodes,
    selectedLink,
    snapCoord,
    persist,
    closeMenu: closeContextMenu,
    copySelection,
    pasteAt,
    deleteSelectedNodes,
    removeNodes: removeNodesFromCanvas,
    openBulkIconEdit,
    openBulkCredsEdit,
    openBulkSubmapEdit,
    openNodeProperties,
    openSubmap,
    openAddHost: setAddHostAt,
    openLinkEdit: setEditLink,
    openLinkDetails,
    resetLinkRoute,
    beginLinkFrom,
    beginLinkFromCanvas,
    setPingTarget,
    showToast,
  });

  const showEmptyHint = map.nodes.length === 0;

  const { gridBounds, gridVerticalLines, gridHorizontalLines, isMajorGridLine } = useGridLines({
    gridStep,
    mapWidth: map.width,
    mapHeight: map.height,
    view,
    viewport,
  });

  const legendItems = useMemo(() => buildLegendItems(options), [options]);

  const { resolveMiniNodeFill, resolveMiniNetworkStroke, miniLinkColor } = useMinimapColors({
    regionStats,
    options,
    queryReady,
    hostMetadata,
    hostDisplay,
    resolveColor,
  });

  return (
    <div
      ref={wrapRef}
      className={`${canvasStyles.wrap} ${panTool ? canvasStyles.wrapPan : canvasStyles.wrapSelect}`}
      onPointerDownCapture={(e) => {
        // Fase de captura — dispara mesmo quando um filho (nó, link, scrollbar) chama
        // stopPropagation() no pointerdown. Congela os dados do painel (useFrozenCanvasData)
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
      <CanvasControlsOverlay
        hidden={Boolean(hideOverlayControls)}
        map={map}
        mapNavigationBreadcrumb={mapNavigationBreadcrumb}
        canMapNavigateBack={canMapNavigateBack}
        canMapNavigateForward={canMapNavigateForward}
        onMapNavigateBack={
          onMapNavigateBack ? () => onMapNavigateBack(viewRef.current) : undefined
        }
        onMapNavigateForward={
          onMapNavigateForward ? () => onMapNavigateForward(viewRef.current) : undefined
        }
        onMapNavigateBreadcrumb={
          onMapNavigateBreadcrumb
            ? (index: number) => onMapNavigateBreadcrumb(index, viewRef.current)
            : undefined
        }
        tool={tool}
        setTool={setTool}
        networksLocked={networksLocked}
        canUndo={canUndo}
        canRedo={canRedo}
        canCopy={canEditCanvas && (selectedNodeIds.length > 0 || selectedLink !== null)}
        canPaste={canEditCanvas && clipboardReady}
        canPersist={canPersist}
        editable={viewEditable}
        nocModeActive={effectiveNocMode}
        onToggleNocMode={onNocModeChange ? handleToggleNocMode : undefined}
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
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        onSearchFocusNode={focusNodeOnMap}
        queryError={Boolean(queryError)}
        onDiscoverNeighbors={
          canEditCanvas && !effectiveNocMode && zabbixDatasourceUid ? runNeighborDiscovery : undefined
        }
        discoveringNeighbors={discoveringNeighbors}
        suggestedLinksCount={pendingSuggestions.length}
        onReviewSuggestedLinks={() => setSuggestedReviewOpen(true)}
        onInsertBlueprint={canEditCanvas && !effectiveNocMode ? () => setBlueprintOpen(true) : undefined}
      />

      {!hideOverlayControls ? (
        <TopologyHostAlertList
          entries={alertHostEntries}
          colorOffline={resolveColor(options.colorOffline)}
          colorAlert={resolveColor(options.colorAlert)}
          queryReady={queryReady}
          showMinimap={minimapVisible}
          onFocusHost={focusNodeOnMap}
        />
      ) : null}

      {effectiveNocMode && !hideOverlayControls ? (
        <TopologyFilterBar activeFilters={activeFilters} onToggle={toggleFilter} />
      ) : null}

      <div ref={bindScrollRef} className={canvasStyles.scrollPane} onScroll={onScroll}>
        <div
          className={canvasStyles.scrollSizer}
          style={{
            width: Math.max(contentWidth, 1),
            height: Math.max(contentHeight, 1),
          }}
          aria-hidden
        />
      </div>

      <svg
        ref={svgRef}
        className={canvasStyles.svg}
        width="100%"
        height="100%"
        onContextMenu={(e) => handleContextMenu(e)}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
          <LinkMarkers colorLink={options.colorLink} />
          <CanvasGridLayer
            bounds={gridBounds}
            verticalLines={gridVerticalLines}
            horizontalLines={gridHorizontalLines}
            isMajorLine={isMajorGridLine}
            showGrid={Boolean(options.showGrid)}
            grabCursor={panTool && Boolean(options.enablePan)}
            onPointerDown={onCanvasPointerDown}
            onContextMenu={(e) => handleContextMenu(e)}
          />

          <NetworkNodesLayer
            nodes={map.nodes}
            nodeLayouts={nodeLayouts}
            regionStats={regionStats}
            options={options}
            queryReady={queryReady}
            resolveColor={resolveColor}
            selectedNodeIds={selectedNodeIds}
            panTool={panTool}
            editable={viewEditable}
            networksLocked={networksLocked}
            onPointerDown={onNetworkPointerDown}
            onDoubleClick={onNodeDoubleClick}
            onContextMenu={handleNodeContextMenu}
            onResizePointerDown={onResizePointerDown}
            onResizePointerUp={onPointerUp}
          />

          {(storedMap.suggestedLinks ?? [])
            .filter((s) => s.state === 'suggested')
            .map((suggestion) => (
              <SuggestedLinkLine
                key={suggestion.id}
                suggestion={suggestion}
                nodeLayouts={nodeLayouts}
                options={options}
                selected={false}
                onSelect={() => setSuggestedReviewOpen(true)}
              />
            ))}

          <LinksLayer
            renderLinks={filteredRenderLinks}
            nodeLayouts={nodeLayouts}
            options={options}
            editable={viewEditable}
            panTool={panTool}
            selectedLink={selectedLink}
            hoveredLinkKey={hoveredLinkKey}
            setHoveredLinkKey={setHoveredLinkKey}
            resolveLinkWaypoints={resolveLinkWaypoints}
            linkMetricsByLink={linkMetricsByLink}
            onLinkSelect={onLinkSelect}
            onLinkContextMenu={(e, link) => handleContextMenu(e, { link })}
            beginPan={beginPan}
            beginWaypointDragFromPath={beginWaypointDragFromPath}
            removeWaypointNearPointer={removeWaypointNearPointer}
          />

          <CanvasSelectionShapes guides={alignGuides} marqueeRect={marqueeRect} />

          <HostNodesLayer
            map={map}
            nodes={map.nodes}
            nodeLayouts={nodeLayouts}
            regionStats={regionStats}
            options={options}
            queryReady={queryReady}
            hostDisplay={hostDisplay}
            hostMetadata={hostMetadata}
            hostProblems={hostProblems}
            linkMetricsByLink={linkMetricsByLink}
            activeFilters={activeFilters}
            filterContext={filterContext}
            showHostBadges={options.showHostBadges !== false}
            resolveColor={resolveColor}
            selectedNodeIds={selectedNodeIds}
            selectedLink={selectedLink}
            linkFromId={linkFromId}
            linkHoverId={linkHoverId}
            panTool={panTool}
            editable={viewEditable}
            onPointerDown={onNodePointerDown}
            onClick={onNodeClick}
            onDoubleClick={onNodeDoubleClick}
            onContextMenu={handleNodeContextMenu}
            onMouseEnter={handleNodeMouseEnter}
            onMouseMove={handleNodeMouseMove}
            onMouseLeave={handleNodeMouseLeave}
            onResizePointerDown={onResizePointerDown}
            onResizePointerUp={onPointerUp}
          />
        </g>
      </svg>

      <CanvasHudOverlay
        showMinimap={minimapVisible}
        map={map}
        links={validLinks}
        nodeLayouts={nodeLayouts}
        view={view}
        viewport={viewport}
        onViewChange={commitView}
        resolveNodeFill={resolveMiniNodeFill}
        resolveNetworkStroke={resolveMiniNetworkStroke}
        linkColor={miniLinkColor}
        showLegend={showLegend}
        legendItems={legendItems}
        refreshIntervalSec={refreshIntervalSec}
        refreshResetKey={queryData}
        contextMenu={contextMenu}
        onCloseContextMenu={closeContextMenu}
        canvasMenuItems={canvasMenuItems}
        nodeMenuItems={nodeMenuItems}
        linkMenuItems={linkMenuItems}
      />

      <CanvasModals
        storedMap={storedMap}
        options={options}
        persist={persist}
        showToast={showToast}
        modals={modals}
        bulk={bulk}
        queryHostOptions={queryHostOptions}
        zabbixMetadataLoading={zabbixMetadataLoading}
        zabbixDatasourceUid={zabbixDatasourceUid}
        queryData={queryData}
        hostMetadata={hostMetadata}
        hostDisplay={hostDisplay}
        queryReady={queryReady}
        pingTarget={pingTarget}
        setPingTarget={setPingTarget}
        hostHover={hostHover}
        searchOpen={searchOpen}
        pendingLink={pendingLink}
        onPendingLinkClose={() => setPendingLink(null)}
        onPendingLinkSave={handlePendingLinkSave}
      />

      <TopologyToast message={toast} />

      {detailsLink ? (
        <LinkDetailsDrawer
          link={detailsLink}
          storedMap={storedMap}
          options={options}
          runtimeMetrics={resolveLinkDetailsMetrics(detailsLink, linkMetricsByLink)}
          onClose={() => setDetailsLink(null)}
          onEdit={
            editable
              ? () => {
                  setEditLink(detailsLink);
                  setDetailsLink(null);
                }
              : undefined
          }
        />
      ) : null}

      {suggestedReviewOpen ? (
        <SuggestedLinksReviewModal
          map={storedMap}
          suggestions={storedMap.suggestedLinks ?? []}
          report={neighborReport}
          loading={discoveringNeighbors}
          loadError={neighborError}
          onConfirm={(id) => persist(confirmSuggestedLink(storedMap, id))}
          onIgnore={(id) => persist(ignoreSuggestedLink(storedMap, id))}
          onConfirmAll={() => persist(confirmAllSuggestedLinks(storedMap))}
          onClose={() => {
            setSuggestedReviewOpen(false);
            setNeighborReport(undefined);
            setNeighborError(undefined);
          }}
        />
      ) : null}

      {blueprintOpen ? (
        <TopologyBlueprintModal
          options={options}
          onApply={handleBlueprintApply}
          onClose={() => setBlueprintOpen(false)}
        />
      ) : null}
    </div>
  );
}
