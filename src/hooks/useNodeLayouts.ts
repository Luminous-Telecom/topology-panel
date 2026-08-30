import { useMemo, useRef } from 'react';
import { HostDisplayMap, HostMetadataMap, LinkRuntimeMetricsMap, TopologyMap, TopologyNode, TopologyPanelOptions } from '../types';
import { HostProblemsMap } from '../utils/noc/types';
import { withLiveZabbixMeta } from '../utils/mapSync';
import { isHostNode } from '../utils/topologyNodes';
import { resolveNodeDisplayFromTemplates } from '../utils/topologyTemplates/nodeTemplateDisplay';
import { RegionHostStats, buildRegionStatsMap, formatRegionStats, mergeRegionTrafficStats } from '../utils/networkStats';
import { nodesOnlyMoved } from '../utils/mapRevision';
import { structuralShareMap } from '../utils/structuralIdentity';
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
  hostDisplay?: HostDisplayMap;
  hostDisplayByRefId?: Record<string, HostDisplayMap>;
  hostMetadata?: HostMetadataMap;
  submapHosts?: Record<string, string[] | null | undefined>;
  childMaps?: Record<string, TopologyMap | undefined>;
  hostProblems?: HostProblemsMap;
  queryReady?: boolean;
  linkMetricsByLink?: LinkRuntimeMetricsMap;
}

export interface NodeLayoutsResult {
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  regionStats: Map<string, RegionHostStats>;
}

type LayoutOpts = Pick<TopologyPanelOptions, 'nodeFontSize' | 'networkFontSize' | 'showSubtitle'>;
type TemplateOpts = Pick<TopologyPanelOptions, 'nodeTemplates' | 'templateRules' | 'showSubtitle'>;

/** True quando a caixa medida anterior ainda vale — só x/y iguais e a fonte do texto não mudou. */
function sameMeasureSource(prev: NodeLayout & TopologyNode, node: TopologyNode): boolean {
  return (
    prev.type === node.type &&
    prev.width === node.width &&
    prev.height === node.height &&
    prev.fontSize === node.fontSize &&
    prev.icon === node.icon &&
    prev.label === (node.label ?? '').trim() &&
    (node.type === 'submap' || (prev.subtitle ?? '') === (node.subtitle ?? ''))
  );
}

function canReuseNodeLayout(
  prev: (NodeLayout & TopologyNode) | undefined,
  node: TopologyNode
): prev is NodeLayout & TopologyNode {
  if (!prev) {
    return false;
  }
  return prev.x === node.x && prev.y === node.y && sameMeasureSource(prev, node);
}

/** Reusa w/h/texto da caixa anterior e só atualiza a posição — arraste não remede o mapa. */
function layoutMovedTo(
  prev: NodeLayout & TopologyNode,
  node: TopologyNode
): NodeLayout & TopologyNode {
  return {
    ...prev,
    ...node,
    x: node.x,
    y: node.y,
    w: prev.w,
    h: prev.h,
    label: prev.label,
    sub: prev.sub,
    subtitle: prev.subtitle,
    detailLines: prev.detailLines,
    labelFontSize: prev.labelFontSize,
    subFontSize: prev.subFontSize,
    labelY: prev.labelY,
    subY: prev.subY,
    detailLineYs: prev.detailLineYs,
    iconCenterY: prev.iconCenterY,
  };
}

function applySubmapStatsLayout(
  positioned: NodeLayout & TopologyNode,
  statsSubtitle: string,
  prev: (NodeLayout & TopologyNode) | undefined,
  layoutOpts: LayoutOpts
): NodeLayout & TopologyNode {
  const withStats = { ...positioned, subtitle: statsSubtitle };
  if (prev && prev.subtitle === statsSubtitle && canReuseNodeLayout(prev, withStats)) {
    return prev;
  }
  if (prev && prev.subtitle === statsSubtitle && sameMeasureSource(prev, withStats)) {
    return layoutMovedTo(prev, withStats);
  }
  const layout = computeNodeLayout(withStats, layoutOpts);
  return { ...positioned, ...layout, subtitle: statsSubtitle };
}

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
 * Caixa medida de cada nó e as estatísticas agregadas de cada rede e submapa.
 *
 * O preview de arraste/resize não entra aqui: aplica-se em `applyDragPreviewToLayouts` no
 * `GesturePreviewLayers`, para o pointermove não remediar o mapa inteiro.
 *
 * Os dois saem do mesmo memo porque o submapa é medido duas vezes: a contagem de hosts vira o
 * subtítulo dele, e o subtítulo muda a altura da caixa.
 */
export function useNodeLayouts({
  map,
  layoutOpts,
  templateOpts,
  hostDisplay,
  hostDisplayByRefId,
  hostMetadata,
  submapHosts,
  childMaps,
  hostProblems,
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

  const previousLayoutsRef = useRef<Map<string, NodeLayout & TopologyNode>>();
  const previousStatsRef = useRef<Map<string, RegionHostStats>>();
  const previousNodesRef = useRef<TopologyNode[]>();
  const statsInputRef = useRef({
    hostDisplay,
    hostDisplayByRefId,
    submapHosts,
    hostMetadata,
    childMaps,
    hostProblems,
    queryReady,
    linkMetricsByLink,
    links: map.links,
    layoutOpts,
    templateOpts,
  });

  const baseResult = useMemo(() => {
    const layouts = new Map<string, NodeLayout & TopologyNode>();
    for (const node of map.nodes) {
      const liveNode = withLiveZabbixMeta(node, hostMetadata);
      const prevLayout = previousLayoutsRef.current?.get(node.id);
      if (canReuseNodeLayout(prevLayout, liveNode)) {
        layouts.set(node.id, prevLayout);
        continue;
      }
      if (prevLayout && sameMeasureSource(prevLayout, liveNode)) {
        layouts.set(node.id, layoutMovedTo(prevLayout, liveNode));
        continue;
      }
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

    const statsInput = statsInputRef.current;
    const previousStats = previousStatsRef.current;
    const skipRegionStats =
      Boolean(previousStats) &&
      statsInput.hostDisplay === hostDisplay &&
      statsInput.hostDisplayByRefId === hostDisplayByRefId &&
      statsInput.submapHosts === submapHosts &&
      statsInput.hostMetadata === hostMetadata &&
      statsInput.childMaps === childMaps &&
      statsInput.hostProblems === hostProblems &&
      statsInput.queryReady === queryReady &&
      statsInput.linkMetricsByLink === linkMetricsByLink &&
      statsInput.links === map.links &&
      statsInput.layoutOpts === layoutOpts &&
      statsInput.templateOpts === templateOpts &&
      nodesOnlyMoved(previousNodesRef.current ?? [], map.nodes);

    const stats =
      skipRegionStats && previousStats
        ? previousStats
        : mergeRegionTrafficStats(
            buildRegionStatsMap(
              map.nodes,
              layouts,
              hostDisplay ?? {},
              submapHosts,
              hostMetadata,
              hostDisplayByRefId,
              childMaps,
              hostProblems
            ),
            map,
            layouts,
            linkMetricsByLink ?? {}
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
      const statsSubtitle = formatRegionStats(region, queryReady, 'submap');
      const prevSubmap = previousLayoutsRef.current?.get(node.id);
      layouts.set(node.id, applySubmapStatsLayout(positioned, statsSubtitle, prevSubmap, layoutOpts));
    }

    // Um host mudando de status remede **todos** os nós. Reaproveitar a caixa anterior de cada nó
    // que não mudou é o que mantém o `React.memo` das formas valendo: sem isto, um único host
    // offline redesenhava o mapa inteiro.
    const sharedLayouts = structuralShareMap(layouts, previousLayoutsRef.current);
    const sharedStats = structuralShareMap(stats, previousStatsRef.current);
    previousLayoutsRef.current = sharedLayouts;
    previousStatsRef.current = sharedStats;
    previousNodesRef.current = map.nodes;
    statsInputRef.current = {
      hostDisplay,
      hostDisplayByRefId,
      submapHosts,
      hostMetadata,
      childMaps,
      hostProblems,
      queryReady,
      linkMetricsByLink,
      links: map.links,
      layoutOpts,
      templateOpts,
    };

    return { nodeLayouts: sharedLayouts, regionStats: sharedStats };
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
    hostProblems,
    queryReady,
    uplinkCountByNode,
    linkMetricsByLink,
  ]);

  return baseResult;
}
