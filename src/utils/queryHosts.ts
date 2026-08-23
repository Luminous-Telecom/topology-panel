import {
  HostDisplayInfo,
  HostDisplayMap,
  HostMetadataMap,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
  TopologyQueryRefInfo,
} from '../types';
import {
  numericHostsForRefIds,
  QueryIndex,
} from '../services/queryIndex';
import { directRefId } from '../services/zabbixDirectIndex';
import { activeChildMaps } from './childMapEdits';
import { canonicalizeHostKeys, collectHostLookupCandidates, HostLookupRef, preferHostDisplayInfo } from './hostLookup';
import { ROOT_MAP_ID, resolveTopologyMapById } from './topologyMapNavigation';

/**
 * Helpers do índice de hosts (grupos Zabbix como refId virtual).
 * Status e listas vêm do `QueryIndex` montado pelo snapshot Zabbix — nada percorre `data.series`.
 */

export function sameQueryRefInfos(a: TopologyQueryRefInfo[], b: TopologyQueryRefInfo[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((item, index) => item.refId === b[index].refId && item.hint === b[index].hint);
}

export function sameStringList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

/** Bucket de status por refId (match case-insensitive). */
export function findHostDisplayBucket(
  byRefId: Record<string, HostDisplayMap>,
  refId: string
): HostDisplayMap | undefined {
  const trimmed = refId.trim();
  if (!trimmed) {
    return undefined;
  }
  const direct = byRefId[trimmed] ?? byRefId[trimmed.toUpperCase()];
  if (direct) {
    return direct;
  }
  const upper = trimmed.toUpperCase();
  for (const [key, bucket] of Object.entries(byRefId)) {
    if (key.toUpperCase() === upper) {
      return bucket;
    }
  }
  return undefined;
}

/** Achata buckets por refId num mapa único (hosts do canvas). */
export function flattenHostDisplayByRefId(
  byRefId: Record<string, HostDisplayMap>
): HostDisplayMap {
  const result: HostDisplayMap = {};
  for (const bucket of Object.values(byRefId)) {
    for (const [key, info] of Object.entries(bucket)) {
      const existing = result[key];
      result[key] = existing ? preferHostDisplayInfo(existing, info) : info;
    }
  }
  return result;
}

/** Nome no catálogo que casa com o refId, sem distinguir maiúsculas. */
export function resolveCatalogGroupName(
  refId: string,
  catalog: readonly string[] | undefined
): string | undefined {
  const trimmed = refId.trim();
  if (!trimmed) {
    return undefined;
  }
  const wanted = directRefId(trimmed);
  for (const name of catalog ?? []) {
    if (directRefId(name) === wanted) {
      return name;
    }
  }
  return undefined;
}

/** Nomes de grupo no casing do Zabbix — saem da metadata já resolvida, não do queryRefId. */
export function zabbixGroupsFromHostMetadata(metadata: HostMetadataMap): string[] {
  const refs: string[] = [];
  for (const entry of Object.values(metadata)) {
    if (entry.hostGroups?.length) {
      refs.push(...entry.hostGroups);
    }
  }
  return uniqueGroupNames(refs);
}

/** Grupos únicos, no casing em que foram gravados. */
export function uniqueGroupNames(refIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const raw of refIds) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const key = directRefId(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    groups.push(trimmed);
  }
  return groups;
}

/** Grupos do nó submapa — `queryRefIds` ou o `queryRefId` legado. */
export function submapQueryRefIds(node: TopologyNode): string[] {
  if (node.type !== 'submap') {
    return [];
  }
  if (node.queryRefIds?.length) {
    return uniqueGroupNames(node.queryRefIds);
  }
  return uniqueGroupNames(node.queryRefId ? [node.queryRefId] : []);
}

/**
 * Grupos efetivos do submapa: os gravados no nó e, se for atalho para um mapa interno,
 * os do nó que originou esse mapa (o atalho costuma ter um rótulo curto que não existe no Zabbix).
 */
export function effectiveSubmapQueryRefIds(
  node: TopologyNode,
  options?: Pick<TopologyPanelOptions, 'map' | 'childMaps'>
): string[] {
  const own = submapQueryRefIds(node);
  const childId = node.submapChildMapId?.trim();
  if (!childId || !options) {
    return own;
  }
  const owner = findSubmapNodeForChildMap(options.map, options.childMaps, childId);
  if (!owner || owner === node) {
    return own;
  }
  return uniqueGroupNames([...own, ...submapQueryRefIds(owner)]);
}

/** Grupos únicos dos submapas desenhados neste mapa. */
export function collectSubmapCatalogGroups(
  map: TopologyMap,
  options?: Pick<TopologyPanelOptions, 'map' | 'childMaps'>
): string[] {
  const refs: string[] = [];
  for (const node of map.nodes ?? []) {
    refs.push(...effectiveSubmapQueryRefIds(node, options));
  }
  return uniqueGroupNames(refs);
}

/** Grupos de todos os submapas (raiz + childMaps). */
export function collectAllSubmapGroups(
  options: Pick<TopologyPanelOptions, 'map' | 'childMaps'>
): string[] {
  const refs = [...collectSubmapCatalogGroups(options.map, options)];
  for (const map of Object.values(activeChildMaps(options.childMaps))) {
    refs.push(...collectSubmapCatalogGroups(map, options));
  }
  return uniqueGroupNames(refs);
}

/** Nó submapa cujo mapa interno é `childMapId` — procura no raiz e nos childMaps (cidade aninhada). */
export function findSubmapNodeForChildMap(
  rootMap: TopologyMap,
  childMaps: TopologyPanelOptions['childMaps'],
  childMapId: string
): TopologyNode | undefined {
  const wanted = childMapId.trim();
  if (!wanted) {
    return undefined;
  }
  const maps: TopologyMap[] = [rootMap, ...Object.values(activeChildMaps(childMaps))];
  for (const map of maps) {
    for (const node of map.nodes ?? []) {
      if (node.type === 'submap' && node.submapChildMapId?.trim() === wanted) {
        return node;
      }
    }
  }
  return undefined;
}

/**
 * Grupos enviados à query Metrics do mapa visível.
 * Em qualquer nível: grupos do nó pai (se houver) + grupos dos submapas desenhados neste mapa.
 */
export function zabbixGroupsForVisibleMap(
  options: Pick<TopologyPanelOptions, 'map' | 'childMaps'>,
  currentMapId: string
): string[] {
  const refs: string[] = [];

  if (currentMapId !== ROOT_MAP_ID) {
    const parent = findSubmapNodeForChildMap(options.map, options.childMaps, currentMapId);
    if (parent) {
      refs.push(...effectiveSubmapQueryRefIds(parent, options));
    }
  }

  const visibleMap =
    currentMapId === ROOT_MAP_ID
      ? options.map
      : resolveTopologyMapById(options, currentMapId);
  if (visibleMap) {
    refs.push(...collectSubmapCatalogGroups(visibleMap, options));
  }

  return uniqueGroupNames(refs);
}

/** RefIds de grupo reservados a submapas (não desenham hosts no mapa pai). */
export function collectSubmapQueryRefIds(map: TopologyMap): Set<string> {
  const refs = new Set<string>();
  for (const node of map.nodes ?? []) {
    for (const refId of submapQueryRefIds(node)) {
      refs.add(directRefId(refId));
    }
  }
  return refs;
}

/** Grupos (refIds virtuais) que importam hosts ao mapa (opt-in). */
export function resolveDisplayQueryRefIds(
  options: Pick<TopologyPanelOptions, 'displayQueryRefIds'>
): string[] {
  if (!options.displayQueryRefIds?.length) {
    return [];
  }
  return options.displayQueryRefIds.map((r) => r.trim().toUpperCase()).filter(Boolean);
}

/**
 * Hosts das queries marcadas para exibição (opt-in; submapas nunca importam).
 *
 * Recebe o índice já montado — no modo "Zabbix direto" ele não vem de `data.series`, e sim da API
 * Zabbix (ver `services/zabbixDirectIndex.ts`).
 */
export function extractDisplayQueryHosts(
  index: QueryIndex,
  submapQueryRefIds: Set<string>,
  displayQueryRefIds: string[] = []
): string[] {
  if (!index.hosts.length || !displayQueryRefIds.length) {
    return [];
  }
  const allowed = new Set(displayQueryRefIds.map((r) => r.trim().toUpperCase()).filter(Boolean));
  const wanted: string[] = [];
  for (const refId of allowed) {
    if (!submapQueryRefIds.has(refId)) {
      wanted.push(refId);
    }
  }
  const hosts = numericHostsForRefIds(index, wanted);
  return canonicalizeHostKeys([...hosts], index.metadata).sort((a, b) => a.localeCompare(b));
}

/**
 * Índice `chave minúscula -> status` de um `HostDisplayMap`.
 *
 * O match case-insensitive de `lookupHostDisplay` roda por nó a cada render; sem este índice ele
 * varria todas as chaves do mapa para cada candidato (O(candidatos × hosts)).
 */
const displayMapLowerKeyIndex = new WeakMap<HostDisplayMap, Map<string, HostDisplayInfo>>();

function displayMapByLowerKey(displayMap: HostDisplayMap): Map<string, HostDisplayInfo> {
  const cached = displayMapLowerKeyIndex.get(displayMap);
  if (cached) {
    return cached;
  }
  const index = new Map<string, HostDisplayInfo>();
  for (const [key, info] of Object.entries(displayMap)) {
    const lower = key.toLowerCase();
    if (!index.has(lower)) {
      index.set(lower, info);
    }
  }
  displayMapLowerKeyIndex.set(displayMap, index);
  return index;
}

/** Busca cor/texto mapeados por IP ou nome (mesmos aliases do status). */
export function lookupHostDisplay(
  displayMap: HostDisplayMap | undefined,
  ref: HostLookupRef,
  metadata?: HostMetadataMap
): HostDisplayInfo | undefined {
  if (!displayMap) {
    return undefined;
  }
  if (!ref.zabbixHost?.trim() && !ref.zabbixHostId?.trim()) {
    return undefined;
  }
  const candidates = collectHostLookupCandidates(ref, metadata);
  const byLowerKey = displayMapByLowerKey(displayMap);
  let best: HostDisplayInfo | undefined;
  for (const name of candidates) {
    const info = displayMap[name] ?? byLowerKey.get(name.toLowerCase());
    if (info) {
      best = best ? preferHostDisplayInfo(best, info) : info;
    }
  }
  return best;
}
