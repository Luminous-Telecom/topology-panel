import React from 'react';
import { HostDisplayMap, HostMetadataMap, LinkRuntimeMetrics, TopologyLink, TopologyNode, TopologyPanelOptions } from '../../types';
import { LinkPoint } from '../../utils/linkGeometry';
import { linkKey } from '../../utils/mapLinkEdits';
import { isHostNodeOffline } from '../../utils/networkStats';
import { NodeLayout } from '../../utils/nodeLayout';
import { LinkLine } from './LinkLine';

interface Props {
  renderLinks: Array<{ link: TopologyLink; key: string; bundleOffset: number }>;
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  options: TopologyPanelOptions;
  editable: boolean;
  panTool: boolean;
  selectedLink: TopologyLink | null;
  hoveredLinkKey: string | null;
  setHoveredLinkKey: (key: string | null) => void;
  resolveLinkWaypoints: (link: TopologyLink) => LinkPoint[];
  linkMetricsByLink: Record<string, LinkRuntimeMetrics>;
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  onLinkSelect: (link: TopologyLink) => void;
  onLinkContextMenu: (e: React.MouseEvent, link: TopologyLink) => void;
  beginPan: (e: React.PointerEvent, node?: TopologyNode, link?: TopologyLink) => void;
  beginWaypointDragFromPath: (e: React.PointerEvent, link: TopologyLink) => void;
  removeWaypointNearPointer: (e: React.MouseEvent, link: TopologyLink) => void;
}

/** Todos os cabos do mapa, já filtrados e ordenados por `useRenderLinks`. */
export function LinksLayer({
  renderLinks,
  nodeLayouts,
  options,
  editable,
  panTool,
  selectedLink,
  hoveredLinkKey,
  setHoveredLinkKey,
  resolveLinkWaypoints,
  linkMetricsByLink,
  hostDisplay,
  hostMetadata,
  onLinkSelect,
  onLinkContextMenu,
  beginPan,
  beginWaypointDragFromPath,
  removeWaypointNearPointer,
}: Props) {
  return (
    <>
      {renderLinks.map(({ link, key, bundleOffset }) => {
        const lk = linkKey(link);
        return (
        <LinkLine
          key={key}
          link={link}
          waypoints={resolveLinkWaypoints(link)}
          bundleOffset={bundleOffset}
          nodeLayouts={nodeLayouts}
          options={options}
          editable={editable}
          panTool={panTool}
          selected={Boolean(selectedLink && linkKey(selectedLink) === lk)}
          hovered={hoveredLinkKey === lk}
          runtimeMetrics={linkMetricsByLink[lk]}
          fromHostOffline={isHostNodeOffline(nodeLayouts.get(link.from), hostDisplay, hostMetadata)}
          toHostOffline={isHostNodeOffline(nodeLayouts.get(link.to), hostDisplay, hostMetadata)}
          onSelect={() => onLinkSelect(link)}
          onHoverChange={(active) => setHoveredLinkKey(active ? lk : null)}
          onContextMenu={(e) => onLinkContextMenu(e, link)}
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
            beginWaypointDragFromPath(e, link);
          }}
          onPathDoubleClick={(e) => {
            if (!editable) {
              return;
            }
            e.stopPropagation();
            removeWaypointNearPointer(e, link);
          }}
        />
        );
      })}
    </>
  );
}
