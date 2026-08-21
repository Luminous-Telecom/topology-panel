import { HostMetadata, HostMetadataMap, TopologyPanelOptions, TopologyQueryRefInfo } from '../types';
import { QueryIndex, QueryRefBucket } from './queryIndex';
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

/** RefIds disponíveis no editor — grupos Zabbix configurados no painel. */
export function resolvePanelQueryRefInfos(
  options: Pick<TopologyPanelOptions, 'zabbixHostGroups' | 'queryRefInfosAvailable'>,
  syncedFromRuntime: TopologyQueryRefInfo[] = options.queryRefInfosAvailable ?? []
): TopologyQueryRefInfo[] {
  if (syncedFromRuntime.length) {
    return syncedFromRuntime;
  }
  return directRefInfosFromGroups(options.zabbixHostGroups ?? []);
}

/**
 * Escolhe, entre os itens que casaram com a busca, o que realmente representa o status.
 *
 * `search: { key_: 'icmpping' }` no Zabbix também devolve `icmppingloss` e `icmppingsec`. Só valem
 * a chave exata e a forma parametrizada (`icmpping[...]`); qualquer sufixo alfanumérico é outro
 * item e é descartado em vez de virar um status errado.
 */
/** Prioridade da chave do item em relação ao item de status configurado no painel. */
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
  const raw = item.lastvalue?.trim();
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

/** Escolhe o item monitorado mais adequado à chave configurada (ex.: icmppingsec). */
export function pickBestZabbixItemByKey<T extends { key_?: string }>(
  items: T[],
  statusItemKey: string
): T | undefined {
  const wanted = statusItemKey.trim().toLowerCase();
  if (!wanted) {
    return undefined;
  }
  let best: { rank: number; item: T } | undefined;
  for (const item of items) {
    const rank = statusItemRank(item.key_?.trim().toLowerCase() ?? '', wanted);
    if (rank === undefined) {
      continue;
    }
    if (!best || rank < best.rank) {
      best = { rank, item };
    }
  }
  return best?.item;
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
    byRefId.set(refId, { hosts: new Set(), lastValues: new Map(), lastUpdatedAtSec: new Map() });
    refInfoByRef.set(refId, { refId, hint: `Grupo Zabbix: ${groupName.trim()}` });
  }

  const statusByHostId = statusValuesByHostId(statusItems, statusItemKey);

  for (const host of hosts) {
    const hostKey = host.name.trim();
    if (!hostKey) {
      continue;
    }
    allHosts.add(hostKey);
    indexDirectHostMetadata(metadata, host);

    const status = statusByHostId.get(host.hostid);
    for (const groupName of host.groups) {
      const bucket = byRefId.get(directRefId(groupName));
      if (!bucket) {
        continue;
      }
      bucket.hosts.add(hostKey);
      if (status !== undefined) {
        bucket.lastValues.set(hostKey, status.value);
        if (status.updatedAtSec != null) {
          bucket.lastUpdatedAtSec.set(hostKey, status.updatedAtSec);
        }
        const ip = host.ip?.trim();
        if (ip && isIpv4(ip)) {
          bucket.lastValues.set(ip, status.value);
          if (status.updatedAtSec != null) {
            bucket.lastUpdatedAtSec.set(ip, status.updatedAtSec);
          }
        }
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
