import React from 'react';
import { TopologyLink, TopologyNode, TopologyPanelOptions } from '../../../types';
import { useLinkMetricsLiveStore } from '../../../hooks/linkMetricsLiveStore';
import { LinkPoint } from '../../../utils/linkGeometry';
import { linkKey } from '../../../utils/mapLinkEdits';
import { NodeLayout } from '../../../utils/nodeLayout';
import { LinkTrafficOverlay } from './LinkTrafficLabel';

interface Props {
  renderLinks: Array<{ link: TopologyLink; key: string; bundleOffset: number }>;
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  gridStep: number;
  resolveLinkWaypoints: (link: TopologyLink) => LinkPoint[];
  options: Pick<TopologyPanelOptions, 'colorLinkUpload' | 'colorLinkDownload'>;
}

/**
 * Monta as pílulas uma vez; o poll atualiza o texto via `useLinkTrafficPillSync` no DOM.
 */
function LinkTrafficOverlaysLayerComponent({
  renderLinks,
  nodeLayouts,
  gridStep,
  resolveLinkWaypoints,
  options,
}: Props) {
  const metrics = useLinkMetricsLiveStore().getLive();

  return (
    <>
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
            runtimeMetrics={metrics[linkKey(link)]}
            options={options}
          />
        );
      })}
    </>
  );
}

export const LinkTrafficOverlaysLayer = React.memo(LinkTrafficOverlaysLayerComponent);
