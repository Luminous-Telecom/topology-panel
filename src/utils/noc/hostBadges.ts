import { HostDisplayMap, HostMetadataMap, TopologyMap, TopologyNode } from '../../types';
import { resolveHostNodeStatus } from '../networkStats';
import { isHostNode } from '../topologyNodes';
import { resolveHostProblemSummary } from './topologyFilters';
import { HostNodeBadge, HostProblemsMap } from './types';

const SEVERITY_COLORS: Record<number, string> = {
  5: '#e53935',
  4: '#ff7043',
  3: '#ffb300',
  2: '#fdd835',
  1: '#42a5f5',
  0: '#9e9e9e',
};

export function resolveHostNodeBadges(params: {
  node: TopologyNode;
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  hostProblems?: HostProblemsMap;
  showProblems?: boolean;
}): HostNodeBadge[] {
  const { node, hostMetadata, hostProblems, showProblems } = params;
  if (!isHostNode(node)) {
    return [];
  }

  const badges: HostNodeBadge[] = [];

  if (showProblems !== false && hostProblems) {
    const summary = resolveHostProblemSummary(node, hostMetadata, hostProblems);
    if (summary) {
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
}): Map<string, HostNodeBadge[]> {
  const { map, hostDisplay, hostMetadata, hostProblems } = params;
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
    });
    if (badges.length) {
      badgesByNode.set(node.id, badges);
    }
  }
  return badgesByNode;
}
