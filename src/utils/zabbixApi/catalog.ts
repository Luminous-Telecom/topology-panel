import { ZabbixHostInterfaceItems, ZabbixInterfaceItem } from './types';
import { asZabbixId, isNumericZabbixItemId } from './itemIds';
import { ZABBIX_STATUS_CALL_TIMEOUT_MS, zabbixCall } from './client';
import { fetchZabbixItemsByKeySearch, fetchZabbixResolvedGroups } from './poll';
import { itemMatchesInterfaceKeywords } from '../zabbixAdapter/interfaceItemKeys';

export interface ZabbixInterfaceHostRef {
  hostKey: string;
  hostid: string;
}

/**
 * Inventário de interface dos extremos do cabo — `item.get` por hostid e termo.
 *
 * Só hosts com hostid numérico. Sem id não há o que consultar: o fallback por nome/grupo
 * varria o grupo inteiro.
 */
export async function fetchZabbixHostInterfaceItems(
  datasourceUid: string,
  hosts: ZabbixInterfaceHostRef[],
  searchKeys: string[],
  abortSignal?: AbortSignal
): Promise<ZabbixHostInterfaceItems[]> {
  const uniqueHosts: ZabbixInterfaceHostRef[] = [];
  const seen = new Set<string>();
  for (const host of hosts) {
    const hostKey = host.hostKey.trim();
    const hostid = asZabbixId(host.hostid);
    if (!hostKey || !isNumericZabbixItemId(hostid) || seen.has(hostid)) {
      continue;
    }
    seen.add(hostid);
    uniqueHosts.push({ hostKey, hostid });
  }
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
