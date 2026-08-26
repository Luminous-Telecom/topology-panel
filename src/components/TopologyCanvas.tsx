import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanelData } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { CanvasTool, HostDisplayMap, HostMetadataMap, LinkRuntimeMetricsMap, TopologyBlueprint, TopologyHostIcon, TopologyInterfaceReference, TopologyLink, TopologyLinkPeerHost, TopologyMap, TopologyNode, TopologyPanelOptions, TopologyView } from '../types';
import { HostNodeBadge, HostProblemsMap, TopologyMapFilterId } from '../utils/noc/types';
import { buildHostNodeBadgeMap } from '../utils/noc/hostBadges';
import {
  collectAlertHostEntriesFromMaps,
  collectNocHostEntries,
  isLinkVisibleForFilters,
  NocHostListEntry,
  TopologyFilterContext,
} from '../utils/noc/topologyFilters';
import { TopologyHostAlertList } from './canvas/TopologyHostAlertList';
import { TopologyNocPanel } from './canvas/TopologyNocPanel';
import { activeChildMaps } from '../utils/childMapEdits';
import { areNetworksLocked, removeNodesFromMap, toggleMapLock, toggleNetworksLock } from '../utils/mapEdits';
import { addLinkToMap, linkKey, removeLink, upsertLinkWithInterfaces } from '../utils/mapLinkEdits';
import { clamp, snapToGrid } from '../utils/mapCoords';
import { QueryHostOption } from '../utils/queryHostPicker';
import { HostHoverSeriesMap } from '../utils/hostTimeSeries';
import { flattenHostDisplayByRefId } from '../utils/queryHosts';
import { isHostNode, findNodeById, submapHasChildMapId } from '../utils/topologyNodes';
import { resolveHostDoubleClickAction } from '../utils/nodeTap';
import { shouldOpenLinkInterfaceModal } from '../utils/submapHosts';
import { TopologyBreadcrumbItem, ROOT_MAP_ID } from '../utils/topologyMapNavigation';
import { resolvePanelColor } from '../utils/panelColors';
import { buildLegendItems } from '../utils/legendItems';
import { AlignGuideLine } from '../utils/alignGuides';
import {
  computeFitToContentBoundsTransform,
  computeTopologyContentBounds,
  computeTopologyFitBounds,
  mapCanvasClientSize,
  shouldApplyNavigationFit,
  TopologyFitViewportRecord,
} from '../utils/mapBounds';
import { useMapContentScroll } from '../hooks/useMapContentScroll';
import { canvasStyles } from './canvas/canvasStyles';
import { CanvasControlsOverlay } from './canvas/CanvasControlsOverlay';
import { CanvasGridLayer } from './canvas/CanvasGridLayer';
import { CanvasHudOverlay } from './canvas/CanvasHudOverlay';
import { CanvasModals } from './canvas/CanvasModals';
import { CanvasSelectionShapes } from './canvas/CanvasSelectionShapes';
import { LinksLayer } from './canvas/LinksLayer';
import { HostNodesLayer, NetworkLabelsLayer, NetworkNodesLayer } from './canvas/NodeLayers';
import { LinkMarkers } from './canvas/LinkMarkers';
import { HostIconDefs } from '../utils/hostIcons';
import { TopologyToast } from './canvas/TopologyToast';
import { LinkDetailsDrawer, resolveLinkDetailsMetrics } from './LinkDetailsDrawer';
import { TopologyBlueprintModal } from './lazyModals';
import { applyTopologyBlueprint } from '../utils/mapTemplateEdits';
import { openDashboardUrl } from './DashboardPickerModal';
import { LinkPoint } from '../utils/linkGeometry';
import { useGridLines } from '../hooks/useGridLines';
import { useLinkFlowAnimation } from '../hooks/useLinkFlowAnimation';
import { useStableCallback } from '../hooks/useStableCallback';
import { useStableIdentity } from '../hooks/useStableIdentity';
import { structuralShareMap } from '../utils/structuralIdentity';
import {
  boxIntersectsRect,
  CULL_MIN_NODES,
  linkBoundingBox,
  visibleWorldRect,
  WorldRect,
} from '../utils/viewportCulling';
import { useTopologySelection } from '../hooks/useTopologySelection';
import { useBulkEditModals } from '../hooks/useBulkEditModals';
import { nodeSupportsProperties, NODE_DOUBLE_TAP_MS, useNodePropertiesModals } from '../hooks/useNodePropertiesModals';
import { useTopologyClipboardActions } from '../hooks/useTopologyClipboardActions';
import { useTopologyViewport } from '../hooks/useTopologyViewport';
import { FULLSCREEN_CHROME_IDLE_MS, useIdleHide } from '../hooks/useIdleHide';
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
  /** Consulta de status em andamento antes da primeira resposta boa. */
  queryLoading?: boolean;
  hostMetadata?: HostMetadataMap;
  submapHosts?: Record<string, string[] | null | undefined>;
  /** Intervalo de busca do plugin (zabbixRefreshSec). O contador
   * "Atualiza em Ns" corre no mesmo relógio do poll — não reinicia quando uma busca termina,
   * senão a query seguinte dispara com o cronômetro ainda no meio.
   */
  refreshIntervalSec?: number | null;
  /** `PanelData` com o timeRange do seletor do dashboard, para o hover ICMP. */
  queryData?: PanelData;
  /** UID do datasource Zabbix — ping e interfaces. */
  zabbixDatasourceUid?: string;
  /** Série ICMP do poll de status — o hover só lê, não consulta. */
  hoverByHost?: HostHoverSeriesMap;
  /** Métricas voláteis de links (RX/TX/utilização) */
  linkMetricsByLink?: LinkRuntimeMetricsMap;
  /** Problemas Zabbix para badges NOC */
  hostProblems?: HostProblemsMap;
  onNocModeChange?: (enabled: boolean) => void;
  onMapChange?: (map: TopologyMap, context?: { interSubmapLink?: TopologyLink }) => void;
  onViewChange?: (view: TopologyView) => void;
  onShowMinimapChange?: (show: boolean) => void;
  onShowLegendChange?: (show: boolean) => void;
  onShowHostAlertListChange?: (show: boolean) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Esconde a toolbar (lista de reprodução / kiosk). Legenda, alertas e navegação de submapa continuam. */
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
  onMapNavigateHome?: (currentView: TopologyView) => void;
  onNavigateToChildMap?: (childMapId: string, label: string, currentView: TopologyView) => void;
  onNavigateToMapId?: (mapId: string, label: string, currentView: TopologyView) => void;
}

/**
 * Defaults compartilhados: `= {}` / `= []` no parâmetro cria um objeto novo a **cada** render, o que
 * invalidava `useNodeLayouts`, `filterContext` e os badges mesmo sem nada ter mudado.
 */
const NO_QUERY_HOST_OPTIONS: QueryHostOption[] = [];
const NO_HOST_DISPLAY_BY_REF_ID: Record<string, HostDisplayMap> = {};
const NO_SUBMAP_HOSTS: Record<string, string[] | null | undefined> = {};
const NO_LINK_METRICS: LinkRuntimeMetricsMap = {};
const NO_HOVER_BY_HOST: HostHoverSeriesMap = {};

export function TopologyCanvas({
  map: liveMap,
  storedMap,
  options,
  queryHostOptions = NO_QUERY_HOST_OPTIONS,
  hostDisplay: liveHostDisplay,
  hostDisplayByRefId: liveHostDisplayByRefId = NO_HOST_DISPLAY_BY_REF_ID,
  queryReady: liveQueryReady = false,
  queryError: liveQueryError = false,
  queryLoading: liveQueryLoading = false,
  hostMetadata: liveHostMetadata,
  submapHosts: liveSubmapHosts = NO_SUBMAP_HOSTS,
  refreshIntervalSec = null,
  queryData: liveQueryData,
  zabbixDatasourceUid,
  hoverByHost = NO_HOVER_BY_HOST,
  linkMetricsByLink = NO_LINK_METRICS,
  hostProblems,
  onNocModeChange,
  onMapChange,
  onViewChange,
  onShowMinimapChange,
  onShowLegendChange,
  onShowHostAlertListChange,
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
  onMapNavigateHome,
  onNavigateToChildMap,
  onNavigateToMapId,
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
  const lastFitViewportRef = useRef<TopologyFitViewportRecord | null>(null);
  const bindScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
  }, []);
  const svgRef = useRef<SVGSVGElement>(null);
  useLinkFlowAnimation(wrapRef);
  const savedView = savedViewProp ?? options.view;
  const canPersist = Boolean(onMapChange);
  const canEditCanvas = canPersist && !map.locked;
  const editable = canEditCanvas;
  const networksLocked = areNetworksLocked(storedMap);
  const showMinimap = options.showMinimap !== false;
  /** Sobrescreve `options.showLegend` na sessão quando o dashboard não está em modo edição. */
  const [showLegendLocalOverride, setShowLegendLocalOverride] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    setShowLegendLocalOverride(undefined);
  }, [options.showLegend]);
  const showLegend = showLegendLocalOverride ?? options.showLegend !== false;
  const handleToggleShowLegend = useCallback(() => {
    const current = showLegendLocalOverride ?? options.showLegend !== false;
    const next = !current;
    setShowLegendLocalOverride(next);
    onShowLegendChange?.(next);
  }, [onShowLegendChange, options.showLegend, showLegendLocalOverride]);
  /** Sobrescreve `options.showHostAlertList` na sessão quando o dashboard não está em modo edição. */
  const [showHostAlertListLocalOverride, setShowHostAlertListLocalOverride] = useState<boolean | undefined>(
    undefined
  );
  useEffect(() => {
    setShowHostAlertListLocalOverride(undefined);
  }, [options.showHostAlertList]);
  const showHostAlertList = showHostAlertListLocalOverride ?? options.showHostAlertList !== false;
  const handleToggleShowHostAlertList = useCallback(() => {
    const current = showHostAlertListLocalOverride ?? options.showHostAlertList !== false;
    const next = !current;
    setShowHostAlertListLocalOverride(next);
    onShowHostAlertListChange?.(next);
  }, [onShowHostAlertListChange, options.showHostAlertList, showHostAlertListLocalOverride]);
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
    savedView,
    onViewChange,
    enableZoom: Boolean(options.enableZoom),
    mapNodesLength: map.nodes.length,
    onPinchStart,
    onFullscreenChange,
    showToast,
  });
  const chromeIdleHidden = useIdleHide({
    enabled: isFullscreen,
    wrapRef,
    idleMs: FULLSCREEN_CHROME_IDLE_MS,
    paused: searchOpen,
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
  const { contextMenu, closeContextMenu, handleContextMenu, handleNodeContextMenu, openContextMenuAt } =
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
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<TopologyMapFilterId>>(() => new Set());
  const pendingNocFocusRef = useRef<{ mapId: string; nodeId: string } | null>(null);
  /** Sobrescreve `options.nocMode` na sessão quando o dashboard não está em modo edição. */
  const [nocModeLocalOverride, setNocModeLocalOverride] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    setNocModeLocalOverride(undefined);
  }, [options.nocMode]);
  const effectiveNocMode = nocModeLocalOverride ?? Boolean(options.nocMode);
  const handleToggleNocMode = useCallback(() => {
    const current = nocModeLocalOverride ?? Boolean(options.nocMode);
    const next = !current;
    setNocModeLocalOverride(next);
    onNocModeChange?.(next);
  }, [nocModeLocalOverride, onNocModeChange, options.nocMode]);
  const viewEditable = editable && !effectiveNocMode && !hideOverlayControls;
  const modals = useNodePropertiesModals({ storedMap, editable, linkFromId });
  const {
    editNode,
    openNodeProperties,
    openHostInfo,
    openDashboardPicker,
    tryDoubleTapOpenProperties,
    resetDoubleTapState,
    setAddHostAt,
    setEditLink,
  } = modals;
  const [linkHoverId, setLinkHoverId] = useState<string | null>(null);
  const { hostHover, beginHostHover, moveHostHover, endHostHover, clearHostHover } = useHostHoverTarget();
  const hostHoverEnabledRef = useRef(
    typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
  const [hoveredLinkKey, setHoveredLinkKey] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    nodeId?: string;
    positions?: Record<string, { x: number; y: number }>;
    width?: number;
    height?: number;
    linkWaypoints?: { key: string; waypoints: LinkPoint[] };
  } | null>(null);
  const [alignGuides, setAlignGuides] = useState<AlignGuideLine[]>([]);
  const [pingTarget, setPingTarget] = useState<{
    label: string;
    ip: string;
    zabbixHost?: string;
  } | null>(null);

  /** `activeChildMaps` monta um objeto novo a cada chamada — memoize antes de virar dependência. */
  const childMapsById = useMemo(() => activeChildMaps(options.childMaps), [options.childMaps]);

  const layoutOpts = useMemo(
    () => ({
      nodeFontSize: options.nodeFontSize,
      networkFontSize: options.networkFontSize,
      showSubtitle: options.showSubtitle,
    }),
    [options.nodeFontSize, options.networkFontSize, options.showSubtitle]
  );

  const templateOpts = useMemo(
    () => ({
      nodeTemplates: options.nodeTemplates,
      templateRules: options.templateRules,
      showSubtitle: options.showSubtitle,
    }),
    [options.nodeTemplates, options.templateRules, options.showSubtitle]
  );

  /** Só o que os filtros leem das opções — o objeto inteiro invalidaria o contexto sem motivo. */
  const filterOptions = useMemo(
    () => ({ linkUtilThresholdHigh: options.linkUtilThresholdHigh }),
    [options.linkUtilThresholdHigh]
  );

  const filterContext = useMemo<TopologyFilterContext>(
    () => ({
      map,
      hostDisplay,
      hostMetadata,
      hostProblems,
      linkMetricsByLink,
      options: filterOptions,
    }),
    [map, hostDisplay, hostMetadata, hostProblems, linkMetricsByLink, filterOptions]
  );

  const previousBadgesRef = useRef<ReadonlyMap<string, HostNodeBadge[]>>();

  const hostBadgesByNode = useMemo(() => {
    if (options.showHostBadges === false) {
      return undefined;
    }
    const built = buildHostNodeBadgeMap({
      map,
      hostDisplay,
      hostMetadata,
      hostProblems,
    });
    // Um host mudando remonta a lista de badges de todos os nós; sem reaproveitar as iguais, a
    // prop `badges` invalidaria o `React.memo` de cada forma.
    const shared = structuralShareMap(built, previousBadgesRef.current as Map<string, HostNodeBadge[]> | undefined);
    previousBadgesRef.current = shared;
    return shared;
  }, [map, hostDisplay, hostMetadata, hostProblems, options.showHostBadges]);

  const nocMapScopes = useMemo(() => {
    const childLabels: Record<string, string> = {};
    for (const node of options.map.nodes) {
      const childId = node.submapChildMapId?.trim();
      if (node.type === 'submap' && childId) {
        childLabels[childId] = node.label?.trim() || childId;
      }
    }
    const scopes = [{ mapId: ROOT_MAP_ID, mapLabel: 'Início', map: options.map }];
    for (const [id, childMap] of Object.entries(childMapsById)) {
      scopes.push({ mapId: id, mapLabel: childLabels[id] ?? id, map: childMap });
    }
    return scopes;
  }, [options.map, childMapsById]);

  const nocHostDisplayBase = useMemo(
    () => flattenHostDisplayByRefId(hostDisplayByRefId),
    [hostDisplayByRefId]
  );

  const alertHostEntries = useMemo(() => {
    if (effectiveNocMode || !showHostAlertList) {
      return [];
    }
    return collectAlertHostEntriesFromMaps(nocMapScopes, {
      hostDisplay: nocHostDisplayBase,
      hostMetadata,
      hostProblems,
      linkMetricsByLink,
      options: filterOptions,
    });
  }, [
    effectiveNocMode,
    showHostAlertList,
    nocHostDisplayBase,
    hostMetadata,
    hostProblems,
    linkMetricsByLink,
    nocMapScopes,
    filterOptions,
  ]);

  const nocHostEntries = useMemo(() => {
    if (!effectiveNocMode) {
      return [];
    }
    return collectNocHostEntries(activeFilters, nocMapScopes, {
      hostDisplay: nocHostDisplayBase,
      hostMetadata,
      hostProblems,
      linkMetricsByLink,
      options: filterOptions,
    });
  }, [
    effectiveNocMode,
    activeFilters,
    nocHostDisplayBase,
    hostMetadata,
    hostProblems,
    linkMetricsByLink,
    nocMapScopes,
    filterOptions,
  ]);

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
    templateOpts,
    dragPreview,
    hostDisplay,
    hostDisplayByRefId,
    hostMetadata,
    submapHosts,
    childMaps: childMapsById,
    hostProblems,
    queryReady,
    linkMetricsByLink,
  });

  /** Caixas medidas para callbacks que não devem trocar de identidade a cada refresh da Query. */
  const nodeLayoutsRef = useRef(nodeLayouts);
  nodeLayoutsRef.current = nodeLayouts;

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
    viewportRef,
    suspendSyncRef: suspendScrollSyncRef,
  });

  // Encaixa ao abrir/trocar mapa (e se o card crescer). Não reencaixa em refresh de status,
  // para o zoom da roda não voltar atrás. Se o viewport ainda for 0, tenta de novo quando
  // `viewport` tiver medida — não marca o mapa como “já encaixado” nesse caso.
  useLayoutEffect(() => {
    const w = viewport.w;
    const h = viewport.h;
    if (w <= 0 || h <= 0) {
      return;
    }
    if (map.nodes.length > 0 && nodeLayouts.size === 0) {
      return;
    }
    // `map` é o snapshot de `useFrozenCanvasData`, que só alcança a prop no render seguinte. Ao
    // trocar de mapa, `mapNavigationKey` já é o do destino enquanto o desenho ainda é do mapa
    // anterior: encaixar aqui usaria o bounding box errado e, pior, marcaria o destino como já
    // encaixado — o fit correto no render seguinte seria recusado.
    if (map !== liveMap) {
      return;
    }

    const navKey = `${mapNavigationKey}:${isFullscreen ? 'fs' : 'win'}`;
    if (!shouldApplyNavigationFit(lastFitViewportRef.current, navKey, w, h)) {
      return;
    }

    const transform = computeFitToContentBoundsTransform(fitBounds, w, h);
    if (!transform) {
      return;
    }

    commitView(transform, { persist: false });
    syncScrollFromView();
    lastFitViewportRef.current = { navKey, w, h };
  }, [
    commitView,
    fitBounds,
    isFullscreen,
    liveMap,
    map,
    mapNavigationKey,
    nodeLayouts.size,
    syncScrollFromView,
    viewport.h,
    viewport.w,
  ]);

  const { validLinks, renderLinks } = useRenderLinks(map.links, nodeLayouts, selectedLink);
  const filteredRenderLinks = useMemo(() => {
    if (!activeFilters.size) {
      return renderLinks;
    }
    return renderLinks.filter(({ link }) => isLinkVisibleForFilters(link, activeFilters, filterContext));
  }, [renderLinks, activeFilters, filterContext]);

  const persist = useCallback(
    (next: TopologyMap, context?: { interSubmapLink?: TopologyLink }) => {
      onMapChange?.(next, context);
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

  /** Centraliza e seleciona o nó; `false` quando o nó ainda não tem caixa medida no mapa ativo. */
  const focusNodeOnMap = useCallback(
    (nodeId: string): boolean => {
      const layout = nodeLayoutsRef.current.get(nodeId);
      if (!layout) {
        return false;
      }
      const cx = layout.x + layout.w / 2;
      const cy = layout.y + layout.h / 2;
      const scale = clamp(Math.max(viewRef.current.scale, 0.55), 0.15, 3);
      const vw = viewportRef.current.w;
      const vh = viewportRef.current.h;
      if (vw <= 0 || vh <= 0) {
        return false;
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
      return true;
    },
    [closeContextMenu, commitView, nodeLayoutsRef, setSelectedLink, setSelectedNodeIds, viewRef, viewportRef]
  );

  const handleSelectHostFromList = useCallback(
    (entry: { mapId: string; mapLabel: string; nodeId: string }) => {
      if (entry.mapId !== mapNavigationKey) {
        pendingNocFocusRef.current = { mapId: entry.mapId, nodeId: entry.nodeId };
        onNavigateToMapId?.(entry.mapId, entry.mapLabel, viewRef.current);
        return;
      }
      focusNodeOnMap(entry.nodeId);
    },
    [focusNodeOnMap, mapNavigationKey, onNavigateToMapId, viewRef]
  );

  const handleNocSelectHost = useCallback(
    (entry: NocHostListEntry) => {
      handleSelectHostFromList(entry);
    },
    [handleSelectHostFromList]
  );

  /**
   * Foco pendente do painel NOC: o host escolhido está em outro mapa, então só dá para centralizar
   * depois que o mapa de destino já foi desenhado. `map` é o snapshot congelado, que alcança a prop
   * um render depois da troca de mapa — enquanto isso as caixas medidas ainda são do mapa anterior e
   * o pedido continua pendente, para não ser perdido no caminho (o fit de entrada roda antes deste
   * efeito, então o centro no host é a última palavra).
   */
  useLayoutEffect(() => {
    const pending = pendingNocFocusRef.current;
    if (!pending) {
      return;
    }
    if (pending.mapId !== mapNavigationKey) {
      pendingNocFocusRef.current = null;
      return;
    }
    if (map !== liveMap) {
      return;
    }
    if (focusNodeOnMap(pending.nodeId)) {
      pendingNocFocusRef.current = null;
    }
  }, [focusNodeOnMap, liveMap, map, mapNavigationKey, nodeLayouts]);

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
      if (
        fromNode &&
        toNode &&
        shouldOpenLinkInterfaceModal(fromNode, toNode, childMapsById, Boolean(zabbixDatasourceUid))
      ) {
        setPendingLink({ from: linkFromId, to: targetId, fromNode, toNode });
        setLinkFromId(null);
        return;
      }
      persist(addLinkToMap(storedMap, linkFromId, targetId));
      setLinkFromId(null);
    },
    [childMapsById, linkFromId, persist, storedMap, zabbixDatasourceUid]
  );

  const handlePendingLinkSave = useCallback(
    (
      fromInterface: TopologyInterfaceReference | undefined,
      toInterface: TopologyInterfaceReference | undefined,
      bandwidthMbps?: number,
      fromPeerHost?: TopologyLinkPeerHost,
      toPeerHost?: TopologyLinkPeerHost
    ) => {
      if (!pendingLink) {
        return;
      }
      const next = upsertLinkWithInterfaces(storedMap, pendingLink.from, pendingLink.to, {
        fromInterface,
        toInterface,
        fromPeerHost,
        toPeerHost,
        bandwidthMbps,
      });
      persist(next, {
        interSubmapLink: {
          from: pendingLink.from,
          to: pendingLink.to,
          fromInterface,
          toInterface,
          fromPeerHost,
          toPeerHost,
          bandwidthMbps,
        },
      });
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

  const handleNodeContextMenuWithClear = useCallback(
    (e: React.MouseEvent, node: TopologyNode) => {
      clearHostHover();
      handleNodeContextMenu(e, node);
    },
    [clearHostHover, handleNodeContextMenu]
  );

  const handleNodeLongPress = useCallback(
    (clientX: number, clientY: number, node: TopologyNode) => {
      clearHostHover();
      openContextMenuAt(clientX, clientY, { node });
    },
    [clearHostHover, openContextMenuAt]
  );

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
    onNodeLongPress: handleNodeLongPress,
    onHostPeek: (node, clientX, clientY) => {
      beginHostHover({ node, screenX: clientX, screenY: clientY, pinned: true });
    },
    onHostOpenTools: (node, clientX, clientY) => {
      clearHostHover();
      openContextMenuAt(clientX, clientY, { node });
    },
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
   * Só na fase de bolha: na captura, `stopPropagation` impede o evento de chegar ao `scrollPane` e
   * a barra nativa deixa de receber o arraste.
   */
  const stopScrollbarBubble = useCallback(
    (e: React.SyntheticEvent) => {
      if (e.target === scrollRef.current) {
        e.stopPropagation();
      }
    },
    [scrollRef]
  );

  const handleWrapPointerDown = useCallback(
    (e: React.PointerEvent) => {
      stopScrollbarBubble(e);
      onWrapPointerDown(e);
    },
    [onWrapPointerDown, stopScrollbarBubble]
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
      if (resolveHostDoubleClickAction(node, false) === 'info') {
        resetDoubleTapState();
        openHostInfo(node);
        return;
      }
      if (node.type === 'submap') {
        openSubmap(node);
      }
      if (node.type === 'dashboard_picker') {
        openDashboardPicker(node);
      }
    },
    [editable, openDashboardPicker, openHostInfo, openNodeProperties, openSubmap, resetDoubleTapState]
  );

  const handleNodeMouseEnter = useCallback(
    (e: React.MouseEvent, node: TopologyNode) => {
      setLinkHoverId(node.id);
      if (!hostHoverEnabledRef.current || contextMenu) {
        return;
      }
      if (isHostNode(node) && node.zabbixHost?.trim()) {
        beginHostHover({ node, screenX: e.clientX, screenY: e.clientY });
      }
    },
    [beginHostHover, contextMenu]
  );

  const handleNodeMouseMove = useCallback(
    (e: React.MouseEvent, node: TopologyNode) => {
      if (!hostHoverEnabledRef.current || contextMenu) {
        return;
      }
      if (isHostNode(node) && node.zabbixHost?.trim()) {
        moveHostHover({ node, screenX: e.clientX, screenY: e.clientY });
      }
    },
    [contextMenu, moveHostHover]
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
    persist(removeLink(storedMap, selectedLink));
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
    hostProblems,
    resolveColor,
  });

  /**
   * Recorte por viewport.
   *
   * O retângulo é alinhado a uma grade grossa, então ele só muda ao cruzar uma linha dessa grade —
   * é isso que mantém pan e zoom sem re-render de camada. Bounds, fit, minimapa e seleção seguem
   * lendo `map.nodes` inteiro; só o que vai para o DOM é recortado.
   */
  /**
   * Tipos de ícone presentes no mapa, para o `<defs>`. Sai de `map.nodes` inteiro, e não dos nós
   * visíveis, para o símbolo não ser removido e remontado durante pan e zoom; `useStableIdentity`
   * segura a identidade da lista entre os refreshes de status.
   */
  const iconsInMap = useStableIdentity(
    useMemo(() => {
      const used = new Set<TopologyHostIcon>();
      for (const node of map.nodes) {
        if (isHostNode(node) && node.icon) {
          used.add(node.icon);
        }
      }
      return Array.from(used).sort();
    }, [map.nodes])
  );

  const cullingEnabled = map.nodes.length >= CULL_MIN_NODES;
  const { x0, y0, x1, y1 } = visibleWorldRect(view, viewport);
  const cullRect = useMemo<WorldRect>(() => ({ x0, y0, x1, y1 }), [x0, y0, x1, y1]);

  const visibleNodesRaw = useMemo(() => {
    if (!cullingEnabled) {
      return map.nodes;
    }
    return map.nodes.filter((node) => {
      const layout = nodeLayouts.get(node.id);
      // Nó ainda sem caixa medida continua montado — recortar pelo que não se sabe some com ele.
      return !layout || boxIntersectsRect(layout, cullRect);
    });
  }, [cullingEnabled, map.nodes, nodeLayouts, cullRect]);

  const culledRenderLinksRaw = useMemo(() => {
    if (!cullingEnabled) {
      return filteredRenderLinks;
    }
    return filteredRenderLinks.filter(({ link }) => {
      const box = linkBoundingBox(
        nodeLayouts.get(link.from),
        nodeLayouts.get(link.to),
        resolveLinkWaypoints(link)
      );
      return !box || boxIntersectsRect(box, cullRect);
    });
  }, [cullingEnabled, filteredRenderLinks, nodeLayouts, resolveLinkWaypoints, cullRect]);

  // `filter` devolve um array novo mesmo quando o recorte não mudou de conteúdo; sem isto a lista
  // recortada invalidaria o `React.memo` das camadas justamente durante o pan.
  const visibleNodes = useStableIdentity(visibleNodesRaw);
  const culledRenderLinks = useStableIdentity(culledRenderLinksRaw);

  /**
   * Handlers de identidade fixa para as camadas de nó.
   *
   * Cada um deles depende de seleção, modo de edição, layouts ou do estado do arraste, então troca
   * de identidade a quase todo render do canvas. Como descem como prop para cada forma memoizada,
   * essa troca sozinha invalidava o `React.memo` de todos os nós a cada refresh da Query.
   */
  const stableNodePointerDown = useStableCallback(onNodePointerDown);
  const stableNetworkPointerDown = useStableCallback(onNetworkPointerDown);
  const stableNodeClick = useStableCallback(onNodeClick);
  const stableNodeDoubleClick = useStableCallback(onNodeDoubleClick);
  const stableNodeContextMenu = useStableCallback(handleNodeContextMenuWithClear);
  const stableNodeMouseEnter = useStableCallback(handleNodeMouseEnter);
  const stableNodeMouseMove = useStableCallback(handleNodeMouseMove);
  const stableNodeMouseLeave = useStableCallback(handleNodeMouseLeave);
  const stableResizePointerDown = useStableCallback(onResizePointerDown);
  const stableResizePointerUp = useStableCallback(onPointerUp);

  const canvasClient = mapCanvasClientSize(viewport.w, viewport.h);

  return (
    <div
      ref={wrapRef}
      data-topology-canvas
      className={`${canvasStyles.wrap} ${panTool ? canvasStyles.wrapPan : canvasStyles.wrapSelect}${
        isFullscreen && chromeIdleHidden ? ` ${canvasStyles.chromeIdle}` : ''
      }`}
      onPointerDownCapture={(e) => {
        // Fase de captura — dispara mesmo quando um filho (nó, link, scrollbar) chama
        // stopPropagation() no pointerdown. Congela os dados do painel (useFrozenCanvasData)
        // até o pointerup/cancel, para um auto-refresh do dashboard não trocar cores/hosts/
        // posições no meio do arraste.
        isGestureActiveRef.current = true;
        // Clique na faixa da barra de rolagem nativa (o SVG não cobre a gutter; o alvo aqui
        // só é o próprio `scrollPane` quando o clique cai na faixa da scrollbar). A
        // `scrollLeft/scrollTop` já é a fonte de verdade durante esse arraste — suspende só o
        // "sync view -> scrollLeft" (efeito passivo em `useMapContentScroll`) pra não competir com
        // o drag nativo e causar o "pulo".
        if (e.target === scrollRef.current) {
          suspendScrollSyncRef.current = true;
        }
      }}
      onMouseDown={stopScrollbarBubble}
      onClick={stopScrollbarBubble}
      onPointerDown={handleWrapPointerDown}
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
        onMapNavigateHome={
          onMapNavigateHome ? () => onMapNavigateHome(viewRef.current) : undefined
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
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => void toggleFullscreen()}
        showMinimap={showMinimap}
        onToggleMinimap={() => onShowMinimapChange?.(!showMinimap)}
        showLegend={showLegend}
        onToggleLegend={handleToggleShowLegend}
        showHostAlertList={showHostAlertList}
        onToggleHostAlertList={!effectiveNocMode ? handleToggleShowHostAlertList : undefined}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        onSearchFocusNode={focusNodeOnMap}
        hostMetadata={hostMetadata}
        queryError={Boolean(queryError)}
        queryLoading={liveQueryLoading && !liveQueryReady && !liveQueryError}
        onInsertBlueprint={canEditCanvas && !effectiveNocMode ? () => setBlueprintOpen(true) : undefined}
      />

      {!effectiveNocMode && showHostAlertList ? (
        <TopologyHostAlertList
          entries={alertHostEntries}
          colorOffline={resolveColor(options.colorOffline)}
          colorAlert={resolveColor(options.colorAlert)}
          queryReady={queryReady}
          showMinimap={minimapVisible}
          onFocusHost={handleSelectHostFromList}
        />
      ) : null}

      {effectiveNocMode && !hideOverlayControls ? (
        <TopologyNocPanel
          entries={nocHostEntries}
          activeFilters={activeFilters}
          queryReady={queryReady}
          showMinimap={minimapVisible}
          onToggleFilter={toggleFilter}
          onSelectHost={handleNocSelectHost}
        />
      ) : null}

      <div
        ref={bindScrollRef}
        className={canvasStyles.scrollPane}
        data-map-wheel-overlay
        onScroll={onScroll}
      >
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
        width={canvasClient.w > 0 ? canvasClient.w : '100%'}
        height={canvasClient.h > 0 ? canvasClient.h : '100%'}
        onContextMenu={(e) => handleContextMenu(e)}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
          <LinkMarkers
            colorLink={resolveColor(options.colorLink)}
            colorLinkAttention={resolveColor(options.colorLinkAttention)}
            colorLinkHigh={resolveColor(options.colorLinkHigh)}
            colorLinkCongestion={resolveColor(options.colorLinkCongestion)}
            colorOffline={resolveColor(options.colorOffline)}
          />
          <HostIconDefs icons={iconsInMap} />
          <CanvasGridLayer
            bounds={gridBounds}
            verticalLines={gridVerticalLines}
            horizontalLines={gridHorizontalLines}
            isMajorLine={isMajorGridLine}
            showGrid={Boolean(options.showGrid)}
            grabCursor={panTool && Boolean(options.enablePan)}
            onPointerDown={onCanvasPointerDown}
            onContextMenu={handleContextMenu}
          />

          <NetworkNodesLayer
            nodes={visibleNodes}
            nodeLayouts={nodeLayouts}
            regionStats={regionStats}
            options={options}
            queryReady={queryReady}
            resolveColor={resolveColor}
            selectedNodeIds={selectedNodeIds}
            panTool={panTool}
            editable={viewEditable}
            networksLocked={networksLocked}
            onPointerDown={stableNetworkPointerDown}
            onDoubleClick={stableNodeDoubleClick}
            onContextMenu={stableNodeContextMenu}
            onResizePointerDown={stableResizePointerDown}
            onResizePointerUp={stableResizePointerUp}
          />

          <LinksLayer
            renderLinks={culledRenderLinks}
            nodeLayouts={nodeLayouts}
            options={options}
            editable={viewEditable}
            panTool={panTool}
            selectedLink={selectedLink}
            hoveredLinkKey={hoveredLinkKey}
            setHoveredLinkKey={setHoveredLinkKey}
            resolveLinkWaypoints={resolveLinkWaypoints}
            linkMetricsByLink={linkMetricsByLink}
            hostDisplay={hostDisplay}
            hostMetadata={hostMetadata}
            onLinkSelect={onLinkSelect}
            onLinkContextMenu={(e, link) => handleContextMenu(e, { link })}
            beginPan={beginPan}
            beginWaypointDragFromPath={beginWaypointDragFromPath}
            removeWaypointNearPointer={removeWaypointNearPointer}
          />

          <CanvasSelectionShapes guides={alignGuides} marqueeRect={marqueeRect} />

          <NetworkLabelsLayer
            nodes={visibleNodes}
            nodeLayouts={nodeLayouts}
            options={options}
            resolveColor={resolveColor}
            selectedNodeIds={selectedNodeIds}
          />

          <HostNodesLayer
            nodes={visibleNodes}
            nodeLayouts={nodeLayouts}
            regionStats={regionStats}
            options={options}
            queryReady={queryReady}
            hostDisplay={hostDisplay}
            hostMetadata={hostMetadata}
            badgesByNode={hostBadgesByNode}
            activeFilters={activeFilters}
            filterContext={filterContext}
            resolveColor={resolveColor}
            selectedNodeIds={selectedNodeIds}
            selectedLink={selectedLink}
            linkFromId={linkFromId}
            linkHoverId={linkHoverId}
            panTool={panTool}
            editable={viewEditable}
            onPointerDown={stableNodePointerDown}
            onClick={stableNodeClick}
            onDoubleClick={stableNodeDoubleClick}
            onContextMenu={stableNodeContextMenu}
            onMouseEnter={stableNodeMouseEnter}
            onMouseMove={stableNodeMouseMove}
            onMouseLeave={stableNodeMouseLeave}
            onResizePointerDown={stableResizePointerDown}
            onResizePointerUp={stableResizePointerUp}
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
        contextMenu={contextMenu}
        onCloseContextMenu={closeContextMenu}
        canvasMenuItems={canvasMenuItems}
        nodeMenuItems={nodeMenuItems}
        linkMenuItems={linkMenuItems}
      />

      <CanvasModals
        storedMap={storedMap}
        nodeLayouts={nodeLayouts}
        options={options}
        persist={persist}
        showToast={showToast}
        modals={modals}
        bulk={bulk}
        queryHostOptions={queryHostOptions}
        zabbixDatasourceUid={zabbixDatasourceUid}
        queryData={queryData}
        hoverByHost={hoverByHost}
        hostMetadata={hostMetadata}
        hostDisplay={hostDisplay}
        hostProblems={hostProblems}
        queryReady={queryReady}
        pingTarget={pingTarget}
        setPingTarget={setPingTarget}
        hostHover={hostHover}
        contextMenuOpen={Boolean(contextMenu)}
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
