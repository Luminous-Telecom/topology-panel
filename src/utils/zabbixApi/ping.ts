import { isIpv4 } from '../ipv4';
import { zabbixCall } from './client';
import { ZABBIX_HOST_MONITORED } from './hostShape';
import { asZabbixId } from './itemIds';
import { ZabbixInterfaceItem } from './types';

interface ZabbixHost {
  hostid?: string;
  host: string;
  name: string;
  interfaces?: Array<{ ip: string; main?: string; type?: string }>;
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
