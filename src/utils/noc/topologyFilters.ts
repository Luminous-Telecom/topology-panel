import {
  HostDisplayMap,
  HostMetadataMap,
  LinkRuntimeMetricsMap,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
} from '../../types';
import { resolveHostIp } from '../hostLookup';
import { resolveHostNodeStatus } from '../networkStats';
import { isHostNode } from '../topologyNodes';
import { linkKey } from '../mapLinkEdits';
import { HostProblemsMap, TopologyMapFilterId } from './types';

export interface TopologyFilterContext {
  map: TopologyMap;
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  hostProblems?: HostProblemsMap;
  linkMetricsByLink?: LinkRuntimeMetricsMap;
  options: Pick<TopologyPanelOptions, 'linkUtilThresholdHigh'>;
}

function hostProblemKey(node: TopologyNode, hostMetadata?: HostMetadataMap): string | undefined {
  const meta = hostMetadata && node.zabbixHost
    ? hostMetadata[node.zabbixHost] ?? hostMetadata[resolveHostIp(node, hostMetadata) ?? '']
    : undefined;
  return meta?.hostid ?? node.zabbixHost?.trim() ?? resolveHostIp(node, hostMetadata);
}

function nodeMatchesSingleFilter(
  node: TopologyNode,
  filter: TopologyMapFilterId,
  ctx: TopologyFilterContext
): boolean {
  if (!isHostNode(node)) {
    return filter !== 'olt' && filter !== 'router' && filter !== 'switch';
  }

  switch (filter) {
    case 'offline':
      return resolveHostNodeStatus(node, ctx.hostDisplay, ctx.hostMetadata) === 'offline';
    case 'problems': {
      const key = hostProblemKey(node, ctx.hostMetadata);
      if (!key || !ctx.hostProblems) {
        return false;
      }
      const summary = ctx.hostProblems[key] ?? ctx.hostProblems[node.zabbixHost?.trim() ?? ''];
      return (summary?.count ?? 0) > 0;
    }
    case 'congestedLinks': {
      const congested = congestedLinkKeys(ctx);
      return ctx.map.links.some(
        (link) =>
          congested.has(linkKey(link)) && (link.from === node.id || link.to === node.id)
      );
    }
    case 'olt':
      return node.icon === 'olt' || node.nodeTemplateId === 'olt';
    case 'router':
      return (
        node.icon === 'router' ||
        node.nodeTemplateId === 'router' ||
        node.nodeTemplateId === 'core-router'
      );
    case 'switch':
      return (
        node.icon === 'switch_managed' ||
        node.icon === 'switch_unmanaged' ||
        node.nodeTemplateId === 'switch'
      );
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

function congestedLinkKeys(ctx: TopologyFilterContext): Set<string> {
  const keys = new Set<string>();
  const threshold = ctx.options.linkUtilThresholdHigh ?? 75;
  for (const link of ctx.map.links) {
    const metrics = ctx.linkMetricsByLink?.[linkKey(link)];
    if (!metrics) {
      continue;
    }
    const maxUtil = Math.max(
      metrics.from.rxUtilizationPct ?? 0,
      metrics.from.txUtilizationPct ?? 0,
      metrics.to.rxUtilizationPct ?? 0,
      metrics.to.txUtilizationPct ?? 0
    );
    if (maxUtil >= threshold || metrics.status === 'highUtilization') {
      keys.add(linkKey(link));
    }
  }
  return keys;
}

/** Nó visível quando não há filtros ou quando casa com pelo menos um filtro ativo. */
export function isNodeVisibleForFilters(
  node: TopologyNode,
  activeFilters: ReadonlySet<TopologyMapFilterId>,
  ctx: TopologyFilterContext
): boolean {
  if (!activeFilters.size) {
    return true;
  }
  if (node.type === 'network' || node.type === 'static') {
    return true;
  }
  for (const filter of activeFilters) {
    if (nodeMatchesSingleFilter(node, filter, ctx)) {
      return true;
    }
  }
  return false;
}

export function isLinkVisibleForFilters(
  link: { from: string; to: string },
  activeFilters: ReadonlySet<TopologyMapFilterId>,
  ctx: TopologyFilterContext
): boolean {
  if (!activeFilters.size) {
    return true;
  }
  if (activeFilters.has('congestedLinks')) {
    return congestedLinkKeys(ctx).has(linkKey(link));
  }
  const fromVisible = ctx.map.nodes.some(
    (n) => n.id === link.from && isNodeVisibleForFilters(n, activeFilters, ctx)
  );
  const toVisible = ctx.map.nodes.some(
    (n) => n.id === link.to && isNodeVisibleForFilters(n, activeFilters, ctx)
  );
  return fromVisible && toVisible;
}

export interface NocMapSummary {
  hostCount: number;
  offlineCount: number;
  problemHostCount: number;
  problemCount: number;
  congestedLinkCount: number;
}

export type HostAlertListReason = 'offline' | 'alert';

export interface HostAlertListEntry {
  nodeId: string;
  label: string;
  reason: HostAlertListReason;
}

export interface NocHostListEntry {
  nodeId: string;
  mapId: string;
  mapLabel: string;
  label: string;
  tags: string[];
}

export interface NocTopologyMapScope {
  mapId: string;
  mapLabel: string;
  map: TopologyMap;
}

const ALERT_REASON_ORDER: Record<HostAlertListReason, number> = {
  offline: 0,
  alert: 1,
};

function hostDisplayLabel(node: TopologyNode): string {
  const label = node.label?.trim();
  if (label) {
    return label;
  }
  const host = node.zabbixHost?.trim();
  if (host) {
    return host;
  }
  return node.id;
}

/** Hosts offline ou em alerta (status da Query) — para a lista do canto inferior. */
export function collectAlertHostEntries(ctx: TopologyFilterContext): HostAlertListEntry[] {
  const entries: HostAlertListEntry[] = [];

  for (const node of ctx.map.nodes) {
    if (!isHostNode(node)) {
      continue;
    }

    const status = resolveHostNodeStatus(node, ctx.hostDisplay, ctx.hostMetadata);

    let reason: HostAlertListReason | null = null;
    if (status === 'offline') {
      reason = 'offline';
    } else if (status === 'alert') {
      reason = 'alert';
    }

    if (!reason) {
      continue;
    }

    entries.push({
      nodeId: node.id,
      label: hostDisplayLabel(node),
      reason,
    });
  }

  return entries.sort((a, b) => {
    const order = ALERT_REASON_ORDER[a.reason] - ALERT_REASON_ORDER[b.reason];
    if (order !== 0) {
      return order;
    }
    return a.label.localeCompare(b.label, 'pt-BR');
  });
}

function nodeNocTags(node: TopologyNode, ctx: TopologyFilterContext): string[] {
  const tags: string[] = [];
  const status = resolveHostNodeStatus(node, ctx.hostDisplay, ctx.hostMetadata);
  if (status === 'offline') {
    tags.push('DOWN');
  } else if (status === 'alert') {
    tags.push('ALERTA');
  }

  const key = hostProblemKey(node, ctx.hostMetadata);
  const summary = key && ctx.hostProblems ? ctx.hostProblems[key] : undefined;
  if (summary && summary.count > 0) {
    tags.push(`Problemas (${summary.count})`);
  }

  if (node.icon === 'olt' || node.nodeTemplateId === 'olt') {
    tags.push('OLT');
  } else if (
    node.icon === 'router' ||
    node.nodeTemplateId === 'router' ||
    node.nodeTemplateId === 'core-router'
  ) {
    tags.push('Roteador');
  } else if (
    node.icon === 'switch_managed' ||
    node.icon === 'switch_unmanaged' ||
    node.nodeTemplateId === 'switch'
  ) {
    tags.push('Switch');
  }

  if (
    ctx.map.links.some(
      (link) =>
        congestedLinkKeys(ctx).has(linkKey(link)) &&
        (link.from === node.id || link.to === node.id)
    )
  ) {
    tags.push('Link congestionado');
  }

  return tags;
}

/**
 * Hosts de todos os mapas do painel (raiz + filhos), filtrados pelos chips do modo NOC.
 * Sem filtro ativo, lista todos os hosts com tags de status/tipo.
 */
export function collectNocHostEntries(
  activeFilters: ReadonlySet<TopologyMapFilterId>,
  maps: readonly NocTopologyMapScope[],
  baseCtx: Omit<TopologyFilterContext, 'map'>
): NocHostListEntry[] {
  const entries: NocHostListEntry[] = [];

  for (const { mapId, mapLabel, map } of maps) {
    const ctx: TopologyFilterContext = { ...baseCtx, map };
    for (const node of map.nodes) {
      if (!isHostNode(node)) {
        continue;
      }
      if (activeFilters.size > 0 && !isNodeVisibleForFilters(node, activeFilters, ctx)) {
        continue;
      }

      entries.push({
        nodeId: node.id,
        mapId,
        mapLabel,
        label: hostDisplayLabel(node),
        tags: nodeNocTags(node, ctx),
      });
    }
  }

  return entries.sort((a, b) => {
    const mapOrder = a.mapLabel.localeCompare(b.mapLabel, 'pt-BR');
    if (mapOrder !== 0) {
      return mapOrder;
    }
    return a.label.localeCompare(b.label, 'pt-BR');
  });
}

export function computeNocMapSummary(ctx: TopologyFilterContext): NocMapSummary {
  const hosts = ctx.map.nodes.filter((n) => isHostNode(n));
  let offlineCount = 0;
  let problemHostCount = 0;
  let problemCount = 0;

  for (const node of hosts) {
    if (resolveHostNodeStatus(node, ctx.hostDisplay, ctx.hostMetadata) === 'offline') {
      offlineCount += 1;
    }
    const key = hostProblemKey(node, ctx.hostMetadata);
    const summary = key && ctx.hostProblems ? ctx.hostProblems[key] : undefined;
    if (summary && summary.count > 0) {
      problemHostCount += 1;
      problemCount += summary.count;
    }
  }

  return {
    hostCount: hosts.length,
    offlineCount,
    problemHostCount,
    problemCount,
    congestedLinkCount: congestedLinkKeys(ctx).size,
  };
}
