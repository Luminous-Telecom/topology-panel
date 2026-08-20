import { HostDisplayMap, HostMetadataMap, LinkRuntimeMetricsMap, TopologyMap, TopologyNode } from '../../types';
import { formatBitsPerSecond } from '../zabbixAdapter/formatTraffic';
import { resolveHostIp } from '../hostLookup';
import { resolveHostNodeStatus } from '../networkStats';
import { isHostNode } from '../topologyNodes';
import { linkKey } from '../mapLinkEdits';
import { HostNodeBadge, HostProblemsMap, ZABBIX_PROBLEM_MIN_SEVERITY } from './types';

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

/**
 * Tráfego somado por nó, numa única passada pelos cabos do mapa.
 *
 * Resolver o badge host por host varria `map.links` de novo a cada host, o que custava
 * O(hosts × cabos) por render do canvas.
 */
export function aggregateHostTrafficByNode(
  map: TopologyMap,
  linkMetrics?: LinkRuntimeMetricsMap
): Map<string, number> {
  const totals = new Map<string, number>();
  if (!linkMetrics) {
    return totals;
  }
  for (const link of map.links) {
    const metrics = linkMetrics[linkKey(link)];
    if (!metrics) {
      continue;
    }
    const fromBps = (metrics.from.rxBps ?? 0) + (metrics.from.txBps ?? 0);
    const toBps = (metrics.to.rxBps ?? 0) + (metrics.to.txBps ?? 0);
    totals.set(link.from, (totals.get(link.from) ?? 0) + fromBps);
    totals.set(link.to, (totals.get(link.to) ?? 0) + toBps);
  }
  return totals;
}

export function resolveHostNodeBadges(params: {
  node: TopologyNode;
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  hostProblems?: HostProblemsMap;
  /** Tráfego já somado do nó — ver `aggregateHostTrafficByNode`. */
  trafficBps?: number;
  showProblems?: boolean;
  showTraffic?: boolean;
}): HostNodeBadge[] {
  const { node, hostMetadata, hostProblems, trafficBps, showProblems, showTraffic } = params;
  if (!isHostNode(node)) {
    return [];
  }

  const badges: HostNodeBadge[] = [];

  if (showProblems !== false && hostProblems) {
    const key = problemKeyForNode(node, hostMetadata);
    const summary = key ? hostProblems[key] : undefined;
    if (summary && summary.count > 0 && summary.maxSeverity >= ZABBIX_PROBLEM_MIN_SEVERITY) {
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

  if (showTraffic !== false && trafficBps !== undefined && trafficBps > 0) {
    badges.push({
      kind: 'traffic',
      label: formatBitsPerSecond(trafficBps) ?? '—',
      color: 'rgba(0,0,0,0.55)',
    });
  }

  return badges.slice(0, 2);
}

/**
 * Badges de todos os hosts do mapa, num único cálculo por refresh.
 *
 * Só entra no `Map` o host que tem badge, e o array devolvido é estável entre renders — é o que
 * permite ao `HostNodeShape` memoizado não redesenhar durante pan/zoom.
 */
export function buildHostNodeBadgeMap(params: {
  map: TopologyMap;
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  hostProblems?: HostProblemsMap;
  linkMetrics?: LinkRuntimeMetricsMap;
}): Map<string, HostNodeBadge[]> {
  const { map, hostDisplay, hostMetadata, hostProblems, linkMetrics } = params;
  const trafficByNode = aggregateHostTrafficByNode(map, linkMetrics);
  const badgesByNode = new Map<string, HostNodeBadge[]>();
  for (const node of map.nodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const badges = resolveHostNodeBadges({
      node,
      hostDisplay,
      hostMetadata,
      hostProblems,
      trafficBps: trafficByNode.get(node.id),
    });
    if (badges.length) {
      badgesByNode.set(node.id, badges);
    }
  }
  return badgesByNode;
}
