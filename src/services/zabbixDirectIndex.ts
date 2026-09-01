import { HostMetadata, HostMetadataMap, TopologyPanelOptions, TopologyQueryRefInfo } from '../types';
import { QueryIndex, QueryRefBucket, STATUS_ORPHAN_REF_ID } from './queryIndex';
import { isIpv4 } from '../utils/ipv4';
import { ZabbixDirectHost, ZabbixInterfaceItem } from '../utils/zabbixApi';

/**
 * Modo Zabbix: monta o mesmo `QueryIndex` que o restante do painel consome, com dados
 * da API Zabbix (`host.get` + `item.get`).
 *
 * Todo o painel — cor, legenda, lista de alertas, contagem de submapa, pickers de host — já deriva
 * do `QueryIndex`. O papel do refId (A, B, C…) fica com o **grupo de host**: cada grupo
 * configurado vira um refId virtual, então "mostrar hosts deste grupo no mapa" e o vínculo de
 * submapa continuam funcionando.
 */

/** Grupo do Zabbix como refId virtual — normalizado igual aos refIds da Query (maiúsculas). */
export function directRefId(groupName: string): string {
  return groupName.trim().toUpperCase();
}

function emptyRefBucket(): QueryRefBucket {
  return { hosts: new Set(), lastValues: new Map(), lastUpdatedAtSec: new Map() };
}

function writeStatusToBucket(bucket: QueryRefBucket, hostKey: string, ip: string | undefined, status: ZabbixStatusValue): void {
  bucket.lastValues.set(hostKey, status.value);
  if (status.updatedAtSec != null) {
    bucket.lastUpdatedAtSec.set(hostKey, status.updatedAtSec);
  }
  if (ip && isIpv4(ip)) {
    bucket.lastValues.set(ip, status.value);
    if (status.updatedAtSec != null) {
      bucket.lastUpdatedAtSec.set(ip, status.updatedAtSec);
    }
  }
}

/** Nome visível, nome técnico e hostid — o mapa pode gravar qualquer um no `zabbixHost`. */
function writeHostStatusAliases(
  bucket: QueryRefBucket,
  host: ZabbixDirectHost,
  status: ZabbixStatusValue
): void {
  const ip = host.ip?.trim();
  writeStatusToBucket(bucket, host.name.trim(), ip, status);
  for (const extra of [host.host, host.hostid]) {
    const key = extra?.trim();
    if (!key || key === host.name.trim() || key === ip) {
      continue;
    }
    bucket.lastValues.set(key, status.value);
    if (status.updatedAtSec != null) {
      bucket.lastUpdatedAtSec.set(key, status.updatedAtSec);
    }
  }
}

/** RefIds virtuais a partir dos grupos configurados — alimenta editores quando a Query está vazia. */
export function directRefInfosFromGroups(groupNames: string[]): TopologyQueryRefInfo[] {
  const seen = new Set<string>();
  const infos: TopologyQueryRefInfo[] = [];
  for (const groupName of groupNames) {
    const trimmed = groupName.trim();
    if (!trimmed) {
      continue;
    }
    const refId = directRefId(trimmed);
    if (seen.has(refId)) {
      continue;
    }
    seen.add(refId);
    infos.push({ refId, hint: `Grupo Zabbix: ${trimmed}` });
  }
  return infos.sort((a, b) => a.refId.localeCompare(b.refId));
}

/** RefIds disponíveis no editor — grupos gravados nos submapas. */
export function resolvePanelQueryRefInfos(
  options: Pick<TopologyPanelOptions, 'queryRefInfosAvailable'>,
  syncedFromRuntime: TopologyQueryRefInfo[] = options.queryRefInfosAvailable ?? [],
  groupNames: readonly string[] = []
): TopologyQueryRefInfo[] {
  if (syncedFromRuntime.length) {
    return syncedFromRuntime;
  }
  return directRefInfosFromGroups([...groupNames]);
}

/** Prioridade da chave: exata, parametrizada (`key[...]`) ou prefixo sem sufixo alfanumérico. */
export function statusItemRank(itemKey: string, wantedKey: string): number | undefined {
  if (itemKey === wantedKey) {
    return 0;
  }
  if (itemKey.startsWith(`${wantedKey}[`)) {
    return 1;
  }
  if (!itemKey.startsWith(wantedKey)) {
    return undefined;
  }
  return /^[a-z0-9_.]/.test(itemKey.slice(wantedKey.length)) ? undefined : 2;
}

function numericLastValue(item: ZabbixInterfaceItem): number | undefined {
  const raw = item.lastvalue == null ? '' : String(item.lastvalue).trim();
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseLastUpdatedAtSec(item: ZabbixInterfaceItem): number | undefined {
  const raw = item.lastclock?.trim();
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export interface ZabbixStatusValue {
  value: number;
  updatedAtSec?: number;
}

/** hostid -> último valor do item de status, já filtrado por relevância da chave. */
export function statusValuesByHostId(
  items: ZabbixInterfaceItem[],
  statusItemKey: string
): Map<string, ZabbixStatusValue> {
  const wanted = statusItemKey.trim().toLowerCase();
  const best = new Map<string, { rank: number; value: number; updatedAtSec?: number }>();
  if (!wanted) {
    return new Map();
  }

  for (const item of items) {
    const hostid = item.hostid?.trim();
    const rank = statusItemRank(item.key_?.trim().toLowerCase() ?? '', wanted);
    const value = numericLastValue(item);
    if (!hostid || rank === undefined || value === undefined) {
      continue;
    }
    const updatedAtSec = parseLastUpdatedAtSec(item);
    const current = best.get(hostid);
    if (!current || rank < current.rank) {
      best.set(hostid, { rank, value, updatedAtSec });
      continue;
    }
    if (rank !== current.rank) {
      continue;
    }
    const currentTs = current.updatedAtSec ?? 0;
    const nextTs = updatedAtSec ?? 0;
    if (nextTs > currentTs) {
      best.set(hostid, { rank, value, updatedAtSec });
      continue;
    }
    if (nextTs === currentTs && value === 0 && current.value !== 0) {
      best.set(hostid, { rank, value, updatedAtSec });
    }
  }

  const result = new Map<string, ZabbixStatusValue>();
  for (const [hostid, entry] of best) {
    result.set(hostid, { value: entry.value, updatedAtSec: entry.updatedAtSec });
  }
  return result;
}

/**
 * Indexa o host por todas as chaves usadas nas buscas do mapa (nome visível, nome técnico, IP e
 * hostid) — mesmo esquema de `indexHostMetadata` no índice da Query.
 */
function indexDirectHostMetadata(metadata: HostMetadataMap, host: ZabbixDirectHost): void {
  const entry: HostMetadata = {
    name: host.name,
    ip: host.ip && isIpv4(host.ip) ? host.ip : undefined,
    hostid: host.hostid,
    description: host.description,
    hostGroups: host.groups.length ? host.groups : undefined,
    tags: host.tags?.length ? host.tags : undefined,
  };
  for (const key of [host.name, host.host, host.ip, host.hostid]) {
    const trimmed = key?.trim();
    if (trimmed) {
      metadata[trimmed] = entry;
    }
  }
}

export interface ZabbixDirectIndexInput {
  datasourceUid: string;
  /** Grupos configurados no painel, na ordem em que devem aparecer. */
  groupNames: string[];
  statusItemKey: string;
  hosts: ZabbixDirectHost[];
  statusItems: ZabbixInterfaceItem[];
}

export function buildZabbixDirectIndex(input: ZabbixDirectIndexInput): QueryIndex {
  const { datasourceUid, groupNames, statusItemKey, hosts, statusItems } = input;

  const metadata: HostMetadataMap = {};
  const allHosts = new Set<string>();
  const byRefId = new Map<string, QueryRefBucket>();
  const refInfoByRef = new Map<string, TopologyQueryRefInfo>();

  for (const groupName of groupNames) {
    const refId = directRefId(groupName);
    if (!refId || byRefId.has(refId)) {
      continue;
    }
    byRefId.set(refId, emptyRefBucket());
    refInfoByRef.set(refId, { refId, hint: `Grupo Zabbix: ${groupName.trim()}` });
  }

  const orphanBucket = emptyRefBucket();
  byRefId.set(STATUS_ORPHAN_REF_ID, orphanBucket);

  const statusByHostId = statusValuesByHostId(statusItems, statusItemKey);

  for (const host of hosts) {
    const hostKey = host.name.trim();
    if (!hostKey) {
      continue;
    }
    allHosts.add(hostKey);
    indexDirectHostMetadata(metadata, host);

    const status = statusByHostId.get(host.hostid);
    if (status !== undefined) {
      writeHostStatusAliases(orphanBucket, host, status);
    }
    for (const groupName of host.groups) {
      const bucket = byRefId.get(directRefId(groupName));
      if (!bucket || bucket === orphanBucket) {
        continue;
      }
      bucket.hosts.add(hostKey);
      if (status !== undefined) {
        writeHostStatusAliases(bucket, host, status);
      }
    }
  }

  return {
    metadata,
    hosts: [...allHosts].sort((a, b) => a.localeCompare(b)),
    refIds: [...refInfoByRef.keys()],
    refInfos: [...refInfoByRef.values()],
    byRefId,
    interfaceItemsByHost: new Map(),
    datasourceUid,
  };
}

function cloneRefBucket(bucket: QueryRefBucket): QueryRefBucket {
  return {
    hosts: bucket.hosts,
    lastValues: new Map(bucket.lastValues),
    lastUpdatedAtSec: new Map(bucket.lastUpdatedAtSec),
  };
}

/**
 * Regime do poll: os hosts já estão no índice. Só regrava o lastvalue dos que mudaram de número.
 * Lastclock ou `"1"` vs `"1.0"` não remontam metadata/hosts — isso travava o canvas no intervalo.
 */
export function applyStatusValuesToIndex(
  previous: QueryIndex,
  hosts: ZabbixDirectHost[],
  statusItems: ZabbixInterfaceItem[],
  statusItemKey: string
): { index: QueryIndex; changedHosts: number } {
  const nextByHostId = statusValuesByHostId(statusItems, statusItemKey);
  const orphan = previous.byRefId.get(STATUS_ORPHAN_REF_ID);
  const changed: ZabbixDirectHost[] = [];
  for (const host of hosts) {
    const key = host.name.trim();
    if (!key) {
      continue;
    }
    const status = nextByHostId.get(host.hostid);
    const previousValue = orphan?.lastValues.get(key);
    if (status === undefined) {
      if (previousValue !== undefined) {
        changed.push(host);
      }
      continue;
    }
    if (previousValue !== status.value) {
      changed.push(host);
    }
  }
  if (!changed.length) {
    return { index: previous, changedHosts: 0 };
  }

  const byRefId = new Map(previous.byRefId);
  const cloned = new Set<QueryRefBucket>();
  const writable = (refId: string): QueryRefBucket | undefined => {
    const current = byRefId.get(refId);
    if (!current) {
      return undefined;
    }
    if (cloned.has(current)) {
      return current;
    }
    const next = cloneRefBucket(current);
    cloned.add(next);
    byRefId.set(refId, next);
    return next;
  };

  for (const host of changed) {
    const status = nextByHostId.get(host.hostid);
    if (status === undefined) {
      continue;
    }
    const orphanBucket = writable(STATUS_ORPHAN_REF_ID);
    if (orphanBucket) {
      writeHostStatusAliases(orphanBucket, host, status);
    }
    for (const groupName of host.groups) {
      const bucket = writable(directRefId(groupName));
      if (bucket) {
        writeHostStatusAliases(bucket, host, status);
      }
    }
  }

  return { index: { ...previous, byRefId }, changedHosts: changed.length };
}
