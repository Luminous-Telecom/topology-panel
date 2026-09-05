import { MutableRefObject, useEffect } from 'react';
import { LinkRuntimeMetrics, LinkRuntimeMetricsMap, TopologyLink, TopologyNode } from '../types';
import { linkKey } from '../utils/mapLinkEdits';
import { LinkPoint } from '../utils/linkGeometry';
import { NodeLayout } from '../utils/nodeLayout';
import { syncLinkFlowStepsInRoot, syncTrafficPillsInRoot } from '../utils/linkTrafficPillDom';
import { useLinkMetricsLiveStore } from './linkMetricsLiveStore';

export interface LinkTrafficPillSyncContext {
  renderLinks: Array<{ link: TopologyLink; key: string; bundleOffset: number }>;
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  resolveLinkWaypoints: (link: TopologyLink) => LinkPoint[];
  linkAnimationSpeed: number;
}

function buildLinksByPillId(
  renderLinks: LinkTrafficPillSyncContext['renderLinks'],
  metrics: LinkRuntimeMetricsMap
): Map<string, { link: TopologyLink; metrics?: LinkRuntimeMetrics }> {
  const map = new Map<string, { link: TopologyLink; metrics?: LinkRuntimeMetrics }>();
  for (const { link } of renderLinks) {
    const key = linkKey(link);
    map.set(key, { link, metrics: metrics[key] });
  }
  return map;
}

/** Poll de bps: atualiza só o texto das pílulas no DOM, fora do React. */
export function useLinkTrafficPillSync(
  rootRef: MutableRefObject<HTMLElement | null>,
  contextRef: MutableRefObject<LinkTrafficPillSyncContext>,
  /** Troca de mapa/submapa — as pílulas novas já estão no DOM e precisam do lastvalue atual. */
  revision?: string
): void {
  const store = useLinkMetricsLiveStore();

  const run = () => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const ctx = contextRef.current;
    const linksByKey = buildLinksByPillId(ctx.renderLinks, store.getLive());
    syncTrafficPillsInRoot(root, linksByKey);
    syncLinkFlowStepsInRoot(root, linksByKey, ctx.linkAnimationSpeed);
  };

  useEffect(() => {
    const unsub = store.subscribeDom(run);
    run();
    return unsub;
  }, [store, rootRef, contextRef, revision]);
}
