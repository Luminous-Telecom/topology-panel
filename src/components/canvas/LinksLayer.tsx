import React, { MutableRefObject } from 'react';
import { HostDisplayMap, HostMetadataMap, LinkRuntimeMetrics, TopologyLink, TopologyNode, TopologyPanelOptions } from '../../types';
import { DragPreview } from '../../utils/dragState';
import { LinkPoint } from '../../utils/linkGeometry';
import { linkKey } from '../../utils/mapLinkEdits';
import { isHostNodeOffline } from '../../utils/networkStats';
import { NodeLayout } from '../../utils/nodeLayout';
import { LinkLine } from './links/LinkLine';

interface Props {
  renderLinks: Array<{ link: TopologyLink; key: string; bundleOffset: number }>;
  /** Preview do gesto — invalida o memo quando só a rota do cabo muda (waypoints). */
  dragPreview: DragPreview;
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  options: TopologyPanelOptions;
  interactionRef: MutableRefObject<{ editable: boolean; panTool: boolean }>;
  selectedLink: TopologyLink | null;
  hoveredLinkKey: string | null;
  setHoveredLinkKey: (key: string | null) => void;
  resolveLinkWaypoints: (link: TopologyLink) => LinkPoint[];
  linkPaintMetricsByLink: Record<string, LinkRuntimeMetrics>;
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  /** Máximo de cabos com faixas animadas (orçamento de performance). */
  flowAnimateBudget: number;
  onLinkSelect: (link: TopologyLink) => void;
  onLinkContextMenu: (e: React.MouseEvent, link: TopologyLink) => void;
  beginPan: (e: React.PointerEvent, node?: TopologyNode, link?: TopologyLink) => void;
  beginWaypointDragFromPath: (e: React.PointerEvent, link: TopologyLink) => void;
  removeWaypointNearPointer: (e: React.MouseEvent, link: TopologyLink) => void;
}

/** Cabos do mapa (linha + animação) — pílulas de bps ficam em `LinkTrafficOverlaysLayer`. */
function LinksLayerComponent({
  renderLinks,
  nodeLayouts,
  options,
  interactionRef,
  selectedLink,
  hoveredLinkKey,
  setHoveredLinkKey,
  resolveLinkWaypoints,
  linkPaintMetricsByLink,
  hostDisplay,
  hostMetadata,
  onLinkSelect,
  onLinkContextMenu,
  beginPan,
  beginWaypointDragFromPath,
  removeWaypointNearPointer,
  flowAnimateBudget,
}: Props) {
  const selectedKey = selectedLink ? linkKey(selectedLink) : null;
  return (
    <>
      {renderLinks.map(({ link, key, bundleOffset }, index) => {
        const lk = linkKey(link);
        return (
        <LinkLine
          key={key}
          link={link}
          waypoints={resolveLinkWaypoints(link)}
          bundleOffset={bundleOffset}
          nodeLayouts={nodeLayouts}
          options={options}
          selected={selectedKey === lk}
          hovered={hoveredLinkKey === lk}
          runtimeMetrics={linkPaintMetricsByLink[lk]}
          fromHostOffline={isHostNodeOffline(nodeLayouts.get(link.from), hostDisplay, hostMetadata)}
          toHostOffline={isHostNodeOffline(nodeLayouts.get(link.to), hostDisplay, hostMetadata)}
          flowAnimate={index < flowAnimateBudget}
          onSelect={() => {
            const { panTool, editable } = interactionRef.current;
            if (!panTool && !editable) {
              onLinkSelect(link);
            }
          }}
          onHoverChange={(active) => setHoveredLinkKey(active ? lk : null)}
          onContextMenu={(e) => onLinkContextMenu(e, link)}
          onPathPointerDown={(e) => {
            const { panTool, editable } = interactionRef.current;
            if (panTool || !editable) {
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
            if (!interactionRef.current.editable) {
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

export const LinksLayer = React.memo(LinksLayerComponent);
