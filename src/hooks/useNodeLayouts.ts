import { useMemo } from 'react';
import { HostDisplayMap, HostMetadataMap, TopologyMap, TopologyNode, TopologyPanelOptions } from '../types';
import { DragPreview } from '../utils/dragState';
import { withLiveZabbixMeta } from '../utils/mapSync';
import { RegionHostStats, buildRegionStatsMap, formatRegionStats } from '../utils/networkStats';
import {
  NodeLayout,
  computeNetworkLayout,
  computeNodeLayout,
  computeStaticLayout,
} from '../utils/nodeLayout';

export interface NodeLayoutsParams {
  map: TopologyMap;
  /** Só o que altera geometria — ver comentário do memo abaixo. */
  layoutOpts: Pick<TopologyPanelOptions, 'nodeFontSize' | 'showSubtitle'>;
  dragPreview: DragPreview;
  hostDisplay?: HostDisplayMap;
  hostDisplayByRefId?: Record<string, HostDisplayMap>;
  hostMetadata?: HostMetadataMap;
  submapHosts?: Record<string, string[] | null | undefined>;
  queryReady?: boolean;
}

export interface NodeLayoutsResult {
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  regionStats: Map<string, RegionHostStats>;
}

/**
 * Caixa medida de cada nó (já com o preview do arraste aplicado) e as estatísticas agregadas de
 * cada rede e submapa.
 *
 * Os dois saem do mesmo memo porque o submapa é medido duas vezes: a contagem de hosts vira o
 * subtítulo dele, e o subtítulo muda a altura da caixa.
 */
export function useNodeLayouts({
  map,
  layoutOpts,
  dragPreview,
  hostDisplay,
  hostDisplayByRefId,
  hostMetadata,
  submapHosts,
  queryReady,
}: NodeLayoutsParams): NodeLayoutsResult {
  return useMemo(() => {
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
}
