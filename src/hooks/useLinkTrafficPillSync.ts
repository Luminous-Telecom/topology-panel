import { MutableRefObject, useEffect } from 'react';
import { LinkRuntimeMetrics, LinkRuntimeMetricsMap, TopologyLink, TopologyNode } from '../types';
import { linkKey } from '../utils/mapLinkEdits';
import { LinkPoint } from '../utils/linkGeometry';
import { NodeLayout } from '../utils/nodeLayout';
import { syncTrafficPillsInRoot } from '../utils/linkTrafficPillDom';
import { useLinkMetricsLiveStore } from './linkMetricsLiveStore';

export interface LinkTrafficPillSyncContext {
  renderLinks: Array<{ link: TopologyLink; key: string; bundleOffset: number }>;
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  resolveLinkWaypoints: (link: TopologyLink) => LinkPoint[];
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
  contextRef: MutableRefObject<LinkTrafficPillSyncContext>
): void {
  const store = useLinkMetricsLiveStore();

  useEffect(() => {
    const run = () => {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      const ctx = contextRef.current;
      syncTrafficPillsInRoot(root, buildLinksByPillId(ctx.renderLinks, store.getLive()));
    };

    const unsub = store.subscribeDom(run);
    run();
    return unsub;
  }, [store, rootRef, contextRef]);
}
