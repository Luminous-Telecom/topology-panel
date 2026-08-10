import { getBackendSrv } from '@grafana/runtime';

interface ZabbixApiResponse<T> {
  result?: T;
  error?: { message?: string };
}

interface ZabbixHost {
  hostid?: string;
  host: string;
  name: string;
  interfaces?: Array<{ ip: string; main?: string; type?: string }>;
}

const BATCH_SIZE = 50;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
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
  const missing = ips.map((ip) => ip.trim()).filter((ip) => IPV4.test(ip));
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
  if (IPV4.test(name)) {
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

export interface PingScriptResult {
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
