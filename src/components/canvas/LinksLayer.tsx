import React, { MutableRefObject, useRef } from 'react';
import { HostDisplayMap, HostMetadataMap, LinkRuntimeMetrics, TopologyLink, TopologyNode, TopologyPanelOptions } from '../../types';
import { DragPreview } from '../../utils/dragState';
import { LinkPoint } from '../../utils/linkGeometry';
import { linkKey } from '../../utils/mapLinkEdits';
import { isHostNodeOffline } from '../../utils/networkStats';
import { NodeLayout } from '../../utils/nodeLayout';
import { LinkLine } from './links/LinkLine';
import { LinkTrafficOverlay } from './links/LinkTrafficLabel';

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
  linkMetricsByLink: Record<string, LinkRuntimeMetrics>;
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

/** Todos os cabos do mapa, já filtrados e ordenados por `useRenderLinks`. */
function LinksLayerComponent({
  renderLinks,
  nodeLayouts,
  options,
  interactionRef,
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
  flowAnimateBudget,
}: Props) {
  // Fora do laço: `linkKey` monta e concatena seis campos, e a chave do selecionado não muda de
  // um cabo para o outro.
  const selectedKey = selectedLink ? linkKey(selectedLink) : null;
  const metricsLiveRef = useRef(linkMetricsByLink);
  metricsLiveRef.current = linkMetricsByLink;
  const gridStep = options.gridSize ?? 10;
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
          runtimeMetrics={linkMetricsByLink[lk]}
          metricsLiveRef={metricsLiveRef}
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
            if (!interactionRef.current.editable) {
              return;
            }
            e.stopPropagation();
            removeWaypointNearPointer(e, link);
          }}
        />
        );
      })}
      {renderLinks.map(({ link, key, bundleOffset }) => {
        const from = nodeLayouts.get(link.from);
        const to = nodeLayouts.get(link.to);
        if (!from || !to) {
          return <React.Fragment key={`traffic-${key}`} />;
        }
        return (
          <LinkTrafficOverlay
            key={`traffic-${key}`}
            from={from}
            to={to}
            gridStep={gridStep}
            waypoints={resolveLinkWaypoints(link)}
            bundleOffset={bundleOffset}
            link={link}
            runtimeMetrics={linkMetricsByLink[linkKey(link)]}
            options={options}
          />
        );
      })}
    </>
  );
}

/**
 * Memoizado por comparação rasa: durante pan, zoom ou arraste de um nó sem cabo, nenhuma prop muda
 * e a camada inteira é pulada. `dragPreview` entra na comparação para o arraste de waypoint —
 * nesse gesto `nodeLayouts` não muda, mas a rota provisória mora no store de gesto.
 *
 * Handlers precisam chegar com identidade fixa (`useStableCallback` em `TopologyCanvas`) — prop de
 * função recriada no pai anula o memo.
 */
export const LinksLayer = React.memo(LinksLayerComponent);
