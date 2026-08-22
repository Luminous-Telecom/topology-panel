import React, { useMemo } from 'react';
import {
  HostDisplayMap,
  HostMetadataMap,
  TopologyLink,
  TopologyNode,
  TopologyPanelOptions,
} from '../../types';
import { HostNodeBadge, TopologyMapFilterId } from '../../utils/noc/types';
import { isNodeVisibleForFilters, TopologyFilterContext } from '../../utils/noc/topologyFilters';
import { RegionHostStats } from '../../utils/networkStats';
import { ColorResolver } from '../../utils/nodeFillColors';
import { NodeLayout } from '../../utils/nodeLayout';
import { HostNodeShape } from './HostNodeShape';
import { NetworkNodeShape } from './NetworkNodeShape';

/** Array compartilhado: identidade estável para o `React.memo` do nó sem badge. */
const NO_BADGES: HostNodeBadge[] = [];

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
function NetworkNodesLayerComponent({
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
  const selectedIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

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
            isSelected={selectedIdSet.has(node.id)}
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

/** Pan, zoom, hover e seleção de cabo não mexem nas caixas de rede — não redesenha a camada. */
export const NetworkNodesLayer = React.memo(NetworkNodesLayerComponent);

interface HostNodesLayerProps extends CommonProps {
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  /** Badges já resolvidos por nó (`buildHostNodeBadgeMap`) — ausente quando desligados. */
  badgesByNode?: ReadonlyMap<string, HostNodeBadge[]>;
  activeFilters?: ReadonlySet<TopologyMapFilterId>;
  filterContext?: TopologyFilterContext;
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
function HostNodesLayerComponent({
  nodes,
  nodeLayouts,
  regionStats,
  options,
  queryReady,
  hostDisplay,
  hostMetadata,
  badgesByNode,
  activeFilters,
  filterContext,
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
  const selectedIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

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
        const badges = badgesByNode?.get(node.id) ?? NO_BADGES;
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
            hostProblems={filterContext?.hostProblems}
            resolveColor={resolveColor}
            badges={badges}
            dimmed={dimmed}
            isSelected={selectedIdSet.has(node.id)}
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

/** Pan e zoom não mudam nenhuma prop da camada — o SVG dos nós não é remontado no gesto. */
export const HostNodesLayer = React.memo(HostNodesLayerComponent);
