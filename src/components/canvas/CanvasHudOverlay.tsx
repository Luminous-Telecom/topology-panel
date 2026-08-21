import React from 'react';
import { TopologyLink, TopologyMap, TopologyNode, TopologyView } from '../../types';
import { NodeLayout } from '../../utils/nodeLayout';
import { LegendItem } from '../../utils/legendItems';
import { ContextMenuItem, TopologyContextMenu } from '../TopologyContextMenu';
import { TopologyMinimap } from '../TopologyMinimap';
import { TopologyColorLegend } from './TopologyColorLegend';

interface ContextAnchor {
  screenX: number;
  screenY: number;
  node?: TopologyNode;
  link?: TopologyLink;
}

interface Props {
  showMinimap: boolean;
  map: TopologyMap;
  links: TopologyLink[];
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  view: TopologyView;
  viewport: { w: number; h: number };
  onViewChange: (view: TopologyView) => void;
  resolveNodeFill: (node: TopologyNode) => string;
  resolveNetworkStroke: (node: TopologyNode) => string;
  linkColor: string;
  showLegend: boolean;
  legendItems: LegendItem[];
  refreshIntervalSec?: number | null;
  refreshResetKey?: unknown;
  contextMenu: ContextAnchor | null;
  onCloseContextMenu: () => void;
  canvasMenuItems: () => ContextMenuItem[];
  nodeMenuItems: (node: TopologyNode) => ContextMenuItem[];
  linkMenuItems: (link: TopologyLink) => ContextMenuItem[];
}

/** Camada de interface sobre o mapa: minimapa, legenda e menu de contexto. */
export function CanvasHudOverlay({
  showMinimap,
  map,
  links,
  nodeLayouts,
  view,
  viewport,
  onViewChange,
  resolveNodeFill,
  resolveNetworkStroke,
  linkColor,
  showLegend,
  legendItems,
  refreshIntervalSec,
  refreshResetKey,
  contextMenu,
  onCloseContextMenu,
  canvasMenuItems,
  nodeMenuItems,
  linkMenuItems,
}: Props) {
  return (
    <>
      {showMinimap && (
        <TopologyMinimap
          map={map}
          nodes={map.nodes}
          links={links}
          nodeLayouts={nodeLayouts}
          view={view}
          viewport={viewport}
          onViewChange={onViewChange}
          resolveNodeFill={resolveNodeFill}
          resolveNetworkStroke={resolveNetworkStroke}
          linkColor={linkColor}
        />
      )}

      {showLegend && (
        <TopologyColorLegend
          items={legendItems}
          refreshIntervalSec={refreshIntervalSec}
          refreshResetKey={refreshResetKey}
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
          onClose={onCloseContextMenu}
        />
      )}
    </>
  );
}
