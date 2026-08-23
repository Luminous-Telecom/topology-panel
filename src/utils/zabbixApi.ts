import { getBackendSrv } from '@grafana/runtime';
import { TimeRange } from '@grafana/data';
import { HostMetadataMap } from '../types';
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
  description?: string;
  interfaces?: Array<{ ip: string; main?: string; type?: string }>;
  groups?: Array<{ name?: string }>;
  tags?: Array<{ tag?: string; value?: string }>;
}

/** Campos de identidade + descrição do host — usado no snapshot e no metadata. */
const ZABBIX_HOST_OUTPUT = ['hostid', 'host', 'name', 'description'];

function normalizeZabbixHostDescription(raw?: string): string | undefined {
  const text = raw?.replace(/\s+/g, ' ').trim();
  return text || undefined;
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

const ZABBIX_CALL_TIMEOUT_MS = 15_000;
/**
 * Teto para a chamada única de status, que cobre todos os hosts dos grupos de uma vez. Ela tem
 * payload maior que as demais e não tem para onde ser dividida sem voltar a somar round-trips.
 */
const ZABBIX_STATUS_CALL_TIMEOUT_MS = 45_000;

/** Opções extras da chamada Zabbix — cancelamento e silêncio de toast em polling. */
interface ZabbixCallOptions {
  abortSignal?: AbortSignal;
  /** Cancela a requisição anterior com o mesmo id no BackendSrv do Grafana. */
  requestId?: string;
  showErrorAlert?: boolean;
}

/** Requisição abortada pelo Grafana/React, timeout ou queda momentânea de rede — não é falha permanente. */
export function isBenignZabbixFetchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /failed to fetch|context canceled|context cancelled|abort|request was aborted|network error|networkerror|timeout/i.test(
    msg
  );
}

function throwIfAborted(abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted) {
    throw new Error('abort');
  }
}

async function zabbixCall<T>(
  datasourceUid: string,
  method: string,
  params: object,
  timeoutMs = ZABBIX_CALL_TIMEOUT_MS,
  callOptions: ZabbixCallOptions = {}
): Promise<T> {
  throwIfAborted(callOptions.abortSignal);

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort();
  if (callOptions.abortSignal) {
    callOptions.abortSignal.addEventListener('abort', abortFromParent, { once: true });
  }

  let response: ZabbixApiResponse<T> | T;
  try {
    response = await getBackendSrv().post<ZabbixApiResponse<T> | T>(
      `/api/datasources/uid/${datasourceUid}/resources/zabbix-api`,
      { method, params },
      {
        abortSignal: controller.signal,
        showErrorAlert: callOptions.showErrorAlert ?? false,
        requestId: callOptions.requestId,
      }
    );
  } catch (err) {
    if (isBenignZabbixFetchError(err)) {
      throw err;
    }
    throw new Error('Falha ao consultar o Zabbix.');
  } finally {
    window.clearTimeout(timer);
    callOptions.abortSignal?.removeEventListener('abort', abortFromParent);
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
  const seen = new Set<string>();
  const addHosts = (batchHosts: ZabbixHost[] | undefined) => {
    for (const host of batchHosts ?? []) {
      const hostid = asZabbixId(host.hostid);
      if (hostid && seen.has(hostid)) {
        continue;
      }
      if (hostid) {
        seen.add(hostid);
      }
      hosts.push(host);
    }
  };
  const output = ['hostid', 'host', 'name'];
  const selectInterfaces = withInterfaces ? ['ip', 'main', 'type'] : undefined;

  for (const ip of missing) {
    try {
      addHosts(
        await zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
          searchInterfaces: { ip },
          filter: { status: ZABBIX_HOST_MONITORED },
          output,
          ...(selectInterfaces ? { selectInterfaces } : {}),
        })
      );
    } catch {
      try {
        addHosts(
          await zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
            filter: { ip: [ip], status: ZABBIX_HOST_MONITORED },
            output,
            ...(selectInterfaces ? { selectInterfaces } : {}),
          })
        );
      } catch {
        /* lote sem resposta */
      }
    }
  }
  return hosts;
}

async function resolveZabbixHostId(datasourceUid: string, hostName: string): Promise<string | undefined> {
  const name = hostName.trim();
  if (!name) {
    return undefined;
  }
  if (/^\d+$/.test(name)) {
    try {
      const byId = await zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
        hostids: [name],
        output: ['hostid'],
      });
      const id = asZabbixId(byId?.[0]?.hostid);
      if (id) {
        return id;
      }
    } catch {
      /* id numérico sem host — tenta IP/nome */
    }
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

export interface HostIcmpStatus {
  reachable: boolean | null;
  lossPct: number | null;
  rttMs: number | null;
  lastClock?: number;
  error?: string;
}

interface ZabbixIcmpItem {
  itemid?: string;
  key_: string;
  lastvalue?: string;
  lastclock?: string;
  value_type?: string | number;
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

/**
 * Última medição ICMP do host no Zabbix (icmpping / icmppingloss / icmppingsec).
 * Lê `lastvalue`/`lastclock` do `item.get` — sem overlay de histórico.
 */
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

  const rawItems = await zabbixCall<ZabbixIcmpItem[]>(datasourceUid, 'item.get', {
    hostids: [hostId],
    output: ['itemid', 'key_', 'lastvalue', 'lastclock', 'value_type'],
    search: { key_: 'icmpping' },
    searchByAny: true,
  });

  if (!rawItems?.length) {
    return { ...empty, error: 'Itens ICMP (icmpping) não encontrados neste host' };
  }

  const items: ZabbixInterfaceItem[] = rawItems.map((item) => ({
    itemid: asZabbixId(item.itemid),
    key_: item.key_,
    lastvalue: item.lastvalue,
    lastclock: item.lastclock,
    value_type: item.value_type,
  }));

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
  value_type?: string | number;
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
  value_type?: string | number;
}

/**
 * Tráfego dos cabos — todos os itemids numa única `item.get`, sem `history.get` por cima.
 *
 * Mesmo raciocínio do status: `lastvalue` já é o valor corrente do item, e os lotes de 50 mais o
 * histórico respondiam por dezenas de requisições por ciclo.
 */
export async function fetchZabbixItemLastValues(
  datasourceUid: string,
  itemIds: string[],
  abortSignal?: AbortSignal
): Promise<Record<string, ZabbixItemLastValue>> {
  const ids = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
  if (!datasourceUid || !ids.length) {
    return {};
  }

  const result: Record<string, ZabbixItemLastValue> = {};
  const items = await zabbixCall<ZabbixItemLastValue[]>(
    datasourceUid,
    'item.get',
    {
      itemids: ids,
      output: ['itemid', 'lastvalue', 'lastclock', 'value_type'],
    },
    ZABBIX_STATUS_CALL_TIMEOUT_MS,
    {
      abortSignal,
      requestId: `topology-linkmetrics-${datasourceUid}`,
    }
  );
  for (const item of items ?? []) {
    const itemid = asZabbixId(item.itemid);
    if (itemid) {
      result[itemid] = item;
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
  /** Campo Descrição do host no Zabbix. */
  description?: string;
  /** Grupos do host, restritos aos configurados no painel. */
  groups: string[];
  tags?: Array<{ tag: string; value: string }>;
}

/** Identidade dos hosts dos grupos — buscada por configuração, não a cada ciclo de status. */
export interface ZabbixDirectMetadata {
  hosts: ZabbixDirectHost[];
  /** Grupos configurados que existem de fato no Zabbix — vazio indica configuração errada. */
  resolvedGroups: string[];
  /** groupids resolvidos, reaproveitados pela descoberta única dos itemids de status. */
  groupIds: string[];
}

/** Grupos de host disponíveis no Zabbix — alimenta o MultiSelect do submapa. */
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
  groupNames: string[],
  callOptions: ZabbixCallOptions = {}
): Promise<Map<string, string>> {
  const wantedKeys = new Set(groupNames.map((name) => name.trim().toUpperCase()).filter(Boolean));
  const groups = await zabbixCall<Array<{ groupid?: string; name?: string }>>(
    datasourceUid,
    'hostgroup.get',
    { output: ['groupid', 'name'] },
    ZABBIX_CALL_TIMEOUT_MS,
    callOptions
  );
  const byName = new Map<string, string>();
  for (const group of groups ?? []) {
    const name = group.name?.trim();
    const groupid = asZabbixId(group.groupid);
    if (!name || !groupid || !wantedKeys.has(name.toUpperCase())) {
      continue;
    }
    byName.set(name, groupid);
  }
  return byName;
}

async function fetchMonitoredHostsInGroups(
  datasourceUid: string,
  groupIds: string[],
  wantedGroups: Set<string>,
  callOptions: ZabbixCallOptions = {}
): Promise<ZabbixDirectHost[]> {
  const rows = await zabbixCall<
    Array<ZabbixHost & { groups?: Array<{ name?: string }>; hostgroups?: Array<{ name?: string }> }>
  >(
    datasourceUid,
    'host.get',
    {
      groupids: groupIds,
      output: ZABBIX_HOST_OUTPUT,
      selectInterfaces: ['ip', 'main', 'type'],
      selectHostGroups: ['name'],
      selectTags: ['tag', 'value'],
      filter: { status: ZABBIX_HOST_MONITORED },
      monitored_hosts: true,
    },
    ZABBIX_STATUS_CALL_TIMEOUT_MS,
    callOptions
  );

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
      description: normalizeZabbixHostDescription(row.description),
      groups,
      tags: row.tags
        ?.map((tag) => ({ tag: tag.tag?.trim() ?? '', value: tag.value?.trim() ?? '' }))
        .filter((tag) => Boolean(tag.tag)),
    });
  }
  return hosts;
}

/**
 * Identidade dos hosts dos grupos: nome, IP, grupos e tags.
 *
 * Sai do ciclo periódico de propósito — nada aqui decide online/offline, e refazer `hostgroup.get`
 * + `host.get` a cada atualização era metade das chamadas do ciclo. O hook busca uma vez por
 * configuração de painel; o valor de status vem só de `ds.query()`.
 */
export async function fetchZabbixDirectMetadata(
  datasourceUid: string,
  groupNames: string[],
  abortSignal?: AbortSignal
): Promise<ZabbixDirectMetadata> {
  const wanted = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  if (!datasourceUid || !wanted.length) {
    return { hosts: [], resolvedGroups: [], groupIds: [] };
  }

  const callOptions: ZabbixCallOptions = {
    abortSignal,
    requestId: `topology-metadata-${datasourceUid}`,
  };

  const groupIdByName = await fetchGroupIdsByName(datasourceUid, wanted, callOptions);
  /** Nomes no casing do Zabbix — o `queryRefId` legado grava o grupo em maiúsculas. */
  const resolvedGroups = [...groupIdByName.keys()];
  const groupIds = [...groupIdByName.values()];
  if (!resolvedGroups.length) {
    return { hosts: [], resolvedGroups, groupIds };
  }

  const hosts = await fetchMonitoredHostsInGroups(
    datasourceUid,
    groupIds,
    new Set(resolvedGroups),
    callOptions
  );
  return { hosts, resolvedGroups, groupIds };
}

async function fetchInterfaceItemsByKeySearch(
  datasourceUid: string,
  hostIds: string[],
  searchTerms: string[]
): Promise<Map<string, ZabbixInterfaceItem[]>> {
  const itemsByHostId = new Map<string, ZabbixInterfaceItem[]>();
  const seenItemIds = new Set<string>();
  const terms = [...new Set(searchTerms.map((term) => term.trim()).filter(Boolean))];
  if (!hostIds.length || !terms.length) {
    return itemsByHostId;
  }

  for (const batch of chunk(hostIds, BATCH_SIZE)) {
    for (const term of terms) {
      try {
        const items = await zabbixCall<ZabbixInterfaceItem[]>(datasourceUid, 'item.get', {
          hostids: batch,
          output: ['itemid', 'key_', 'name', 'lastvalue', 'lastclock', 'hostid'],
          search: { key_: term },
          monitored: true,
        });
        for (const item of items ?? []) {
          const itemid = asZabbixId(item.itemid);
          const hostid = asZabbixId(item.hostid);
          if (!hostid || (itemid && seenItemIds.has(itemid))) {
            continue;
          }
          if (itemid) {
            seenItemIds.add(itemid);
          }
          const list = itemsByHostId.get(hostid) ?? [];
          list.push(item);
          itemsByHostId.set(hostid, list);
        }
      } catch {
        /* termo sem resposta */
      }
    }
  }
  return itemsByHostId;
}

/**
 * Itens de interface monitorados por host — inventário do seletor de interface do link.
 */
export async function fetchZabbixHostInterfaceItems(
  datasourceUid: string,
  hostKeys: string[],
  searchKeys: string[] = [],
  metadata?: HostMetadataMap
): Promise<ZabbixHostInterfaceItems[]> {
  const keys = [...new Set(hostKeys.map((key) => key.trim()).filter(Boolean))];
  const terms = [...new Set(searchKeys.map((key) => key.trim()).filter(Boolean))];
  if (!datasourceUid || !keys.length || !terms.length) {
    return [];
  }

  const hostIdByKey = new Map<string, string>();
  for (const key of keys) {
    const hostId = metadata?.[key]?.hostid?.trim() || (await resolveZabbixHostId(datasourceUid, key));
    if (hostId) {
      hostIdByKey.set(key, hostId);
    }
  }

  const hostIds = [...new Set(hostIdByKey.values())];
  const itemsByHostId = await fetchInterfaceItemsByKeySearch(datasourceUid, hostIds, terms);

  const result: ZabbixHostInterfaceItems[] = [];
  for (const [hostKey, hostid] of hostIdByKey) {
    result.push({ hostKey, hostid, items: itemsByHostId.get(hostid) ?? [] });
  }
  return result;
}

interface ZabbixProblemRow {
  eventid?: string;
  severity?: string;
  name?: string;
}

interface ZabbixProblemEventRow {
  eventid?: string;
  hosts?: Array<{ hostid?: string }>;
}

function rememberProblemName(
  byHost: Map<string, Map<string, number>>,
  hostid: string,
  name: string | undefined,
  severity: number
): void {
  if (!name) {
    return;
  }
  let byName = byHost.get(hostid);
  if (!byName) {
    byName = new Map();
    byHost.set(hostid, byName);
  }
  const prev = byName.get(name) ?? 0;
  if (severity > prev) {
    byName.set(name, severity);
  }
}

function sortedProblemNames(byName: Map<string, number> | undefined): string[] | undefined {
  if (!byName?.size) {
    return undefined;
  }
  return [...byName.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([name]) => name);
}

/**
 * Problemas ativos no Zabbix por host — badges, lista de alertas, cor do mapa e hover (Warning+).
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
  const nameSeverityByHost = new Map<string, Map<string, number>>();

  /**
   * Duas chamadas para o mapa inteiro, não duas por lote de 50 hosts: com centenas de hosts isso
   * eram dezenas de round-trips sequenciais na abertura do painel. O `event.get` continua sendo
   * necessário porque `problem.get` não devolve o host do evento.
   */
  try {
    const problems = await zabbixCall<ZabbixProblemRow[]>(
      datasourceUid,
      'problem.get',
      {
        hostids: ids,
        output: ['eventid', 'severity', 'name'],
        suppressed: false,
      },
      ZABBIX_STATUS_CALL_TIMEOUT_MS
    );

    const severityByEvent = new Map<string, number>();
    const nameByEvent = new Map<string, string>();
    for (const problem of problems ?? []) {
      const eventid = asZabbixId(problem.eventid);
      if (!eventid) {
        continue;
      }
      const severity = Number(problem.severity);
      severityByEvent.set(eventid, Number.isFinite(severity) ? severity : 0);
      const name = problem.name?.trim();
      if (name) {
        nameByEvent.set(eventid, name);
      }
    }

    const eventIds = [...severityByEvent.keys()];
    if (!eventIds.length) {
      return summary;
    }

    const events = await zabbixCall<ZabbixProblemEventRow[]>(
      datasourceUid,
      'event.get',
      {
        eventids: eventIds,
        output: ['eventid'],
        selectHosts: ['hostid'],
      },
      ZABBIX_STATUS_CALL_TIMEOUT_MS
    );

    for (const event of events ?? []) {
      const eventid = asZabbixId(event.eventid);
      if (!eventid) {
        continue;
      }
      const sev = severityByEvent.get(eventid) ?? 0;
      if (sev < ZABBIX_PROBLEM_MIN_SEVERITY) {
        continue;
      }
      const problemName = nameByEvent.get(eventid);
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
        rememberProblemName(nameSeverityByHost, hostid, problemName, sev);
      }
    }
  } catch {
    /* sem problemas para exibir nesta atualização */
  }

  for (const [hostid, current] of Object.entries(summary)) {
    const names = sortedProblemNames(nameSeverityByHost.get(hostid));
    if (names) {
      current.names = names;
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

/**
 * Tamanho de cada página do `history.get` do hover.
 *
 * Com `limit: 500` e `sortorder: ASC` o Zabbix devolvia só o **começo** da janela: em 24h o
 * sparkline mostrava ~2 h do início (sem as falhas) enquanto `now-3h` cabia inteiro na página e
 * listava as mesmas falhas. Paginar até `time_till` cobre o período todo.
 */
export const ZABBIX_HOVER_HISTORY_PAGE_LIMIT = 1000;

/** Teto de pontos no hover — 24 h a 10 s ≈ 8640; acima disso o sparkline já compacta. */
export const ZABBIX_HOVER_HISTORY_MAX_POINTS = 10_000;

/**
 * Próximo `time_from` (s) para a página seguinte do histórico crescente.
 * `undefined` = última página (curta) ou série vazia.
 */
export function nextHistoryTimeFromSec(
  page: ReadonlyArray<{ clockSec: number }>,
  pageLimit: number = ZABBIX_HOVER_HISTORY_PAGE_LIMIT
): number | undefined {
  if (page.length === 0 || page.length < pageLimit) {
    return undefined;
  }
  return page[page.length - 1].clockSec + 1;
}

function parseHistoryRows(rows: ZabbixHistoryRow[] | undefined): Array<{ clockSec: number; value: number }> {
  const points: Array<{ clockSec: number; value: number }> = [];
  for (const row of rows ?? []) {
    const clockSec = parseFloatOrNull(row.clock);
    const value = parseFloatOrNull(row.value);
    if (clockSec === null || value === null) {
      continue;
    }
    points.push({ clockSec, value });
  }
  return points;
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
  const history = zabbixHistoryType(Number.isFinite(valueType) ? valueType : undefined);
  const points: Array<{ clockSec: number; value: number }> = [];
  let pageFrom = timeFromSec;

  while (points.length < ZABBIX_HOVER_HISTORY_MAX_POINTS && pageFrom <= timeTillSec) {
    const rows = await zabbixCall<ZabbixHistoryRow[]>(datasourceUid, 'history.get', {
      output: ['clock', 'value'],
      history,
      itemids: [itemid],
      time_from: pageFrom,
      time_till: timeTillSec,
      sortfield: 'clock',
      sortorder: 'ASC',
      limit: ZABBIX_HOVER_HISTORY_PAGE_LIMIT,
    });
    const page = parseHistoryRows(rows);
    const lastClock = points.length ? points[points.length - 1].clockSec : undefined;
    let appended = 0;
    for (const point of page) {
      if (lastClock !== undefined && point.clockSec <= lastClock) {
        continue;
      }
      points.push(point);
      appended += 1;
      if (points.length >= ZABBIX_HOVER_HISTORY_MAX_POINTS) {
        break;
      }
    }
    const nextFrom = nextHistoryTimeFromSec(page);
    if (nextFrom === undefined || appended === 0) {
      break;
    }
    pageFrom = nextFrom;
  }

  if (points.length >= ZABBIX_HOVER_HISTORY_MAX_POINTS) {
    const tailRows = await zabbixCall<ZabbixHistoryRow[]>(datasourceUid, 'history.get', {
      output: ['clock', 'value'],
      history,
      itemids: [itemid],
      time_from: timeFromSec,
      time_till: timeTillSec,
      sortfield: 'clock',
      sortorder: 'DESC',
      limit: ZABBIX_HOVER_HISTORY_PAGE_LIMIT,
    });
    const seen = new Set(points.map((point) => point.clockSec));
    for (const point of parseHistoryRows(tailRows)) {
      if (!seen.has(point.clockSec)) {
        points.push(point);
        seen.add(point.clockSec);
      }
    }
    points.sort((a, b) => a.clockSec - b.clockSec);
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

/** Histórico ICMP/perda para o hover (icmppingsec / icmppingloss). */
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
