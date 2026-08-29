import { isIpv4 } from '../ipv4';
import { itemMatchesInterfaceKeywords } from '../zabbixAdapter/interfaceItemKeys';
import { ZABBIX_CALL_TIMEOUT_MS, ZABBIX_STATUS_CALL_TIMEOUT_MS, zabbixCall } from './client';
import { ZABBIX_HOST_MONITORED } from './hostShape';
import { asZabbixId, isNumericZabbixItemId } from './itemIds';
import { fetchZabbixItemsByKeySearch, fetchZabbixResolvedGroups } from './poll';
import { ZabbixHostInterfaceItems, ZabbixInterfaceItem } from './types';

export interface ZabbixInterfaceHostRef {
  hostKey: string;
  hostid?: string;
}

interface ResolvedInterfaceHost {
  hostKey: string;
  hostid: string;
}

/**
 * `host.get` de um host — filter exato de nome/técnico/IP. Sem `groupids`: isso varria o grupo.
 */
async function resolveMonitoredHostId(
  datasourceUid: string,
  hostKey: string,
  abortSignal?: AbortSignal
): Promise<string | undefined> {
  const key = hostKey.trim();
  if (!datasourceUid || !key) {
    return undefined;
  }
  const call = async (params: Record<string, unknown>, kind: string): Promise<string | undefined> => {
    const rows = await zabbixCall<Array<{ hostid?: string }>>(
      datasourceUid,
      'host.get',
      params,
      ZABBIX_CALL_TIMEOUT_MS,
      { abortSignal, requestId: `topology-iface-host-${datasourceUid}-${kind}-${key}` }
    );
    return asZabbixId(rows?.[0]?.hostid) || undefined;
  };
  if (isIpv4(key)) {
    const byIp = await call(
      {
        searchInterfaces: { ip: key },
        filter: { status: ZABBIX_HOST_MONITORED },
        output: ['hostid'],
      },
      'ip'
    );
    if (byIp) {
      return byIp;
    }
  }
  const byName = await call(
    {
      filter: { name: [key], status: ZABBIX_HOST_MONITORED },
      output: ['hostid'],
    },
    'name'
  );
  if (byName) {
    return byName;
  }
  return call(
    {
      filter: { host: [key], status: ZABBIX_HOST_MONITORED },
      output: ['hostid'],
    },
    'host'
  );
}

async function resolveInterfaceHosts(
  datasourceUid: string,
  hosts: ZabbixInterfaceHostRef[],
  abortSignal?: AbortSignal
): Promise<ResolvedInterfaceHost[]> {
  const uniqueHosts: ResolvedInterfaceHost[] = [];
  const seen = new Set<string>();
  for (const host of hosts) {
    const hostKey = host.hostKey.trim();
    if (!hostKey) {
      continue;
    }
    let hostid = asZabbixId(host.hostid);
    if (!isNumericZabbixItemId(hostid)) {
      hostid = (await resolveMonitoredHostId(datasourceUid, hostKey, abortSignal)) ?? '';
    }
    if (!isNumericZabbixItemId(hostid) || seen.has(hostid)) {
      continue;
    }
    seen.add(hostid);
    uniqueHosts.push({ hostKey, hostid });
  }
  return uniqueHosts;
}

/**
 * Inventário de interface dos extremos do cabo — `item.get` por hostid e termo.
 *
 * Sem hostid no índice, resolve o host com `host.get` exato (nome visível, nome técnico ou IP).
 * Sem `groupids`.
 */
export async function fetchZabbixHostInterfaceItems(
  datasourceUid: string,
  hosts: ZabbixInterfaceHostRef[],
  searchKeys: string[],
  abortSignal?: AbortSignal
): Promise<ZabbixHostInterfaceItems[]> {
  const uniqueHosts = datasourceUid
    ? await resolveInterfaceHosts(datasourceUid, hosts, abortSignal)
    : [];
  const terms = [...new Set(searchKeys.map((key) => key.trim()).filter(Boolean))];
  if (!datasourceUid || !uniqueHosts.length || !terms.length) {
    return uniqueHosts.map((host) => ({ hostKey: host.hostKey, hostid: host.hostid, items: [] }));
  }

  const items = await fetchZabbixItemsByKeySearch(
    datasourceUid,
    uniqueHosts.map((host) => host.hostid),
    terms,
    abortSignal
  );
  const byHostId = new Map<string, ZabbixInterfaceItem[]>();
  for (const host of uniqueHosts) {
    byHostId.set(host.hostid, []);
  }
  for (const item of items) {
    const hostid = asZabbixId(item.hostid);
    const bucket = byHostId.get(hostid);
    if (!bucket || !itemMatchesInterfaceKeywords(item.key_, item.name, terms)) {
      continue;
    }
    bucket.push(item);
  }
  return uniqueHosts.map((host) => ({
    hostKey: host.hostKey,
    hostid: host.hostid,
    items: byHostId.get(host.hostid) ?? [],
  }));
}

/**
 * Nomes únicos de item nos grupos — alimenta o seletor de status do editor.
 *
 * Um grupo de cada vez, na ordem pedida: o primeiro que devolver nomes encerra. `output: name`
 * só; lastvalue ficaria enorme num grupo de CPE.
 */
export async function fetchZabbixItemNames(
  datasourceUid: string,
  groupNames: string[],
  abortSignal?: AbortSignal
): Promise<string[]> {
  const wanted = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  if (!datasourceUid || !wanted.length) {
    return [];
  }
  const resolved = await fetchZabbixResolvedGroups(datasourceUid, wanted, abortSignal);
  const groupIdByName = new Map(
    resolved.resolvedGroups.map((name, index) => [name.toUpperCase(), resolved.groupIds[index] ?? ''])
  );
  for (const groupName of wanted) {
    const groupid = groupIdByName.get(groupName.toUpperCase());
    if (!groupid) {
      continue;
    }
    const rows = await zabbixCall<Array<{ name?: string }>>(
      datasourceUid,
      'item.get',
      {
        groupids: [groupid],
        output: ['name'],
        monitored: true,
      },
      ZABBIX_STATUS_CALL_TIMEOUT_MS,
      { abortSignal, requestId: `topology-item-names-${datasourceUid}-${groupid}` }
    );
    const names = new Set<string>();
    for (const row of rows ?? []) {
      const name = row.name?.trim();
      if (name) {
        names.add(name);
      }
    }
    if (names.size) {
      return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }
  }
  return [];
}
