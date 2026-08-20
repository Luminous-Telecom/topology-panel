import { useCallback } from 'react';
import { HostDisplayMap, HostMetadataMap, TopologyNode, TopologyPanelOptions } from '../types';
import { HostProblemsMap } from '../utils/noc/types';
import { isNetworkNode } from '../utils/mapBounds';
import { RegionHostStats, regionStrokeColor } from '../utils/networkStats';
import { ColorResolver, resolveNetworkFill, resolveNodeFill } from '../utils/nodeFillColors';

export interface MinimapColorsParams {
  regionStats: Map<string, RegionHostStats>;
  options: TopologyPanelOptions;
  queryReady?: boolean;
  hostMetadata?: HostMetadataMap;
  hostDisplay?: HostDisplayMap;
  hostProblems?: HostProblemsMap;
  resolveColor: ColorResolver;
}

/**
 * Cores do minimapa. Reusa os mesmos resolvedores do mapa grande para os dois nunca discordarem
 * sobre a cor de um host.
 */
export function useMinimapColors({
  regionStats,
  options,
  queryReady,
  hostMetadata,
  hostDisplay,
  hostProblems,
  resolveColor,
}: MinimapColorsParams) {
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
        resolveColor,
        hostProblems
      );
    },
    [regionStats, options, queryReady, hostMetadata, hostDisplay, hostProblems, resolveColor]
  );

  const resolveMiniNetworkStroke = useCallback(
    (node: TopologyNode): string => {
      const stats = regionStats.get(node.id);
      return resolveColor(regionStrokeColor(stats, options, queryReady, node.borderColor));
    },
    [regionStats, options, queryReady, resolveColor]
  );

  return { resolveMiniNodeFill, resolveMiniNetworkStroke, miniLinkColor: resolveColor(options.colorLink) };
}
