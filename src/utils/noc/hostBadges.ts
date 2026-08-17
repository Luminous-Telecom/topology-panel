import { HostDisplayMap, HostMetadataMap, LinkRuntimeMetricsMap, TopologyMap, TopologyNode } from '../../types';
import { formatBitsPerSecond } from '../zabbixAdapter/formatTraffic';
import { resolveHostIp } from '../hostLookup';
import { resolveHostNodeStatus } from '../networkStats';
import { isHostNode } from '../topologyNodes';
import { linkKey } from '../mapLinkEdits';
import { HostNodeBadge, HostProblemsMap } from './types';

const SEVERITY_COLORS: Record<number, string> = {
  5: '#e53935',
  4: '#ff7043',
  3: '#ffb300',
  2: '#fdd835',
  1: '#42a5f5',
  0: '#9e9e9e',
};

function problemKeyForNode(node: TopologyNode, hostMetadata?: HostMetadataMap): string | undefined {
  const ip = resolveHostIp(node, hostMetadata);
  const name = node.zabbixHost?.trim();
  const meta =
    (ip && hostMetadata?.[ip]) ||
    (name && hostMetadata?.[name]) ||
    undefined;
  return meta?.hostid ?? name ?? ip;
}

function aggregateHostTrafficBps(
  nodeId: string,
  map: TopologyMap,
  linkMetrics?: LinkRuntimeMetricsMap
): number {
  if (!linkMetrics) {
    return 0;
  }
  let total = 0;
  for (const link of map.links) {
    if (link.from !== nodeId && link.to !== nodeId) {
      continue;
    }
    const metrics = linkMetrics[linkKey(link)];
    if (!metrics) {
      continue;
    }
    if (link.from === nodeId) {
      total += (metrics.from.rxBps ?? 0) + (metrics.from.txBps ?? 0);
    }
    if (link.to === nodeId) {
      total += (metrics.to.rxBps ?? 0) + (metrics.to.txBps ?? 0);
    }
  }
  return total;
}

export function resolveHostNodeBadges(params: {
  node: TopologyNode;
  map: TopologyMap;
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  hostProblems?: HostProblemsMap;
  linkMetrics?: LinkRuntimeMetricsMap;
  showProblems?: boolean;
  showTraffic?: boolean;
}): HostNodeBadge[] {
  const { node, map, hostMetadata, hostProblems, linkMetrics, showProblems, showTraffic } = params;
  if (!isHostNode(node)) {
    return [];
  }

  const badges: HostNodeBadge[] = [];

  if (showProblems !== false && hostProblems) {
    const key = problemKeyForNode(node, hostMetadata);
    const summary = key ? hostProblems[key] : undefined;
    if (summary && summary.count > 0) {
      badges.push({
        kind: 'problems',
        label: String(summary.count),
        color: SEVERITY_COLORS[summary.maxSeverity] ?? SEVERITY_COLORS[0],
      });
    }
  }

  const status = resolveHostNodeStatus(node, params.hostDisplay, hostMetadata);
  if (status === 'alert' && !badges.some((b) => b.kind === 'problems')) {
    badges.push({
      kind: 'alert',
      label: '!',
      color: '#ff7300',
    });
  }

  if (showTraffic !== false && linkMetrics) {
    const bps = aggregateHostTrafficBps(node.id, map, linkMetrics);
    if (bps > 0) {
      badges.push({
        kind: 'traffic',
        label: formatBitsPerSecond(bps) ?? '—',
        color: 'rgba(0,0,0,0.55)',
      });
    }
  }

  return badges.slice(0, 2);
}
