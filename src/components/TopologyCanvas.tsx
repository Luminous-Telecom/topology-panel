import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelData } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import {
  CanvasTool,
  HostDisplayMap,
  HostMetadataMap,
  TopologyHostIcon,
  TopologyLink,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
  TopologyView,
} from '../types';
import { addLinkToMap, addZabbixHostAt, areNetworksLocked, rebindZabbixHost, clientToMapCoords, linkKey, removeLinkByEndpoints, removeNodesFromMap, toggleMapLock, toggleNetworksLock, updateLinkProps, updateStoredNode, updateHostsIconBulk, updateHostsCredentialsBulk, updateSubmapsBulk } from '../utils/mapEdits';
import { resolveHostIp, resolveHostLayoutKey } from '../utils/hostLookup';
import { clamp, snapToGrid } from '../utils/mapCoords';
import { upsertHostLayout, withLiveZabbixMeta } from '../utils/mapSync';
import { computeNetworkLayout, computeNodeLayout, computeStaticLayout, NodeLayout } from '../utils/nodeLayout';
import { QueryHostOption } from '../utils/queryHostPicker';
import { findNodeById, isHostNode } from '../utils/topologyNodes';
import { HOST_ICON_LABELS } from '../utils/hostIcons';
import { resolvePanelColor } from '../utils/panelColors';
import { resolveNetworkFill, resolveNodeFill } from '../utils/nodeFillColors';
import { AlignGuideLine } from '../utils/alignGuides';
import { buildRegionStatsMap, formatRegionStats, regionStrokeColor } from '../utils/networkStats';
import { isNetworkNode, computeTopologyContentBounds } from '../utils/mapBounds';
import { useMapContentScroll } from '../hooks/useMapContentScroll';
import { useDeferredDuringGesture } from '../hooks/useDeferredDuringGesture';
import { TopologyContextMenu } from './TopologyContextMenu';
import { canvasStyles } from './canvas/canvasStyles';
import { HostNodeShape } from './canvas/HostNodeShape';
import { LinkLine } from './canvas/LinkLine';
import { LinkMarkers } from './canvas/LinkMarkers';
import { NetworkNodeShape } from './canvas/NetworkNodeShape';
import { TopologyColorLegend } from './canvas/TopologyColorLegend';
import { TopologyQueryErrorBadge } from './canvas/TopologyQueryErrorBadge';
import { TopologyToast } from './canvas/TopologyToast';
import { TopologyToolbar } from './canvas/TopologyToolbar';
import { DashboardNavButton } from './DashboardNavButton';
import { DashboardPickerModal, openDashboardUrl } from './DashboardPickerModal';
import type { NodeEditSavePayload } from './NodeEditModal';
import { HostHoverPopover } from './HostHoverPopover';
import {
  BulkHostCredentialsModal,
  BulkHostIconModal,
  BulkSubmapEditModal,
  LinkEditModal,
  NodeEditModal,
  PingModal,
  ZabbixHostPickerModal,
} from './lazyModals';
import { TopologyMinimap } from './TopologyMinimap';
import { LinkPoint, nearestWaypointIndex } from '../utils/linkGeometry';
import { hasTopologyClipboard } from '../utils/topologyClipboard';
import { useGridLines } from '../hooks/useGridLines';
import { useLinkFlowAnimation } from '../hooks/useLinkFlowAnimation';
import { useTopologySelection } from '../hooks/useTopologySelection';
import { useBulkEditModals } from '../hooks/useBulkEditModals';
import { nodeSupportsProperties, useNodePropertiesModals } from '../hooks/useNodePropertiesModals';
import { useTopologyClipboardActions } from '../hooks/useTopologyClipboardActions';
import { useTopologyViewport } from '../hooks/useTopologyViewport';
import { useTopologyDragController } from '../hooks/useTopologyDragController';
import { useHostHoverTarget } from '../hooks/useHostHoverTarget';
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
}

type ContextState = {
  screenX: number;
  screenY: number;
  mapX: number;
  mapY: number;
  node?: TopologyNode;
  link?: TopologyLink;
};

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
    // `options` inteiro não entra: o layout só depende de `layoutOpts` (fonte/subtítulo). Com o
    // objeto inteiro nas deps, qualquer opção do painel (cor, toggle de minimapa) remedia o layout
    // de todos os nós sem necessidade.
  }, [map.nodes, layoutOpts, dragPreview, hostDisplay, hostDisplayByRefId, submapHosts, hostMetadata, queryReady]);

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

  /**
   * Links na ordem de desenho (selecionado por último, para ficar por cima), com uma chave estável
   * por link. A chave não pode ser o índice do array ordenado: selecionar um cabo reordena a lista
   * e faria o React remontar todos os `LinkLine` em vez de atualizar o que mudou.
   */
  const renderLinks = useMemo(() => {
    const occurrences = new Map<string, number>();
    const keyed = validLinks.map((link) => {
      const base = linkKey(link);
      const seen = occurrences.get(base) ?? 0;
      occurrences.set(base, seen + 1);
      return { link, key: seen === 0 ? base : `${base}#${seen}` };
    });
    const selectedKey = selectedLink ? linkKey(selectedLink) : null;
    return keyed.sort((a, b) => {
      const aActive = selectedKey === linkKey(a.link) ? 1 : 0;
      const bActive = selectedKey === linkKey(b.link) ? 1 : 0;
      return aActive - bActive;
    });
  }, [validLinks, selectedLink]);

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

  /** Entra no modo link sem origem: o próximo clique num nó define o ponto de partida. */
  const beginLinkFromCanvas = useCallback(() => setLinkFromId(''), []);

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

  /**
   * Handlers por nó ficam aqui e recebem o nó como argumento: se fossem criados dentro do `.map()`
   * do render, cada nó ganharia uma função nova a cada render e a memoização das formas cairia.
   */
  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: TopologyNode) => handleContextMenu(e, { node }),
    [handleContextMenu]
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
    openAddHost: setAddHostAt,
    openLinkEdit: setEditLink,
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
      const region = regionStats.get(node.id);
      if (isNetworkNode(node)) {
        return resolveNetworkFill(node, region, options, queryReady, resolveColor);
      }
      return resolveNodeFill(
        node,
        node.type === 'submap' ? region : undefined,
        options,
        queryReady,
        hostMetadata,
        hostDisplay,
        resolveColor
      );
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
      className={`${canvasStyles.wrap} ${panTool ? canvasStyles.wrapPan : canvasStyles.wrapSelect}`}
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
      {!hideOverlayControls && (
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
      )}

      {!hideOverlayControls && options.showDashboardNav !== false && (
        <DashboardNavButton
          label={options.dashboardNavLabel?.trim() || 'Dashboards'}
          choices={options.dashboardNavChoices ?? []}
        />
      )}

      <TopologyQueryErrorBadge visible={queryError} />

      {editable && showEmptyHint && (
        <div className={canvasStyles.empty} style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
          Clique com o <strong>botão direito</strong> para adicionar dispositivos, redes, submapas, seletores e links. Hosts
          Zabbix vêm da aba <strong>Query</strong>.
        </div>
      )}

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
              return (
                <NetworkNodeShape
                  key={node.id}
                  node={node}
                  layout={layout}
                  stats={regionStats.get(node.id)}
                  options={options}
                  queryReady={queryReady}
                  resolveColor={resolveColor}
                  isSelected={selectedNodeIds.includes(node.id)}
                  panTool={panTool}
                  editable={editable}
                  networksLocked={networksLocked}
                  onPointerDown={onNetworkPointerDown}
                  onDoubleClick={onNodeDoubleClick}
                  onContextMenu={handleNodeContextMenu}
                  onResizePointerDown={onResizePointerDown}
                  onResizePointerUp={onPointerUp}
                />
              );
            })}

          {renderLinks.map(({ link, key }) => (
            <LinkLine
              key={key}
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
              return (
                <HostNodeShape
                  key={node.id}
                  node={node}
                  layout={layout}
                  region={node.type === 'submap' ? regionStats.get(node.id) : undefined}
                  options={options}
                  queryReady={queryReady}
                  hostDisplay={hostDisplay}
                  hostMetadata={hostMetadata}
                  resolveColor={resolveColor}
                  isSelected={selectedNodeIds.includes(node.id)}
                  isSelectedLinkEndpoint={
                    selectedLink !== null && (node.id === selectedLink.from || node.id === selectedLink.to)
                  }
                  isLinkSource={linkFromId === node.id}
                  isLinkTarget={linkFromId !== null && linkHoverId === node.id}
                  linkMode={linkFromId !== null}
                  panTool={panTool}
                  editable={editable}
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
          zabbixMetadataLoading={zabbixMetadataLoading}
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
