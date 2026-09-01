import {
  HostDisplayMap,
  HostMetadataMap,
  LinkRuntimeMetricsMap,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
} from '../../types';
import { enrichHostDisplayFromMap, enrichHostMetadataFromMap, resolveHostZabbixId } from '../hostLookup';
import { resolveHostNodeStatus } from '../networkStats';
import { isHostNode } from '../topologyNodes';
import { linkKey } from '../mapLinkEdits';
import { ROOT_MAP_ID } from '../topologyMapNavigation';
import {
  HostProblemSummary,
  HostProblemsMap,
  TopologyHostTypeFilter,
  TopologyMapFilterId,
  TopologyMapTypeFilterId,
  TOPOLOGY_HOST_TYPE_FILTERS,
  TOPOLOGY_HOST_TYPE_FILTER_BY_ID,
  TOPOLOGY_STATUS_FILTER_IDS,
  ZABBIX_PROBLEM_MIN_SEVERITY,
  isHostTypeFilterId,
} from './types';

export interface TopologyFilterContext {
  map: TopologyMap;
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  hostProblems?: HostProblemsMap;
  linkMetricsByLink?: LinkRuntimeMetricsMap;
  options: Pick<TopologyPanelOptions, 'linkUtilThresholdHigh'>;
}

/** Severidade mínima (Warning+) para contar problema na UI. */
export { ZABBIX_PROBLEM_MIN_SEVERITY };

export function resolveHostProblemSummary(
  node: TopologyNode,
  hostMetadata?: HostMetadataMap,
  hostProblems?: HostProblemsMap
): HostProblemSummary | undefined {
  if (!hostProblems) {
    return undefined;
  }
  const hostid = resolveHostZabbixId(
    {
      zabbixHost: node.zabbixHost,
      subtitle: node.subtitle,
      label: node.label,
      zabbixHostId: node.zabbixHostId,
    },
    hostMetadata
  );
  if (!hostid) {
    return undefined;
  }
  const summary = hostProblems[hostid];
  if (summary && summary.count > 0 && summary.maxSeverity >= ZABBIX_PROBLEM_MIN_SEVERITY) {
    return summary;
  }
  return undefined;
}

function contextForMap(
  map: TopologyMap,
  baseCtx: Omit<TopologyFilterContext, 'map'>
): TopologyFilterContext {
  const hostMetadata = enrichHostMetadataFromMap(baseCtx.hostMetadata ?? {}, map);
  const hostDisplay = enrichHostDisplayFromMap(baseCtx.hostDisplay ?? {}, map, hostMetadata);
  return { ...baseCtx, map, hostDisplay, hostMetadata };
}

function nodeMatchesTypeFilter(node: TopologyNode, def: TopologyHostTypeFilter): boolean {
  if (node.icon && def.icons.includes(node.icon)) {
    return true;
  }
  return Boolean(node.nodeTemplateId && def.templateIds?.includes(node.nodeTemplateId));
}

function hostTypeFilterForNode(node: TopologyNode): TopologyHostTypeFilter | undefined {
  for (const def of TOPOLOGY_HOST_TYPE_FILTERS) {
    if (nodeMatchesTypeFilter(node, def)) {
      return def;
    }
  }
  return undefined;
}

function hostTypeTagForNode(node: TopologyNode): string | undefined {
  return hostTypeFilterForNode(node)?.tag;
}

function nodeMatchesSingleFilter(
  node: TopologyNode,
  filter: TopologyMapFilterId,
  ctx: TopologyFilterContext
): boolean {
  if (!isHostNode(node)) {
    return !isHostTypeFilterId(filter);
  }

  if (isHostTypeFilterId(filter)) {
    const def = TOPOLOGY_HOST_TYPE_FILTER_BY_ID.get(filter);
    return def !== undefined && nodeMatchesTypeFilter(node, def);
  }

  switch (filter) {
    case 'offline':
      return resolveHostNodeStatus(node, ctx.hostDisplay, ctx.hostMetadata) === 'offline';
    case 'problems':
      return resolveHostProblemSummary(node, ctx.hostMetadata, ctx.hostProblems) !== undefined;
    case 'congestedLinks':
      return filterIndex(ctx).congestedNodeIds.has(node.id);
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

interface TopologyFilterIndex {
  /** Chave dos cabos acima do limite de utilização. */
  congestedLinks: Set<string>;
  /** Nós em ponta de cabo congestionado. */
  congestedNodeIds: Set<string>;
  nodesById: Map<string, TopologyNode>;
}

/**
 * Índices do contexto, calculados uma única vez por objeto de contexto.
 *
 * Antes cada nó e cada cabo recalculava o conjunto de cabos congestionados e varria `map.nodes`
 * para achar as pontas, o que custava O(nós × cabos) — e O(nós × cabos²) na lista do modo NOC — a
 * cada render do canvas. O `WeakMap` segue o mesmo padrão do cache de `services/queryIndex.ts`:
 * o contexto é memoizado por quem chama, então o cálculo acontece uma vez por refresh.
 */
const filterIndexCache = new WeakMap<TopologyFilterContext, TopologyFilterIndex>();

function filterIndex(ctx: TopologyFilterContext): TopologyFilterIndex {
  const cached = filterIndexCache.get(ctx);
  if (cached) {
    return cached;
  }

  const congestedLinks = new Set<string>();
  const congestedNodeIds = new Set<string>();
  const threshold = ctx.options.linkUtilThresholdHigh ?? 75;
  for (const link of ctx.map.links) {
    const key = linkKey(link);
    const metrics = ctx.linkMetricsByLink?.[key];
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
      congestedLinks.add(key);
      congestedNodeIds.add(link.from);
      congestedNodeIds.add(link.to);
    }
  }

  const nodesById = new Map<string, TopologyNode>();
  for (const node of ctx.map.nodes) {
    nodesById.set(node.id, node);
  }

  const index: TopologyFilterIndex = { congestedLinks, congestedNodeIds, nodesById };
  filterIndexCache.set(ctx, index);
  return index;
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
  const index = filterIndex(ctx);
  if (activeFilters.has('congestedLinks')) {
    return index.congestedLinks.has(linkKey(link));
  }
  const from = index.nodesById.get(link.from);
  const to = index.nodesById.get(link.to);
  if (!from || !to) {
    return false;
  }
  return (
    isNodeVisibleForFilters(from, activeFilters, ctx) &&
    isNodeVisibleForFilters(to, activeFilters, ctx)
  );
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
  mapId: string;
  mapLabel: string;
  label: string;
  reason: HostAlertListReason;
  /** Nomes dos problemas Zabbix ativos (Warning+), o mais grave primeiro. */
  problems?: string[];
}

/** Quantos nomes de problema cabem no hover da lista e no popover do host. */
export const HOST_PROBLEM_NAME_LIMIT = 5;

/** Recorta a lista de problemas para o hover; `hidden` é o restante. */
export function visibleHostProblemNames(names: string[] | undefined): {
  visible: string[];
  hidden: number;
} {
  const cleaned = (names ?? []).map((name) => name.trim()).filter(Boolean);
  if (cleaned.length <= HOST_PROBLEM_NAME_LIMIT) {
    return { visible: cleaned, hidden: 0 };
  }
  return {
    visible: cleaned.slice(0, HOST_PROBLEM_NAME_LIMIT),
    hidden: cleaned.length - HOST_PROBLEM_NAME_LIMIT,
  };
}

/** Texto do hover/aria da linha de alerta: problemas Zabbix, ou o motivo da lista. */
export function alertListHoverText(entry: HostAlertListEntry): string {
  if (entry.reason === 'offline') {
    return 'Offline';
  }
  const problems = visibleHostProblemNames(entry.problems);
  if (problems.visible.length) {
    if (problems.hidden > 0) {
      return `${problems.visible.join('\n')}\ne mais ${problems.hidden}`;
    }
    return problems.visible.join('\n');
  }
  return 'Alerta';
}

/** Rótulo da linha da lista: nome do problema Zabbix, ou OFFLINE/ALERTA. */
export function alertListStatusLabel(entry: HostAlertListEntry): string {
  if (entry.reason === 'offline') {
    return 'OFFLINE';
  }
  const problems = visibleHostProblemNames(entry.problems);
  if (problems.visible.length === 1 && problems.hidden === 0) {
    return problems.visible[0];
  }
  if (problems.visible.length) {
    return `${problems.visible.length + problems.hidden} problemas`;
  }
  return 'ALERTA';
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

/** Tipos de equipamento que têm pelo menos um host na árvore do painel, na ordem dos chips. */
export function collectPresentHostTypeFilterIds(
  maps: readonly NocTopologyMapScope[]
): TopologyMapTypeFilterId[] {
  const present = new Set<TopologyMapTypeFilterId>();
  for (const { map } of maps) {
    for (const node of map.nodes) {
      if (!isHostNode(node)) {
        continue;
      }
      const def = hostTypeFilterForNode(node);
      if (def) {
        present.add(def.id);
      }
    }
  }
  return TOPOLOGY_HOST_TYPE_FILTERS.filter((def) => present.has(def.id)).map((def) => def.id);
}

/** Chips do modo NOC: status sempre visível; tipos só quando há host daquele tipo. */
export function visibleNocFilterIds(maps: readonly NocTopologyMapScope[]): TopologyMapFilterId[] {
  return [...TOPOLOGY_STATUS_FILTER_IDS, ...collectPresentHostTypeFilterIds(maps)];
}

/** Tira filtro de tipo que não tem mais host, para o chip escondido não ficar preso. */
export function retainPresentNocTypeFilters(
  active: ReadonlySet<TopologyMapFilterId>,
  presentTypeIds: readonly TopologyMapTypeFilterId[]
): Set<TopologyMapFilterId> {
  const present = new Set<TopologyMapTypeFilterId>(presentTypeIds);
  const next = new Set<TopologyMapFilterId>();
  let dropped = false;
  for (const id of active) {
    if (isHostTypeFilterId(id) && !present.has(id)) {
      dropped = true;
      continue;
    }
    next.add(id);
  }
  if (!dropped) {
    return active instanceof Set ? active : next;
  }
  return next;
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

/** Hosts offline, em alerta da Query ou com problema Zabbix (Warning+) — lista do canto inferior. */
function collectAlertHostEntriesForMap(
  mapId: string,
  mapLabel: string,
  ctx: TopologyFilterContext
): HostAlertListEntry[] {
  const entries: HostAlertListEntry[] = [];

  for (const node of ctx.map.nodes) {
    if (!isHostNode(node)) {
      continue;
    }

    const status = resolveHostNodeStatus(node, ctx.hostDisplay, ctx.hostMetadata);
    const problemSummary = resolveHostProblemSummary(node, ctx.hostMetadata, ctx.hostProblems);

    let reason: HostAlertListReason | null = null;
    if (status === 'offline') {
      reason = 'offline';
    } else if (status === 'alert' || problemSummary) {
      reason = 'alert';
    }

    if (!reason) {
      continue;
    }

    const entry: HostAlertListEntry = {
      nodeId: node.id,
      mapId,
      mapLabel,
      label: hostDisplayLabel(node),
      reason,
    };
    if (reason === 'alert' && problemSummary?.names?.length) {
      entry.problems = problemSummary.names;
    }
    entries.push(entry);
  }

  return entries.sort((a, b) => {
    const order = ALERT_REASON_ORDER[a.reason] - ALERT_REASON_ORDER[b.reason];
    if (order !== 0) {
      return order;
    }
    return a.label.localeCompare(b.label, 'pt-BR');
  });
}

/** Hosts offline ou em alerta no mapa atual (atalho para testes e uso de mapa único). */
export function collectAlertHostEntries(ctx: TopologyFilterContext): HostAlertListEntry[] {
  return collectAlertHostEntriesForMap(ROOT_MAP_ID, '', ctx);
}

/**
 * Hosts offline, em alerta da Query ou com problema Zabbix em todos os mapas do painel.
 */
export function collectAlertHostEntriesFromMaps(
  maps: readonly NocTopologyMapScope[],
  baseCtx: Omit<TopologyFilterContext, 'map'>
): HostAlertListEntry[] {
  const entries: HostAlertListEntry[] = [];

  for (const { mapId, mapLabel, map } of maps) {
    entries.push(...collectAlertHostEntriesForMap(mapId, mapLabel, contextForMap(map, baseCtx)));
  }

  return entries.sort((a, b) => {
    const mapOrder = a.mapLabel.localeCompare(b.mapLabel, 'pt-BR');
    if (mapOrder !== 0) {
      return mapOrder;
    }
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

  const problemSummary = resolveHostProblemSummary(node, ctx.hostMetadata, ctx.hostProblems);
  if (problemSummary) {
    tags.push(`Problemas (${problemSummary.count})`);
  }

  const typeTag = hostTypeTagForNode(node);
  if (typeTag) {
    tags.push(typeTag);
  }

  if (filterIndex(ctx).congestedNodeIds.has(node.id)) {
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
    const ctx = contextForMap(map, baseCtx);
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
    const problemSummary = resolveHostProblemSummary(node, ctx.hostMetadata, ctx.hostProblems);
    if (problemSummary) {
      problemHostCount += 1;
      problemCount += problemSummary.count;
    }
  }

  return {
    hostCount: hosts.length,
    offlineCount,
    problemHostCount,
    problemCount,
    congestedLinkCount: filterIndex(ctx).congestedLinks.size,
  };
}
