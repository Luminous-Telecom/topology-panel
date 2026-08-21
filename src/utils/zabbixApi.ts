import { getBackendSrv } from '@grafana/runtime';
import { TimeRange } from '@grafana/data';
import { HostMetadata, HostMetadataMap } from '../types';
import { HostProblemsMap, ZABBIX_PROBLEM_MIN_SEVERITY } from './noc/types';
import { isIpv4 } from './ipv4';
import { collectHostLookupCandidates, HostLookupRef } from './hostLookup';
import { pickBestZabbixItemByKey } from '../services/zabbixDirectIndex';
import {
  buildHostHoverSeriesFromZabbixHistory,
  HostHoverSeries,
} from './hostTimeSeries';
import { StatusColorOptions } from './statusMapping';
import { createAsyncCache } from '../services/asyncCache';

interface ZabbixApiResponse<T> {
  result?: T;
  error?: { message?: string };
}

interface ZabbixHost {
  hostid?: string;
  host: string;
  name: string;
  interfaces?: Array<{ ip: string; main?: string; type?: string }>;
  groups?: Array<{ name?: string }>;
  tags?: Array<{ tag?: string; value?: string }>;
}

const BATCH_SIZE = 50;
/** Zabbix host.status — 0 monitorado, 1 desativado. */
const ZABBIX_HOST_MONITORED = 0;

function asZabbixId(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

/** Requisição abortada pelo Grafana/React ou queda momentânea de rede — não é falha permanente. */
export function isBenignZabbixFetchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /failed to fetch|context canceled|context cancelled|abort|network error|networkerror/i.test(msg);
}

async function zabbixCall<T>(datasourceUid: string, method: string, params: object): Promise<T> {
  let response: ZabbixApiResponse<T> | T;
  try {
    response = await getBackendSrv().post<ZabbixApiResponse<T> | T>(
      `/api/datasources/uid/${datasourceUid}/resources/zabbix-api`,
      { method, params }
    );
  } catch (err) {
    if (isBenignZabbixFetchError(err)) {
      throw err;
    }
    throw new Error('Falha ao consultar o Zabbix.');
  }
  if (response && typeof response === 'object' && 'error' in response && response.error) {
    throw new Error(response.error.message ?? 'Falha ao consultar o Zabbix.');
  }
  if (response && typeof response === 'object' && 'result' in response) {
    return (response as ZabbixApiResponse<T>).result as T;
  }
  return response as T;
}


function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function fetchHostsByInterfaceIp(
  datasourceUid: string,
  ips: string[],
  withInterfaces = true
): Promise<ZabbixHost[]> {
  const missing = ips.map((ip) => ip.trim()).filter((ip) => isIpv4(ip));
  if (!missing.length) {
    return [];
  }
  const hosts: ZabbixHost[] = [];
  for (const batch of chunk(missing, BATCH_SIZE)) {
    try {
      const params: {
        filter: { ip: string[]; status: number };
        output: string[];
        selectInterfaces?: string[];
      } = {
        filter: { ip: batch, status: ZABBIX_HOST_MONITORED },
        output: ['hostid', 'host', 'name'],
      };
      if (withInterfaces) {
        params.selectInterfaces = ['ip', 'main', 'type'];
      }
      const batchHosts = await zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', params);
      for (const h of batchHosts ?? []) {
        hosts.push(h);
      }
    } catch {
      /* lote sem resposta */
    }
  }
  return hosts;
}

async function resolveZabbixHostId(datasourceUid: string, hostName: string): Promise<string | undefined> {
  const name = hostName.trim();
  if (!name) {
    return undefined;
  }
  if (isIpv4(name)) {
    const byIp = await fetchHostsByInterfaceIp(datasourceUid, [name], false);
    const ipHostId = asZabbixId(byIp[0]?.hostid);
    if (ipHostId) {
      return ipHostId;
    }
  }
  let hosts = await zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
    filter: { name: [name] },
    output: ['hostid'],
  });
  if (!hosts?.length) {
    hosts = await zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
      filter: { host: [name] },
      output: ['hostid'],
    });
  }
  return asZabbixId(hosts?.[0]?.hostid) || undefined;
}

function pickMainInterfaceIp(
  interfaces?: Array<{ ip: string; main?: string; type?: string }>
): string | undefined {
  if (!interfaces?.length) {
    return undefined;
  }
  const main = interfaces.find((iface) => iface.main === '1');
  if (main?.ip && isIpv4(main.ip)) {
    return main.ip.trim();
  }
  const agent = interfaces.find((iface) => iface.type === '1');
  if (agent?.ip && isIpv4(agent.ip)) {
    return agent.ip.trim();
  }
  for (const iface of interfaces) {
    const ip = iface.ip?.trim();
    if (ip && isIpv4(ip)) {
      return ip;
    }
  }
  return undefined;
}

function indexZabbixHostMetadata(result: HostMetadataMap, host: ZabbixHost): void {
  const visibleName = host.name?.trim() || host.host?.trim();
  const technicalName = host.host?.trim();
  const hostid = asZabbixId(host.hostid) || undefined;
  const ip = pickMainInterfaceIp(host.interfaces);
  if (!visibleName && !technicalName) {
    return;
  }
  const entry: HostMetadata = {
    name: visibleName || technicalName || '',
    ip,
    hostid,
    hostGroups: host.groups?.map((g) => g.name?.trim()).filter((n): n is string => Boolean(n)),
    tags: host.tags?.map((t) => ({ tag: t.tag?.trim() ?? '', value: t.value?.trim() ?? '' })),
  };
  const keys = [visibleName, technicalName, hostid, ip];
  for (const key of keys) {
    const trimmed = key?.trim();
    if (!trimmed) {
      continue;
    }
    const prev = result[trimmed];
    result[trimmed] = prev
      ? {
          name: entry.name || prev.name,
          ip: prev.ip && isIpv4(prev.ip) ? prev.ip : entry.ip,
          hostid: prev.hostid || entry.hostid,
          hostGroups: entry.hostGroups?.length ? entry.hostGroups : prev.hostGroups,
          tags: entry.tags?.length ? entry.tags : prev.tags,
        }
      : entry;
  }
}

/** IP/nome da interface principal via host.get — usado quando a Query não traz IP nos labels. */
export async function fetchZabbixHostMetadata(
  datasourceUid: string,
  hostNames: string[]
): Promise<HostMetadataMap> {
  const names = [
    ...new Set(
      hostNames
        .map((name) => name.trim())
        .filter((name) => Boolean(name) && !isIpv4(name))
    ),
  ];
  if (!datasourceUid || !names.length) {
    return {};
  }

  const result: HostMetadataMap = {};
  const seenHostIds = new Set<string>();

  for (const batch of chunk(names, BATCH_SIZE)) {
    try {
      const [byName, byHost] = await Promise.all([
        zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
          filter: { name: batch },
          output: ['hostid', 'host', 'name'],
          selectInterfaces: ['ip', 'main', 'type'],
          selectHostGroups: ['name'],
          selectTags: ['tag', 'value'],
        }),
        zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
          filter: { host: batch },
          output: ['hostid', 'host', 'name'],
          selectInterfaces: ['ip', 'main', 'type'],
          selectHostGroups: ['name'],
          selectTags: ['tag', 'value'],
        }),
      ]);
      for (const host of [...(byName ?? []), ...(byHost ?? [])]) {
        const hostid = asZabbixId(host.hostid);
        if (hostid && seenHostIds.has(hostid)) {
          continue;
        }
        if (hostid) {
          seenHostIds.add(hostid);
        }
        indexZabbixHostMetadata(result, host);
      }
    } catch {
      /* lote sem resposta */
    }
  }

  return result;
}

export interface HostIcmpStatus {
  reachable: boolean | null;
  lossPct: number | null;
  rttMs: number | null;
  lastClock?: number;
  error?: string;
}

interface ZabbixIcmpItem {
  key_: string;
  lastvalue?: string;
  lastclock?: string;
}

function parseFloatOrNull(value?: string): number | null {
  if (value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

let cachedPingScriptIds: { panel?: string; continuous?: string } | undefined;

interface PingScriptResult {
  success: boolean;
  output: string;
  error?: string;
}

async function fetchPingScriptIds(
  datasourceUid: string
): Promise<{ panel?: string; continuous?: string }> {
  if (cachedPingScriptIds !== undefined) {
    return cachedPingScriptIds;
  }
  const scripts = await zabbixCall<Array<{ scriptid: string; name: string }>>(datasourceUid, 'script.get', {
    output: ['scriptid', 'name'],
  });
  const byName = (name: string) =>
    scripts?.find((s) => s.name?.trim().toLowerCase() === name.toLowerCase())?.scriptid;
  cachedPingScriptIds = {
    panel: byName('Ping rápido') ?? byName('Ping'),
    continuous: byName('Ping'),
  };
  return cachedPingScriptIds;
}

/** Executa script Ping no Zabbix (Alerts → Scripts). Modo painel = pacotes curtos. */
export async function executeHostPingScript(
  datasourceUid: string,
  hostName: string,
  mode: 'panel' | 'continuous' = 'panel'
): Promise<PingScriptResult> {
  if (!datasourceUid || !hostName.trim()) {
    return { success: false, output: '', error: 'Host ou datasource Zabbix não configurado' };
  }

  try {
    const hostId = await resolveZabbixHostId(datasourceUid, hostName);
    if (!hostId) {
      return { success: false, output: '', error: `Host "${hostName.trim()}" não encontrado no Zabbix` };
    }

    const ids = await fetchPingScriptIds(datasourceUid);
    const scriptId = mode === 'continuous' ? ids.continuous : ids.panel;
    if (!scriptId) {
      return { success: false, output: '', error: 'Script Ping não encontrado no Zabbix (Alerts → Scripts)' };
    }

    const result = await zabbixCall<{ response?: string; value?: string }>(datasourceUid, 'script.execute', {
      scriptid: scriptId,
      hostid: hostId,
    });

    const output = result.value?.trim() ?? '';
    if (result.response === 'success' && output) {
      return { success: true, output };
    }
    if (output) {
      return { success: result.response === 'success', output };
    }
    return {
      success: false,
      output: '',
      error: 'Ping executado, mas sem saída. Verifique permissões de script no Zabbix.',
    };
  } catch (err) {
    return { success: false, output: '', error: String(err) };
  }
}

/** Última medição ICMP do host no Zabbix (icmpping / icmppingloss / icmppingsec). */
export async function fetchHostIcmpStatus(
  datasourceUid: string,
  hostName: string
): Promise<HostIcmpStatus> {
  const empty: HostIcmpStatus = { reachable: null, lossPct: null, rttMs: null };

  if (!datasourceUid || !hostName.trim()) {
    return { ...empty, error: 'Host ou datasource Zabbix não configurado' };
  }

  const hostId = await resolveZabbixHostId(datasourceUid, hostName.trim());
  if (!hostId) {
    return { ...empty, error: `Host "${hostName.trim()}" não encontrado no Zabbix` };
  }

  const items = await zabbixCall<ZabbixIcmpItem[]>(datasourceUid, 'item.get', {
    hostids: [hostId],
    output: ['key_', 'lastvalue', 'lastclock'],
    search: { key_: 'icmpping' },
    searchByAny: true,
  });

  if (!items?.length) {
    return { ...empty, error: 'Itens ICMP (icmpping) não encontrados neste host' };
  }

  let reachable: boolean | null = null;
  let lossPct: number | null = null;
  let rttMs: number | null = null;
  let lastClock: number | undefined;

  for (const item of items) {
    const key = item.key_?.toLowerCase() ?? '';
    const val = item.lastvalue;
    const clock = parseFloatOrNull(item.lastclock ?? undefined);
    if (clock !== null) {
      lastClock = Math.max(lastClock ?? 0, clock);
    }

    if (key.includes('icmppingloss')) {
      lossPct = parseFloatOrNull(val);
    } else if (key.includes('icmppingsec')) {
      const sec = parseFloatOrNull(val);
      rttMs = sec !== null ? sec * 1000 : null;
    } else if (key.startsWith('icmpping')) {
      const n = parseFloatOrNull(val);
      if (n !== null) {
        reachable = n >= 1;
      }
    }
  }

  if (reachable === null) {
    if (rttMs !== null && rttMs > 0) {
      reachable = true;
    } else if (lossPct !== null) {
      reachable = lossPct < 100;
    }
  } else if (rttMs !== null && rttMs > 0) {
    reachable = true;
  } else if (lossPct !== null && lossPct < 100) {
    reachable = true;
  }

  return { reachable, lossPct, rttMs, lastClock };
}

export interface ZabbixInterfaceItem {
  itemid: string;
  key_: string;
  name?: string;
  lastvalue?: string;
  lastclock?: string;
  hostid?: string;
  value_type?: string;
  tags?: Array<{ tag: string; value: string }>;
}

export interface ZabbixHostInterfaceItems {
  hostKey: string;
  hostid: string;
  items: ZabbixInterfaceItem[];
}

export interface ZabbixItemLastValue {
  itemid: string;
  lastvalue?: string;
  lastclock?: string;
}

/** Últimos valores de itens em lote — usado para métricas de link em runtime. */
export async function fetchZabbixItemLastValues(
  datasourceUid: string,
  itemIds: string[]
): Promise<Record<string, ZabbixItemLastValue>> {
  const ids = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
  if (!datasourceUid || !ids.length) {
    return {};
  }

  const result: Record<string, ZabbixItemLastValue> = {};
  for (const batch of chunk(ids, BATCH_SIZE)) {
    try {
      const items = await zabbixCall<ZabbixItemLastValue[]>(datasourceUid, 'item.get', {
        itemids: batch,
        output: ['itemid', 'lastvalue', 'lastclock'],
      });
      for (const item of items ?? []) {
        const itemid = asZabbixId(item.itemid);
        if (itemid) {
          result[itemid] = item;
        }
      }
    } catch {
      /* lote sem resposta */
    }
  }
  return result;
}

/** Host do Zabbix no modo direto — já com IP, grupos e tags resolvidos. */
export interface ZabbixDirectHost {
  hostid: string;
  /** Nome técnico (`host`). */
  host: string;
  /** Nome visível (`name`). */
  name: string;
  ip?: string;
  /** Grupos do host, restritos aos configurados no painel. */
  groups: string[];
  tags?: Array<{ tag: string; value: string }>;
}

export interface ZabbixDirectSnapshot {
  hosts: ZabbixDirectHost[];
  /** Itens de status (`search` pela chave configurada) de todos os hosts do snapshot. */
  statusItems: ZabbixInterfaceItem[];
  /** Grupos configurados que existem de fato no Zabbix — vazio indica configuração errada. */
  resolvedGroups: string[];
}

/** Grupos de host disponíveis no Zabbix — alimenta o seletor de grupos do painel. */
export async function fetchZabbixHostGroupNames(datasourceUid: string): Promise<string[]> {
  if (!datasourceUid) {
    return [];
  }
  const groups = await zabbixCall<Array<{ name?: string }>>(datasourceUid, 'hostgroup.get', {
    output: ['groupid', 'name'],
    sortfield: 'name',
    real_hosts: true,
  });
  const names = new Set<string>();
  for (const group of groups ?? []) {
    const name = group.name?.trim();
    if (name) {
      names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

async function fetchGroupIdsByName(
  datasourceUid: string,
  groupNames: string[]
): Promise<Map<string, string>> {
  const groups = await zabbixCall<Array<{ groupid?: string; name?: string }>>(
    datasourceUid,
    'hostgroup.get',
    { output: ['groupid', 'name'], filter: { name: groupNames } }
  );
  const byName = new Map<string, string>();
  for (const group of groups ?? []) {
    const name = group.name?.trim();
    const groupid = asZabbixId(group.groupid);
    if (name && groupid) {
      byName.set(name, groupid);
    }
  }
  return byName;
}

async function fetchMonitoredHostsInGroups(
  datasourceUid: string,
  groupIds: string[],
  wantedGroups: Set<string>
): Promise<ZabbixDirectHost[]> {
  const rows = await zabbixCall<
    Array<ZabbixHost & { groups?: Array<{ name?: string }>; hostgroups?: Array<{ name?: string }> }>
  >(datasourceUid, 'host.get', {
    groupids: groupIds,
    output: ['hostid', 'host', 'name'],
    selectInterfaces: ['ip', 'main', 'type'],
    selectHostGroups: ['name'],
    selectTags: ['tag', 'value'],
    filter: { status: ZABBIX_HOST_MONITORED },
    monitored_hosts: true,
  });

  const hosts: ZabbixDirectHost[] = [];
  for (const row of rows ?? []) {
    const hostid = asZabbixId(row.hostid);
    const technical = row.host?.trim() ?? '';
    const visible = row.name?.trim() || technical;
    if (!hostid || !visible) {
      continue;
    }
    const rawGroups = row.hostgroups ?? row.groups ?? [];
    const groups = rawGroups
      .map((group) => group.name?.trim() ?? '')
      .filter((name) => wantedGroups.has(name));
    hosts.push({
      hostid,
      host: technical,
      name: visible,
      ip: pickMainInterfaceIp(row.interfaces),
      groups,
      tags: row.tags
        ?.map((tag) => ({ tag: tag.tag?.trim() ?? '', value: tag.value?.trim() ?? '' }))
        .filter((tag) => Boolean(tag.tag)),
    });
  }
  return hosts;
}

async function fetchStatusItemsForHosts(
  datasourceUid: string,
  hostIds: string[],
  statusItemKey: string
): Promise<ZabbixInterfaceItem[]> {
  const items: ZabbixInterfaceItem[] = [];
  for (const batch of chunk(hostIds, BATCH_SIZE)) {
    try {
      const batchItems = await zabbixCall<ZabbixInterfaceItem[]>(datasourceUid, 'item.get', {
        hostids: batch,
        output: ['itemid', 'key_', 'name', 'lastvalue', 'lastclock', 'hostid', 'value_type'],
        search: { key_: statusItemKey },
        monitored: true,
      });
      for (const item of batchItems ?? []) {
        items.push(item);
      }
    } catch {
      /* lote sem resposta */
    }
  }
  return items;
}

interface ZabbixHistoryStatusRow {
  itemid?: string;
  clock?: string;
  value?: string;
}

function zabbixHistoryTypeFromItem(item: ZabbixInterfaceItem): 0 | 3 {
  const valueType = item.value_type != null ? Number(item.value_type) : undefined;
  return valueType === 0 ? 0 : 3;
}

/** Alinha lastvalue/lastclock do poll com o histórico ICMP recente (mesma fonte do hover). */
async function applyRecentHistoryToStatusItems(
  datasourceUid: string,
  items: ZabbixInterfaceItem[],
  lookbackSec = 120
): Promise<ZabbixInterfaceItem[]> {
  if (!items.length) {
    return items;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const timeFrom = nowSec - lookbackSec;
  const next = items.map((item) => ({ ...item }));
  const byHistoryType = new Map<0 | 3, ZabbixInterfaceItem[]>();

  for (const item of next) {
    const historyType = zabbixHistoryTypeFromItem(item);
    const bucket = byHistoryType.get(historyType) ?? [];
    bucket.push(item);
    byHistoryType.set(historyType, bucket);
  }

  for (const [historyType, typedItems] of byHistoryType) {
    const itemIds = typedItems
      .map((item) => asZabbixId(item.itemid))
      .filter((itemid): itemid is string => Boolean(itemid));

    for (const batch of chunk(itemIds, BATCH_SIZE)) {
      try {
        const rows = await zabbixCall<ZabbixHistoryStatusRow[]>(datasourceUid, 'history.get', {
          output: ['itemid', 'clock', 'value'],
          history: historyType,
          itemids: batch,
          time_from: timeFrom,
          time_till: nowSec,
          sortfield: 'clock',
          sortorder: 'DESC',
          limit: Math.min(batch.length * 5, 500),
        });

        const latestByItem = new Map<string, ZabbixHistoryStatusRow>();
        for (const row of rows ?? []) {
          const itemid = asZabbixId(row.itemid);
          if (!itemid || latestByItem.has(itemid)) {
            continue;
          }
          latestByItem.set(itemid, row);
        }

        for (const item of typedItems) {
          const itemid = asZabbixId(item.itemid);
          if (!itemid) {
            continue;
          }
          const row = latestByItem.get(itemid);
          if (!row?.clock) {
            continue;
          }
          const histClock = parseFloatOrNull(row.clock);
          const itemClock = parseFloatOrNull(item.lastclock ?? undefined);
          if (histClock === null) {
            continue;
          }
          if (itemClock === null || histClock >= itemClock) {
            item.lastvalue = row.value;
            item.lastclock = row.clock;
          }
        }
      } catch {
        /* lote sem resposta */
      }
    }
  }

  return next;
}

/**
 * Hosts e últimos valores de status dos grupos configurados — base do modo "Zabbix direto".
 *
 * Usa `item.get` e complementa com o ponto mais recente do histórico ICMP no intervalo curto,
 * alinhando a cor do mapa ao hover (sem depender de passar o mouse).
 */
export async function fetchZabbixDirectSnapshot(
  datasourceUid: string,
  groupNames: string[],
  statusItemKey: string
): Promise<ZabbixDirectSnapshot> {
  const wanted = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  const itemKey = statusItemKey.trim();
  if (!datasourceUid || !wanted.length || !itemKey) {
    return { hosts: [], statusItems: [], resolvedGroups: [] };
  }

  const groupIdByName = await fetchGroupIdsByName(datasourceUid, wanted);
  const resolvedGroups = [...groupIdByName.keys()];
  if (!resolvedGroups.length) {
    return { hosts: [], statusItems: [], resolvedGroups };
  }

  const hosts = await fetchMonitoredHostsInGroups(
    datasourceUid,
    [...groupIdByName.values()],
    new Set(resolvedGroups)
  );
  if (!hosts.length) {
    return { hosts, statusItems: [], resolvedGroups };
  }

  const statusItems = await fetchStatusItemsForHosts(
    datasourceUid,
    hosts.map((host) => host.hostid),
    itemKey
  );
  const refreshedStatusItems = await applyRecentHistoryToStatusItems(datasourceUid, statusItems);
  return { hosts, statusItems: refreshedStatusItems, resolvedGroups };
}

/**
 * Prefixos de key que cobrem as métricas de interface reconhecidas por `parseInterfaceItemKey`.
 * A classificação final continua sendo dela — aqui a lista só evita puxar o inventário inteiro do
 * host, que em roteador grande passa de milhares de itens.
 */
const INTERFACE_ITEM_SEARCH_KEYS = [
  'net.if.',
  'ifHCInOctets',
  'ifHCOutOctets',
  'ifInOctets',
  'ifOutOctets',
  'ifOperStatus',
  'ifAdminStatus',
  'ifSpeed',
  'ifInErrors',
  'ifOutErrors',
  'ifInDiscards',
  'ifOutDiscards',
];

/**
 * Itens de interface monitorados por host — inventário do seletor de interface do link.
 * Usado quando o painel não tem aba Query alimentando o índice (modo "Zabbix direto").
 */
export async function fetchZabbixHostInterfaceItems(
  datasourceUid: string,
  hostKeys: string[],
  extraSearchKeys: string[] = []
): Promise<ZabbixHostInterfaceItems[]> {
  const keys = [...new Set(hostKeys.map((key) => key.trim()).filter(Boolean))];
  if (!datasourceUid || !keys.length) {
    return [];
  }

  const hostIdByKey = new Map<string, string>();
  for (const key of keys) {
    const hostId = await resolveZabbixHostId(datasourceUid, key);
    if (hostId) {
      hostIdByKey.set(key, hostId);
    }
  }

  const hostIds = [...new Set(hostIdByKey.values())];
  const searchKeys = [
    ...INTERFACE_ITEM_SEARCH_KEYS,
    ...extraSearchKeys.map((key) => key.trim()).filter(Boolean),
  ];
  const itemsByHostId = new Map<string, ZabbixInterfaceItem[]>();
  for (const batch of chunk(hostIds, BATCH_SIZE)) {
    try {
      const items = await zabbixCall<ZabbixInterfaceItem[]>(datasourceUid, 'item.get', {
        hostids: batch,
        output: ['itemid', 'key_', 'name', 'lastvalue', 'lastclock', 'hostid'],
        search: { key_: searchKeys },
        searchByAny: true,
        monitored: true,
      });
      for (const item of items ?? []) {
        const hostid = asZabbixId(item.hostid);
        if (!hostid) {
          continue;
        }
        const list = itemsByHostId.get(hostid) ?? [];
        list.push(item);
        itemsByHostId.set(hostid, list);
      }
    } catch {
      /* lote sem resposta */
    }
  }

  const result: ZabbixHostInterfaceItems[] = [];
  for (const [hostKey, hostid] of hostIdByKey) {
    result.push({ hostKey, hostid, items: itemsByHostId.get(hostid) ?? [] });
  }
  return result;
}

const NEIGHBOR_ITEM_SEARCH_KEYS = ['lldp', 'cdp', 'cdpCache', 'LLDP', 'CDP', 'lldpRem', 'cdpRem'];

async function fetchNeighborItemsForHostIds(
  datasourceUid: string,
  hostIds: string[]
): Promise<ZabbixInterfaceItem[]> {
  if (!hostIds.length) {
    return [];
  }
  const items: ZabbixInterfaceItem[] = [];
  for (const batch of chunk(hostIds, BATCH_SIZE)) {
    try {
      const batchItems = await zabbixCall<ZabbixInterfaceItem[]>(datasourceUid, 'item.get', {
        hostids: batch,
        output: ['itemid', 'key_', 'name', 'lastvalue', 'lastclock', 'hostid'],
        selectTags: ['tag', 'value'],
        search: { key_: NEIGHBOR_ITEM_SEARCH_KEYS },
        searchByAny: true,
      });
      for (const item of batchItems ?? []) {
        items.push(item);
      }
    } catch {
      /* lote sem resposta */
    }
  }
  return items;
}

/**
 * Itens LLDP/CDP monitorados no Zabbix — dependem do template/LLD configurado no host.
 * Sem itens lldp/cdp no host, retorna lista vazia (não é erro).
 */
export async function fetchZabbixNeighborItems(
  datasourceUid: string,
  hostKeys: string[]
): Promise<ZabbixHostInterfaceItems[]> {
  const keys = [...new Set(hostKeys.map((k) => k.trim()).filter(Boolean))];
  if (!datasourceUid || !keys.length) {
    return [];
  }

  const hostIdByKey = new Map<string, string>();
  for (const key of keys) {
    const hostId = await resolveZabbixHostId(datasourceUid, key);
    if (hostId) {
      hostIdByKey.set(key, hostId);
    }
  }

  const hostIds = [...new Set(hostIdByKey.values())];
  const items = await fetchNeighborItemsForHostIds(datasourceUid, hostIds);

  const itemsByHostId = new Map<string, ZabbixInterfaceItem[]>();
  for (const item of items) {
    const hostid = asZabbixId(item.hostid);
    if (!hostid) {
      continue;
    }
    const list = itemsByHostId.get(hostid) ?? [];
    list.push(item);
    itemsByHostId.set(hostid, list);
  }

  const result: ZabbixHostInterfaceItems[] = [];
  for (const [hostKey, hostid] of hostIdByKey) {
    result.push({
      hostKey,
      hostid,
      items: itemsByHostId.get(hostid) ?? [],
    });
  }
  return result;
}

interface ZabbixProblemRow {
  eventid?: string;
  severity?: string;
}

interface ZabbixProblemEventRow {
  eventid?: string;
  hosts?: Array<{ hostid?: string }>;
}

/**
 * Problemas ativos no Zabbix por host — badges e filtro NOC (não altera lista ALERTA nem cor do mapa).
 */
export async function fetchZabbixHostProblems(
  datasourceUid: string,
  hostIds: string[]
): Promise<HostProblemsMap> {
  const ids = [...new Set(hostIds.map((id) => asZabbixId(id)).filter(Boolean))];
  if (!datasourceUid || !ids.length) {
    return {};
  }

  const summary: HostProblemsMap = {};

  for (const batch of chunk(ids, BATCH_SIZE)) {
    try {
      const problems = await zabbixCall<ZabbixProblemRow[]>(datasourceUid, 'problem.get', {
        hostids: batch,
        output: ['eventid', 'severity'],
        suppressed: false,
      });

      const eventIds = [
        ...new Set((problems ?? []).map((problem) => asZabbixId(problem.eventid)).filter(Boolean)),
      ];
      if (!eventIds.length) {
        continue;
      }

      const severityByEvent = new Map<string, number>();
      for (const problem of problems ?? []) {
        const eventid = asZabbixId(problem.eventid);
        if (!eventid) {
          continue;
        }
        const severity = Number(problem.severity);
        severityByEvent.set(eventid, Number.isFinite(severity) ? severity : 0);
      }

      const events = await zabbixCall<ZabbixProblemEventRow[]>(datasourceUid, 'event.get', {
        eventids: eventIds,
        output: ['eventid'],
        selectHosts: ['hostid'],
      });

      for (const event of events ?? []) {
        const eventid = asZabbixId(event.eventid);
        if (!eventid) {
          continue;
        }
        const sev = severityByEvent.get(eventid) ?? 0;
        if (sev < ZABBIX_PROBLEM_MIN_SEVERITY) {
          continue;
        }
        for (const host of event.hosts ?? []) {
          const hostid = asZabbixId(host.hostid);
          if (!hostid) {
            continue;
          }
          const prev = summary[hostid];
          summary[hostid] = {
            count: (prev?.count ?? 0) + 1,
            maxSeverity: Math.max(prev?.maxSeverity ?? 0, sev),
          };
        }
      }
    } catch {
      /* lote sem resposta */
    }
  }

  return summary;
}

interface ZabbixHoverItem {
  itemid: string;
  key_: string;
  name?: string;
  value_type?: string;
  lastvalue?: string;
  lastclock?: string;
}

interface ZabbixHistoryRow {
  clock: string;
  value: string;
}

const hoverSeriesCache = createAsyncCache<HostHoverSeries | undefined>({
  ttlMs: 15_000,
  isCacheable: (value) => Boolean(value?.points.length),
});

function resolveHostIdFromLookup(ref: HostLookupRef, metadata?: HostMetadataMap): string | undefined {
  for (const candidate of collectHostLookupCandidates(ref, metadata)) {
    const entry = metadata?.[candidate];
    const hostid = entry?.hostid?.trim();
    if (hostid) {
      return hostid;
    }
  }
  return undefined;
}

function zabbixHistoryType(valueType: number | undefined): 0 | 3 {
  return valueType === 0 ? 0 : 3;
}

function hoverItemLabel(item: ZabbixHoverItem): string {
  const name = item.name?.trim();
  if (name) {
    return name;
  }
  const key = item.key_?.trim();
  return key || 'ICMP';
}

async function fetchZabbixItemHistory(
  datasourceUid: string,
  item: ZabbixHoverItem,
  timeFromSec: number,
  timeTillSec: number
): Promise<Array<{ clockSec: number; value: number }>> {
  const itemid = asZabbixId(item.itemid);
  if (!itemid) {
    return [];
  }
  const valueType = item.value_type != null ? Number(item.value_type) : undefined;
  const rows = await zabbixCall<ZabbixHistoryRow[]>(datasourceUid, 'history.get', {
    output: ['clock', 'value'],
    history: zabbixHistoryType(Number.isFinite(valueType) ? valueType : undefined),
    itemids: [itemid],
    time_from: timeFromSec,
    time_till: timeTillSec,
    sortfield: 'clock',
    sortorder: 'ASC',
    limit: 500,
  });

  const points: Array<{ clockSec: number; value: number }> = [];
  for (const row of rows ?? []) {
    const clockSec = parseFloatOrNull(row.clock);
    const value = parseFloatOrNull(row.value);
    if (clockSec === null || value === null) {
      continue;
    }
    points.push({ clockSec, value });
  }

  if (points.length) {
    return points;
  }

  const lastClock = parseFloatOrNull(item.lastclock ?? undefined);
  const lastValue = parseFloatOrNull(item.lastvalue ?? undefined);
  if (lastClock !== null && lastValue !== null) {
    return [{ clockSec: lastClock, value: lastValue }];
  }

  return [];
}

/** Histórico ICMP/perda para o hover no modo Zabbix direto (substitui séries da aba Query). */
export async function fetchHostHoverSeriesFromZabbix(
  datasourceUid: string,
  ref: HostLookupRef,
  metadata: HostMetadataMap | undefined,
  timeRange: TimeRange | undefined,
  statusItemKey: string,
  statusOptions: StatusColorOptions
): Promise<HostHoverSeries | undefined> {
  if (!datasourceUid) {
    return undefined;
  }

  const hostid =
    resolveHostIdFromLookup(ref, metadata) ??
    (await resolveZabbixHostId(
      datasourceUid,
      ref.zabbixHost?.trim() || ref.label?.trim() || ''
    ));
  if (!hostid) {
    return undefined;
  }

  const fromSec = Math.floor((timeRange?.from.valueOf() ?? Date.now() - 5 * 60_000) / 1000);
  const tillSec = Math.floor((timeRange?.to.valueOf() ?? Date.now()) / 1000);
  const cacheKey = `${datasourceUid}\u0000${hostid}\u0000${fromSec}\u0000${tillSec}\u0000${statusItemKey.trim().toLowerCase()}`;

  return hoverSeriesCache.get(cacheKey, async () => {
    const wantedKey = statusItemKey.trim() || 'icmpping';
    let items = await zabbixCall<ZabbixHoverItem[]>(datasourceUid, 'item.get', {
      hostids: [hostid],
      output: ['itemid', 'key_', 'name', 'value_type', 'lastvalue', 'lastclock'],
      search: { key_: wantedKey },
      monitored: true,
    });

    let picked = pickBestZabbixItemByKey(items ?? [], wantedKey);
    if (!picked) {
      items = await zabbixCall<ZabbixHoverItem[]>(datasourceUid, 'item.get', {
        hostids: [hostid],
        output: ['itemid', 'key_', 'name', 'value_type', 'lastvalue', 'lastclock'],
        search: { key_: 'icmpping' },
        searchByAny: true,
        monitored: true,
      });
      picked = pickBestZabbixItemByKey(items ?? [], wantedKey);
    }
    if (!picked) {
      return undefined;
    }

    const rawPoints = await fetchZabbixItemHistory(datasourceUid, picked, fromSec, tillSec);
    return buildHostHoverSeriesFromZabbixHistory(
      rawPoints,
      picked.key_ ?? wantedKey,
      hoverItemLabel(picked),
      statusOptions
    );
  });
}
