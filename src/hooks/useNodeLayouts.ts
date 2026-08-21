import { useMemo } from 'react';
import { HostDisplayMap, HostMetadataMap, LinkRuntimeMetricsMap, TopologyMap, TopologyNode, TopologyPanelOptions } from '../types';
import { DragPreview } from '../utils/dragState';
import { withLiveZabbixMeta } from '../utils/mapSync';
import { isHostNode } from '../utils/topologyNodes';
import { resolveNodeDisplayFromTemplates } from '../utils/topologyTemplates/nodeTemplateDisplay';
import { RegionHostStats, buildRegionStatsMap, formatRegionStats, mergeRegionTrafficStats } from '../utils/networkStats';
import {
  NodeLayout,
  computeNetworkLayout,
  computeNodeLayout,
  computeStaticLayout,
} from '../utils/nodeLayout';

export interface NodeLayoutsParams {
  map: TopologyMap;
  /** Só o que altera geometria — ver comentário do memo abaixo. */
  layoutOpts: Pick<TopologyPanelOptions, 'nodeFontSize' | 'networkFontSize' | 'showSubtitle'>;
  templateOpts?: Pick<TopologyPanelOptions, 'nodeTemplates' | 'templateRules' | 'showSubtitle'>;
  dragPreview: DragPreview;
  hostDisplay?: HostDisplayMap;
  hostDisplayByRefId?: Record<string, HostDisplayMap>;
  hostMetadata?: HostMetadataMap;
  submapHosts?: Record<string, string[] | null | undefined>;
  childMaps?: Record<string, TopologyMap | undefined>;
  queryReady?: boolean;
  linkMetricsByLink?: LinkRuntimeMetricsMap;
}

export interface NodeLayoutsResult {
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  regionStats: Map<string, RegionHostStats>;
}

type LayoutOpts = Pick<TopologyPanelOptions, 'nodeFontSize' | 'networkFontSize' | 'showSubtitle'>;
type TemplateOpts = Pick<TopologyPanelOptions, 'nodeTemplates' | 'templateRules' | 'showSubtitle'>;

function measureNodeLayout(
  node: TopologyNode,
  positioned: TopologyNode,
  layoutOpts: LayoutOpts,
  templateOpts: TemplateOpts | undefined,
  hostMetadata: HostMetadataMap | undefined,
  hostDisplay: HostDisplayMap | undefined,
  uplinkCountByNode: Map<string, number>
): NodeLayout & TopologyNode {
  let layoutLabel = positioned.label;
  let layoutSubtitle = positioned.subtitle;
  let layoutDetailLines: string[] | undefined;
  if (templateOpts && isHostNode(positioned)) {
    const display = resolveNodeDisplayFromTemplates(positioned, templateOpts, {
      hostMetadata,
      hostDisplay,
      uplinkCount: uplinkCountByNode.get(positioned.id),
      showSubtitle: templateOpts.showSubtitle,
    });
    layoutLabel = display.label;
    layoutSubtitle = display.subtitle;
    layoutDetailLines = display.detailLines.length ? display.detailLines : undefined;
  }

  const layout =
    node.type === 'network'
      ? computeNetworkLayout(positioned, layoutOpts)
      : node.type === 'static'
        ? computeStaticLayout(positioned, layoutOpts)
        : computeNodeLayout(
            {
              ...positioned,
              label: layoutLabel,
              subtitle: layoutSubtitle,
              detailLines: layoutDetailLines,
            },
            layoutOpts
          );
  return {
    ...positioned,
    ...layout,
    label: layout.label,
    subtitle: layout.sub,
  };
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
  templateOpts,
  dragPreview,
  hostDisplay,
  hostDisplayByRefId,
  hostMetadata,
  submapHosts,
  childMaps,
  queryReady,
  linkMetricsByLink,
}: NodeLayoutsParams): NodeLayoutsResult {
  const uplinkCountByNode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of map.links) {
      counts.set(link.from, (counts.get(link.from) ?? 0) + 1);
      counts.set(link.to, (counts.get(link.to) ?? 0) + 1);
    }
    return counts;
  }, [map.links]);

  const baseResult = useMemo(() => {
    const layouts = new Map<string, NodeLayout & TopologyNode>();
    for (const node of map.nodes) {
      const liveNode = withLiveZabbixMeta(node, hostMetadata);
      layouts.set(
        node.id,
        measureNodeLayout(
          node,
          liveNode,
          layoutOpts,
          templateOpts,
          hostMetadata,
          hostDisplay,
          uplinkCountByNode
        )
      );
    }

    const stats = mergeRegionTrafficStats(
      buildRegionStatsMap(
        map.nodes,
        layouts,
        hostDisplay ?? {},
        submapHosts,
        hostMetadata,
        hostDisplayByRefId,
        childMaps
      ),
      map,
      layouts,
      linkMetricsByLink ?? {},
      submapHosts,
      hostMetadata,
      childMaps
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
  }, [
    map.nodes,
    map.links,
    layoutOpts,
    templateOpts,
    hostDisplay,
    hostDisplayByRefId,
    submapHosts,
    hostMetadata,
    childMaps,
    queryReady,
    uplinkCountByNode,
    linkMetricsByLink,
  ]);

  return useMemo(() => {
    if (!dragPreview) {
      return baseResult;
    }

    const movePositions = dragPreview.positions;
    const resizeId = dragPreview.nodeId;
    const resizeW = dragPreview.width;
    const resizeH = dragPreview.height;
    const hasMove = movePositions && Object.keys(movePositions).length > 0;
    const hasResize = resizeId !== undefined && resizeW !== undefined && resizeH !== undefined;

    if (!hasMove && !hasResize) {
      return baseResult;
    }

    let layouts = baseResult.nodeLayouts;

    if (hasMove) {
      const next = new Map(layouts);
      for (const [id, pos] of Object.entries(movePositions)) {
        const layout = next.get(id);
        if (layout) {
          next.set(id, { ...layout, x: pos.x, y: pos.y });
        }
      }
      layouts = next;
    }

    if (hasResize) {
      const node = map.nodes.find((n) => n.id === resizeId);
      const prev = layouts.get(resizeId);
      if (node && prev) {
        const next = new Map(layouts);
        const positioned = { ...prev, width: resizeW, height: resizeH };
        let layoutEntry = measureNodeLayout(
          node,
          positioned,
          layoutOpts,
          templateOpts,
          hostMetadata,
          hostDisplay,
          uplinkCountByNode
        );
        if (node.type === 'submap') {
          const region = baseResult.regionStats.get(resizeId);
          if (region) {
            const withStats = { ...layoutEntry, subtitle: formatRegionStats(region, queryReady, 'submap') };
            const layout = computeNodeLayout(withStats, layoutOpts);
            layoutEntry = { ...layoutEntry, ...layout, subtitle: withStats.subtitle };
          }
        }
        next.set(resizeId, layoutEntry);
        layouts = next;
      }
    }

    return { nodeLayouts: layouts, regionStats: baseResult.regionStats };
  }, [
    baseResult,
    dragPreview,
    map.nodes,
    layoutOpts,
    templateOpts,
    hostMetadata,
    hostDisplay,
    uplinkCountByNode,
    queryReady,
  ]);
}
