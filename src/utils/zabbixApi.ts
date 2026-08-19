import { getBackendSrv } from '@grafana/runtime';
import { HostMetadata, HostMetadataMap } from '../types';
import { HostProblemsMap } from './noc/types';
import { isIpv4 } from './ipv4';

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

async function zabbixCall<T>(datasourceUid: string, method: string, params: object): Promise<T> {
  const response = await getBackendSrv().post<ZabbixApiResponse<T> | T>(
    `/api/datasources/uid/${datasourceUid}/resources/zabbix-api`,
    { method, params }
  );
  if (response && typeof response === 'object' && 'error' in response && response.error) {
    throw new Error(response.error.message ?? 'Zabbix API error');
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
 * Problemas ativos no Zabbix por host — só para badges NOC (não altera cor/status do mapa).
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
        recent: true,
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
