import { getBackendSrv } from '@grafana/runtime';
import { isIpv4 } from './ipv4';

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
  } catch {
    // Mensagem da API pode trazer método, permissão e detalhe interno do servidor — não vai para a UI.
    return { success: false, output: '', error: 'Falha ao executar o ping no Zabbix.' };
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

/** Itemid do Zabbix é sempre dígitos; chave de item (`algo.if.in[iface]`) não serve em `itemids`. */
export function isNumericZabbixItemId(value: string | undefined): boolean {
  return Boolean(value && /^\d+$/.test(value.trim()));
}

/** A `key_` se repete entre hosts — lastvalue e itemid precisam do par host+chave. */
export function zabbixHostItemKey(hostid: string, itemKey: string): string {
  return `${hostid}:${itemKey}`;
}

const TRAFFIC_ITEM_OUTPUT = ['itemid', 'key_', 'name', 'hostid', 'lastvalue', 'lastclock'];

interface ZabbixTrafficItemRow {
  itemid?: string;
  key_?: string;
  name?: string;
  hostid?: string;
  lastvalue?: string;
  lastclock?: string;
}

function scopedTrafficHostIds(hostids?: string[]): string[] {
  return [...new Set((hostids ?? []).map((id) => asZabbixId(id)).filter((id) => isNumericZabbixItemId(id)))];
}

function indexTrafficItemRows(rows: ZabbixTrafficItemRow[] | undefined): {
  lastValues: Record<string, ZabbixItemLastValue>;
  itemIdByKey: Map<string, string>;
} {
  const lastValues: Record<string, ZabbixItemLastValue> = {};
  const itemIdByKey = new Map<string, string>();
  for (const row of rows ?? []) {
    const itemid = asZabbixId(row.itemid);
    if (!isNumericZabbixItemId(itemid)) {
      continue;
    }
    const stored: ZabbixItemLastValue = { itemid };
    if (row.lastvalue !== undefined) {
      stored.lastvalue = row.lastvalue;
    }
    const lastclock = String(row.lastclock ?? '').trim();
    if (lastclock) {
      stored.lastclock = lastclock;
    }
    lastValues[itemid] = stored;
    const key = row.key_?.trim();
    const hostid = asZabbixId(row.hostid);
    if (!key || !isNumericZabbixItemId(hostid)) {
      continue;
    }
    const scoped = zabbixHostItemKey(hostid, key);
    lastValues[scoped] = stored;
    if (!itemIdByKey.has(scoped)) {
      itemIdByKey.set(scoped, itemid);
    }
  }
  return { lastValues, itemIdByKey };
}

async function fetchTrafficItemsByKeys(
  datasourceUid: string,
  itemKeys: string[],
  abortSignal: AbortSignal | undefined,
  hostids?: string[]
): Promise<ZabbixTrafficItemRow[]> {
  const keys = [...new Set(itemKeys.map((key) => key.trim()).filter(Boolean))];
  if (!datasourceUid || !keys.length) {
    return [];
  }
  const scopedHostIds = scopedTrafficHostIds(hostids);
  return zabbixCall<ZabbixTrafficItemRow[]>(
    datasourceUid,
    'item.get',
    {
      output: TRAFFIC_ITEM_OUTPUT,
      filter: { key_: keys },
      ...(scopedHostIds.length ? { hostids: scopedHostIds } : {}),
    },
    ZABBIX_CALL_TIMEOUT_MS,
    { abortSignal, requestId: `topology-traffic-keys-${datasourceUid}` }
  );
}

/**
 * Resolve chave de item → itemid numérico (`item.get` com filtro exato).
 *
 * O cabo às vezes fica só com a `key`. A chave do mapa é `hostid:key` — a `key_` do Zabbix
 * se repete entre hosts (mesmo ifIndex).
 */
export async function resolveZabbixItemIdsByKeys(
  datasourceUid: string,
  itemKeys: string[],
  abortSignal?: AbortSignal,
  hostids?: string[]
): Promise<Map<string, string>> {
  const rows = await fetchTrafficItemsByKeys(datasourceUid, itemKeys, abortSignal, hostids);
  return indexTrafficItemRows(rows).itemIdByKey;
}

export interface ZabbixTrafficSignalSearch {
  hostids: string[];
  terms: string[];
}

function trafficRowsToInterfaceItems(rows: ZabbixTrafficItemRow[]): ZabbixInterfaceItem[] {
  const items: ZabbixInterfaceItem[] = [];
  for (const row of rows) {
    const key_ = row.key_?.trim();
    if (!key_) {
      continue;
    }
    const hostid = asZabbixId(row.hostid);
    const itemid = asZabbixId(row.itemid);
    const item: ZabbixInterfaceItem = {
      itemid: itemid || `${hostid}:${key_}`,
      key_,
    };
    if (row.name?.trim()) {
      item.name = row.name.trim();
    }
    if (hostid) {
      item.hostid = hostid;
    }
    if (row.lastvalue !== undefined) {
      item.lastvalue = row.lastvalue;
    }
    const lastclock = String(row.lastclock ?? '').trim();
    if (lastclock) {
      item.lastclock = lastclock;
    }
    items.push(item);
  }
  return items;
}

async function fetchTrafficItemsBySearch(
  datasourceUid: string,
  hostids: string[],
  terms: string[],
  abortSignal: AbortSignal | undefined
): Promise<ZabbixTrafficItemRow[]> {
  const scopedHostIds = scopedTrafficHostIds(hostids);
  const uniqueTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
  if (!datasourceUid || !scopedHostIds.length || !uniqueTerms.length) {
    return [];
  }
  return zabbixCall<ZabbixTrafficItemRow[]>(
    datasourceUid,
    'item.get',
    {
      output: TRAFFIC_ITEM_OUTPUT,
      hostids: scopedHostIds,
      search: { key_: uniqueTerms },
      // `search` com lista casa todos os termos por padrão; sem isto nenhum item volta.
      searchByAny: true,
    },
    ZABBIX_STATUS_CALL_TIMEOUT_MS,
    { abortSignal, requestId: `topology-traffic-signal-${datasourceUid}` }
  );
}

/**
 * Lastvalue RX/TX/status/sinal dos cabos — o Zabbix já guarda o valor atual no item
 * (preprocessing "Change per second" vira bps). Sem série de 5 min. Tráfego e sinal
 * saem do mesmo `item.get` (lotes em paralelo no mesmo ciclo).
 */
export async function fetchZabbixTrafficLastValues(
  datasourceUid: string,
  itemIds: string[],
  abortSignal?: AbortSignal,
  itemKeys?: string[],
  hostids?: string[],
  signalSearch?: ZabbixTrafficSignalSearch
): Promise<{
  lastValues: Record<string, ZabbixItemLastValue>;
  itemIdByKey: Map<string, string>;
  interfaceItems: ZabbixInterfaceItem[];
}> {
  const ids = [...new Set(itemIds.map((id) => id.trim()).filter((id) => isNumericZabbixItemId(id)))];
  const keys = [...new Set((itemKeys ?? []).map((key) => key.trim()).filter(Boolean))];
  const signalHostIds = scopedTrafficHostIds(signalSearch?.hostids);
  const signalTerms = [...new Set((signalSearch?.terms ?? []).map((term) => term.trim()).filter(Boolean))];
  const hasSignalSearch = Boolean(signalHostIds.length && signalTerms.length);
  if (!datasourceUid || (!ids.length && !keys.length && !hasSignalSearch)) {
    return { lastValues: {}, itemIdByKey: new Map(), interfaceItems: [] };
  }

  const rowBatches: Array<Promise<ZabbixTrafficItemRow[]>> = [];
  if (ids.length) {
    /*
     * Lista inteira num `item.get` só, sem fatiar: a resposta depende de quantos itens existem,
     * não do tamanho da lista enviada. Fatiar fazia o número de requisições crescer junto com o
     * ambiente — 50 mil ids num POST passam sem problema.
     */
    rowBatches.push(
      zabbixCall<ZabbixTrafficItemRow[]>(
        datasourceUid,
        'item.get',
        { itemids: ids, output: TRAFFIC_ITEM_OUTPUT },
        ZABBIX_STATUS_CALL_TIMEOUT_MS,
        { abortSignal, requestId: `topology-traffic-ids-${datasourceUid}` }
      )
    );
  }
  if (keys.length) {
    rowBatches.push(fetchTrafficItemsByKeys(datasourceUid, keys, abortSignal, hostids));
  }
  const [requestedRows, signalRows] = await Promise.all([
    Promise.all(rowBatches).then((parts) => parts.flat()),
    hasSignalSearch
      ? fetchTrafficItemsBySearch(datasourceUid, signalHostIds, signalTerms, abortSignal)
      : Promise.resolve<ZabbixTrafficItemRow[]>([]),
  ]);
  const requested = indexTrafficItemRows(requestedRows);
  const signal = indexTrafficItemRows(signalRows);
  return {
    lastValues: { ...signal.lastValues, ...requested.lastValues },
    /*
     * Só a chave que o cabo pediu vira itemid reaproveitado. O `search` de sinal devolve todas as
     * portas ópticas do host — numa OLT são milhares — e o ciclo seguinte relia todas por itemid,
     * fatiadas de 200 em 200. Era isso que fazia o número de requisições crescer sem parar.
     */
    itemIdByKey: requested.itemIdByKey,
    interfaceItems: trafficRowsToInterfaceItems([...requestedRows, ...signalRows]),
  };
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

/** Grupos já resolvidos num ciclo anterior — dispensa repetir o `hostgroup.get`. */
export type ZabbixResolvedGroups = Pick<ZabbixDirectMetadata, 'resolvedGroups' | 'groupIds'>;

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
 * `host.get` filtra só monitorados (`status: 0` + `monitored_hosts`). O hook relê isso a cada
 * ciclo — sem isso, host desativado no Zabbix continua no índice e o Metrics devolve o último
 * icmpping (0 = offline). O valor de status vem só de `ds.query()`.
 */
export async function fetchZabbixDirectMetadata(
  datasourceUid: string,
  groupNames: string[],
  abortSignal?: AbortSignal,
  resolved?: ZabbixResolvedGroups
): Promise<ZabbixDirectMetadata> {
  const wanted = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  if (!datasourceUid || !wanted.length) {
    return { hosts: [], resolvedGroups: [], groupIds: [] };
  }

  const callOptions: ZabbixCallOptions = {
    abortSignal,
    requestId: `topology-metadata-${datasourceUid}`,
  };

  /** Grupo não muda de id entre ciclos; reaproveitar tira um `hostgroup.get` de cada busca. */
  const cached = resolved?.groupIds.length ? resolved : undefined;
  const groupIdByName = cached ? undefined : await fetchGroupIdsByName(datasourceUid, wanted, callOptions);
  /** Nomes no casing do Zabbix — o `queryRefId` legado grava o grupo em maiúsculas. */
  const resolvedGroups = cached ? cached.resolvedGroups : [...(groupIdByName?.keys() ?? [])];
  const groupIds = cached ? cached.groupIds : [...(groupIdByName?.values() ?? [])];
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
