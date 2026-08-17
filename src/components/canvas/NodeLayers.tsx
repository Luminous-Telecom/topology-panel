import React from 'react';
import {
  HostDisplayMap,
  HostMetadataMap,
  LinkRuntimeMetricsMap,
  TopologyLink,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
} from '../../types';
import { HostProblemsMap, TopologyMapFilterId } from '../../utils/noc/types';
import { resolveHostNodeBadges } from '../../utils/noc/hostBadges';
import { isNodeVisibleForFilters, TopologyFilterContext } from '../../utils/noc/topologyFilters';
import { RegionHostStats } from '../../utils/networkStats';
import { isHostNode } from '../../utils/topologyNodes';
import { ColorResolver } from '../../utils/nodeFillColors';
import { NodeLayout } from '../../utils/nodeLayout';
import { HostNodeShape } from './HostNodeShape';
import { NetworkNodeShape } from './NetworkNodeShape';

interface CommonProps {
  nodes: TopologyNode[];
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  regionStats: Map<string, RegionHostStats>;
  options: TopologyPanelOptions;
  queryReady?: boolean;
  resolveColor: ColorResolver;
  selectedNodeIds: string[];
  panTool: boolean;
  editable: boolean;
  onDoubleClick: (e: React.MouseEvent, node: TopologyNode) => void;
  onContextMenu: (e: React.MouseEvent, node: TopologyNode) => void;
  onResizePointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
  onResizePointerUp: (e: React.PointerEvent) => void;
}

interface NetworkNodesLayerProps extends CommonProps {
  networksLocked: boolean;
  onPointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
}

/** Camada de baixo: as caixas de rede, desenhadas atrás dos cabos e dos hosts. */
export function NetworkNodesLayer({
  nodes,
  nodeLayouts,
  regionStats,
  options,
  queryReady,
  resolveColor,
  selectedNodeIds,
  panTool,
  editable,
  networksLocked,
  onPointerDown,
  onDoubleClick,
  onContextMenu,
  onResizePointerDown,
  onResizePointerUp,
}: NetworkNodesLayerProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type !== 'network') {
          return null;
        }
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
            onPointerDown={onPointerDown}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onResizePointerDown={onResizePointerDown}
            onResizePointerUp={onResizePointerUp}
          />
        );
      })}
    </>
  );
}

interface HostNodesLayerProps extends CommonProps {
  map: TopologyMap;
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  hostProblems?: HostProblemsMap;
  linkMetricsByLink?: LinkRuntimeMetricsMap;
  activeFilters?: ReadonlySet<TopologyMapFilterId>;
  filterContext?: TopologyFilterContext;
  showHostBadges?: boolean;
  selectedLink: TopologyLink | null;
  linkFromId: string | null;
  linkHoverId: string | null;
  onPointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
  onClick: (e: React.MouseEvent, node: TopologyNode) => void;
  onMouseEnter: (e: React.MouseEvent, node: TopologyNode) => void;
  onMouseMove: (e: React.MouseEvent, node: TopologyNode) => void;
  onMouseLeave: (e: React.MouseEvent, node: TopologyNode) => void;
}

/** Camada de cima: hosts, submapas, estáticos e seletores de dashboard. */
export function HostNodesLayer({
  map,
  nodes,
  nodeLayouts,
  regionStats,
  options,
  queryReady,
  hostDisplay,
  hostMetadata,
  hostProblems,
  linkMetricsByLink,
  activeFilters,
  filterContext,
  showHostBadges,
  resolveColor,
  selectedNodeIds,
  selectedLink,
  linkFromId,
  linkHoverId,
  panTool,
  editable,
  onPointerDown,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  onResizePointerDown,
  onResizePointerUp,
}: HostNodesLayerProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === 'network') {
          return null;
        }
        const layout = nodeLayouts.get(node.id);
        if (!layout) {
          return null;
        }
        const dimmed =
          activeFilters?.size && filterContext
            ? !isNodeVisibleForFilters(node, activeFilters, filterContext)
            : false;
        const badges =
          showHostBadges && isHostNode(node)
            ? resolveHostNodeBadges({
                node,
                map,
                hostDisplay,
                hostMetadata,
                hostProblems,
                linkMetrics: linkMetricsByLink,
              })
            : [];
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
            badges={badges}
            dimmed={dimmed}
            isSelected={selectedNodeIds.includes(node.id)}
            isSelectedLinkEndpoint={
              selectedLink !== null && (node.id === selectedLink.from || node.id === selectedLink.to)
            }
            isLinkSource={linkFromId === node.id}
            isLinkTarget={linkFromId !== null && linkHoverId === node.id}
            linkMode={linkFromId !== null}
            panTool={panTool}
            editable={editable}
            onPointerDown={onPointerDown}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onMouseEnter={onMouseEnter}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            onResizePointerDown={onResizePointerDown}
            onResizePointerUp={onResizePointerUp}
          />
        );
      })}
    </>
  );
}
