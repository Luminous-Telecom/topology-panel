import { PanelData } from '@grafana/data';
import {
  HostDisplayInfo,
  HostDisplayMap,
  HostMetadataMap,
  TopologyMap,
  TopologyPanelOptions,
  TopologyQueryRefInfo,
} from '../types';
import {
  buildQueryIndex,
  hostDisplayByRefIdFromIndex,
  numericHostsForRefIds,
  queryHostsByRefIdFromIndex,
  QuerySource,
} from '../services/queryIndex';
import { canonicalizeHostKeys, collectHostLookupCandidates, HostLookupRef } from './hostLookup';
import { StatusColorOptions } from './statusMapping';

/**
 * Leitura da aba Query do painel. Tudo aqui deriva de `buildQueryIndex` — nenhuma função
 * percorre `data.series` por conta própria (ver `services/queryIndex.ts`).
 */

/** UID do datasource Zabbix a partir das queries do painel (aba Query). */
export function resolveZabbixDatasourceUid(data?: PanelData): string | undefined {
  return buildQueryIndex(data).datasourceUid;
}

/** RefIds (A, B, C…) configurados na aba Query do painel. */
export function collectQueryRefIdsFromPanelData(data?: QuerySource): string[] {
  return buildQueryIndex(data).refIds;
}

/** Queries do painel com refId visível e resumo opcional (host group etc.). */
export function collectQueryRefInfosFromPanelData(data?: QuerySource): TopologyQueryRefInfo[] {
  return buildQueryIndex(data).refInfos;
}

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

/**
 * Mantém refIds que ainda não voltaram no refresh; os que chegaram substituem o valor inteiro.
 * `keep` decide se o valor recém-chegado é bom o bastante para sobrescrever o anterior.
 */
function mergeByRefId<T>(
  live: Record<string, T>,
  previous: Record<string, T>,
  keep: (value: T) => boolean
): Record<string, T> {
  if (Object.keys(live).length === 0) {
    return previous;
  }
  if (Object.keys(previous).length === 0) {
    return live;
  }
  const merged: Record<string, T> = { ...previous };
  for (const [refId, value] of Object.entries(live)) {
    if (keep(value)) {
      merged[refId] = value;
    }
  }
  return merged;
}

export function mergeHostDisplayByRefId(
  live: Record<string, HostDisplayMap>,
  previous: Record<string, HostDisplayMap>
): Record<string, HostDisplayMap> {
  return mergeByRefId(live, previous, () => true);
}

/** Mantém listas de hosts por refId quando o refresh ainda não trouxe aquela query. */
export function mergeQueryHostsByRefId(
  live: Record<string, string[]>,
  previous: Record<string, string[]>
): Record<string, string[]> {
  return mergeByRefId(live, previous, (hosts) => hosts.length > 0);
}

/** Achata buckets por refId num mapa único (hosts do canvas). */
export function flattenHostDisplayByRefId(
  byRefId: Record<string, HostDisplayMap>
): HostDisplayMap {
  const result: HostDisplayMap = {};
  for (const bucket of Object.values(byRefId)) {
    for (const [key, info] of Object.entries(bucket)) {
      const existing = result[key];
      if (!existing || info.status) {
        result[key] = info;
      }
    }
  }
  return result;
}

/** Host -> status por refId da query Grafana (A, B, C…). */
export function extractHostDisplayByRefId(
  data: PanelData,
  statusOptions: StatusColorOptions
): Record<string, HostDisplayMap> {
  return hostDisplayByRefIdFromIndex(buildQueryIndex(data), statusOptions);
}

/**
 * Hosts por refId a partir dos labels da Query (não exige último valor numérico).
 * Usado na contagem de hosts do submapa / host group.
 */
export function extractQueryHostsByRefId(data?: PanelData): Record<string, string[]> {
  return queryHostsByRefIdFromIndex(buildQueryIndex(data));
}

/** RefIds de query reservados a submapas (não desenham hosts no mapa pai). */
export function collectSubmapQueryRefIds(map: TopologyMap): Set<string> {
  const refs = new Set<string>();
  for (const node of map.nodes ?? []) {
    if (node.type !== 'submap') {
      continue;
    }
    const refId = node.queryRefId?.trim();
    if (refId) {
      refs.add(refId.toUpperCase());
    }
  }
  return refs;
}

/** RefIds das queries que importam hosts ao mapa (opt-in). */
export function resolveDisplayQueryRefIds(
  options: Pick<TopologyPanelOptions, 'displayQueryRefIds'>
): string[] {
  if (!options.displayQueryRefIds?.length) {
    return [];
  }
  return options.displayQueryRefIds.map((r) => r.trim().toUpperCase()).filter(Boolean);
}

/** Hosts das queries marcadas para exibição (opt-in; submapas nunca importam). */
export function extractDisplayQueryHosts(
  data: PanelData | undefined,
  submapQueryRefIds: Set<string>,
  displayQueryRefIds: string[] = []
): string[] {
  if (!data?.series?.length || !displayQueryRefIds.length) {
    return [];
  }
  const index = buildQueryIndex(data);
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
  for (const name of candidates) {
    const info = displayMap[name];
    if (info) {
      return info;
    }
  }
  const byLowerKey = displayMapByLowerKey(displayMap);
  for (const name of candidates) {
    const info = byLowerKey.get(name.toLowerCase());
    if (info) {
      return info;
    }
  }
  return undefined;
}

/** Hosts da Query Zabbix crua (labels.host de cada série). */
export function extractQueryHosts(data: QuerySource): string[] {
  return buildQueryIndex(data).hosts;
}

/** Nome dos hosts a partir dos labels da Query (IP vem da API Zabbix). */
export function extractHostMetadataFromData(data: QuerySource): HostMetadataMap {
  return buildQueryIndex(data).metadata;
}
