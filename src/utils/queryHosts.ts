import {
  HostDisplayInfo,
  HostDisplayMap,
  HostMetadataMap,
  TopologyMap,
  TopologyPanelOptions,
  TopologyQueryRefInfo,
} from '../types';
import {
  numericHostsForRefIds,
  QueryIndex,
} from '../services/queryIndex';
import { canonicalizeHostKeys, collectHostLookupCandidates, HostLookupRef, preferHostDisplayInfo } from './hostLookup';

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

/** RefIds de grupo reservados a submapas (não desenham hosts no mapa pai). */
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
