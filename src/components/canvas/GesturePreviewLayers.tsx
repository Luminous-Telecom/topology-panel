import React, { MutableRefObject, useMemo } from 'react';
import {
  HostDisplayMap,
  HostMetadataMap,
  LinkRuntimeMetricsMap,
  TopologyLink,
  TopologyNode,
  TopologyPanelOptions,
} from '../../types';
import { useCanvasGestureUi } from '../../hooks/useCanvasGestureUi';
import { CanvasGestureStore } from '../../utils/canvasGestureStore';
import { applyDragPreviewToLayouts } from '../../utils/dragPreviewLayouts';
import { LinkPoint } from '../../utils/linkGeometry';
import { RegionHostStats } from '../../utils/networkStats';
import { ColorResolver } from '../../utils/nodeFillColors';
import { NodeLayout } from '../../utils/nodeLayout';
import { HostNodeBadge, TopologyMapFilterId } from '../../utils/noc/types';
import { TopologyFilterContext } from '../../utils/noc/topologyFilters';
import { CanvasSelectionShapes } from './CanvasSelectionShapes';
import { LinksLayer } from './LinksLayer';
import { LinkTrafficOverlaysLayer } from './links/LinkTrafficOverlaysLayer';
import { HostNodesLayer, NetworkLabelsLayer, NetworkNodesLayer } from './NodeLayers';

interface Props {
  store: CanvasGestureStore;
  nodes: TopologyNode[];
  baseNodeLayouts: Map<string, NodeLayout & TopologyNode>;
  regionStats: Map<string, RegionHostStats>;
  /** Só submapas — o tráfego das redes não pode invalidar o memo da camada de hosts. */
  hostRegionStats: Map<string, RegionHostStats>;
  options: TopologyPanelOptions;
  queryReady?: boolean;
  queryLoading?: boolean;
  resolveColor: ColorResolver;
  selectedNodeIds: string[];
  interactionRef: MutableRefObject<{ editable: boolean; panTool: boolean }>;
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  badgesByNode?: ReadonlyMap<string, HostNodeBadge[]>;
  activeFilters?: ReadonlySet<TopologyMapFilterId>;
  filterContext?: TopologyFilterContext;
  selectedLink: TopologyLink | null;
  linkFromId: string | null;
  linkHoverId: string | null;
  renderLinks: Array<{ link: TopologyLink; key: string; bundleOffset: number }>;
  hoveredLinkKey: string | null;
  setHoveredLinkKey: (key: string | null) => void;
  resolveLinkWaypoints: (link: TopologyLink) => LinkPoint[];
  linkPaintMetricsByLink: LinkRuntimeMetricsMap;
  onNetworkPointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
  onNodePointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
  onNodeClick: (e: React.MouseEvent, node: TopologyNode) => void;
  onNodeDoubleClick: (e: React.MouseEvent, node: TopologyNode) => void;
  onNodeContextMenu: (e: React.MouseEvent, node: TopologyNode) => void;
  onNodeMouseEnter: (e: React.MouseEvent, node: TopologyNode) => void;
  onNodeMouseMove: (e: React.MouseEvent, node: TopologyNode) => void;
  onNodeMouseLeave: (e: React.MouseEvent, node: TopologyNode) => void;
  onResizePointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
  onResizePointerUp: (e: React.PointerEvent) => void;
  onLinkSelect: (link: TopologyLink) => void;
  onLinkContextMenu: (e: React.MouseEvent, link: TopologyLink) => void;
  beginPan: (e: React.PointerEvent, node?: TopologyNode, link?: TopologyLink) => void;
  beginWaypointDragFromPath: (e: React.PointerEvent, link: TopologyLink) => void;
  removeWaypointNearPointer: (e: React.MouseEvent, link: TopologyLink) => void;
}

/**
 * Camadas que acompanham o preview do gesto (arraste, resize, laço, guias).
 *
 * Assinam o store em vez de estado do `TopologyCanvas`: o pointermove não remonta toolbar,
 * minimapa nem os hooks do painel — só estas formas, e o `React.memo` de cada nó/cabo ainda
 * pula quem não se moveu.
 */
export function GesturePreviewLayers({
  store,
  nodes,
  baseNodeLayouts,
  regionStats,
  hostRegionStats,
  options,
  queryReady,
  queryLoading,
  resolveColor,
  selectedNodeIds,
  interactionRef,
  hostDisplay,
  hostMetadata,
  badgesByNode,
  activeFilters,
  filterContext,
  selectedLink,
  linkFromId,
  linkHoverId,
  renderLinks,
  hoveredLinkKey,
  setHoveredLinkKey,
  resolveLinkWaypoints,
  linkPaintMetricsByLink,
  onNetworkPointerDown,
  onNodePointerDown,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onNodeMouseEnter,
  onNodeMouseMove,
  onNodeMouseLeave,
  onResizePointerDown,
  onResizePointerUp,
  onLinkSelect,
  onLinkContextMenu,
  beginPan,
  beginWaypointDragFromPath,
  removeWaypointNearPointer,
}: Props) {
  const { dragPreview, alignGuides, marqueeRect } = useCanvasGestureUi(store);
  const nodeLayouts = useMemo(
    () => applyDragPreviewToLayouts(baseNodeLayouts, dragPreview),
    [baseNodeLayouts, dragPreview]
  );

  return (
    <>
      <NetworkNodesLayer
        nodes={nodes}
        nodeLayouts={nodeLayouts}
        regionStats={regionStats}
        options={options}
        queryReady={queryReady}
        queryLoading={queryLoading}
        resolveColor={resolveColor}
        selectedNodeIds={selectedNodeIds}
        onPointerDown={onNetworkPointerDown}
        onDoubleClick={onNodeDoubleClick}
        onContextMenu={onNodeContextMenu}
        onResizePointerDown={onResizePointerDown}
        onResizePointerUp={onResizePointerUp}
      />

      <LinksLayer
        renderLinks={renderLinks}
        dragPreview={dragPreview}
        nodeLayouts={nodeLayouts}
        options={options}
        interactionRef={interactionRef}
        selectedLink={selectedLink}
        hoveredLinkKey={hoveredLinkKey}
        setHoveredLinkKey={setHoveredLinkKey}
        resolveLinkWaypoints={resolveLinkWaypoints}
        linkPaintMetricsByLink={linkPaintMetricsByLink}
        hostDisplay={hostDisplay}
        hostMetadata={hostMetadata}
        onLinkSelect={onLinkSelect}
        onLinkContextMenu={onLinkContextMenu}
        beginPan={beginPan}
        beginWaypointDragFromPath={beginWaypointDragFromPath}
        removeWaypointNearPointer={removeWaypointNearPointer}
      />

      <LinkTrafficOverlaysLayer
        renderLinks={renderLinks}
        nodeLayouts={nodeLayouts}
        gridStep={options.gridSize ?? 10}
        resolveLinkWaypoints={resolveLinkWaypoints}
        options={options}
      />

      <CanvasSelectionShapes guides={alignGuides} marqueeRect={marqueeRect} />

      <NetworkLabelsLayer
        nodes={nodes}
        nodeLayouts={nodeLayouts}
        options={options}
        resolveColor={resolveColor}
        selectedNodeIds={selectedNodeIds}
      />

      <HostNodesLayer
        nodes={nodes}
        nodeLayouts={nodeLayouts}
        regionStats={hostRegionStats}
        options={options}
        queryReady={queryReady}
        queryLoading={queryLoading}
        hostDisplay={hostDisplay}
        hostMetadata={hostMetadata}
        badgesByNode={badgesByNode}
        activeFilters={activeFilters}
        filterContext={filterContext}
        resolveColor={resolveColor}
        selectedNodeIds={selectedNodeIds}
        selectedLink={selectedLink}
        linkFromId={linkFromId}
        linkHoverId={linkHoverId}
        onPointerDown={onNodePointerDown}
        onClick={onNodeClick}
        onDoubleClick={onNodeDoubleClick}
        onContextMenu={onNodeContextMenu}
        onMouseEnter={onNodeMouseEnter}
        onMouseMove={onNodeMouseMove}
        onMouseLeave={onNodeMouseLeave}
        onResizePointerDown={onResizePointerDown}
        onResizePointerUp={onResizePointerUp}
      />
    </>
  );
}
