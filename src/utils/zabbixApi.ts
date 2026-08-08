import { getBackendSrv } from '@grafana/runtime';
import { HostMetadataMap } from '../types';

interface ZabbixApiResponse<T> {
  result?: T;
  error?: { message?: string };
}

interface ZabbixHostGroup {
  groupid: string;
}

interface ZabbixHost {
  host: string;
  name: string;
  interfaces?: Array<{ ip: string; main?: string; type?: string }>;
}

const BATCH_SIZE = 50;

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

function pickMainIp(interfaces?: Array<{ ip: string; main?: string; type?: string }>): string | undefined {
  if (!interfaces?.length) {
    return undefined;
  }
  const agent = interfaces.find((i) => i.type === '1' && i.main === '1');
  const main = agent ?? interfaces.find((i) => i.main === '1') ?? interfaces[0];
  return main?.ip?.trim() || undefined;
}

function addHostMeta(result: HostMetadataMap, h: ZabbixHost): void {
  const visible = h.name?.trim();
  const technical = h.host?.trim();
  const ip = pickMainIp(h.interfaces);
  if (visible) {
    result[visible] = { name: visible, ip };
  }
  if (technical) {
    result[technical] = { name: visible || technical, ip };
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function fetchByVisibleNames(
  datasourceUid: string,
  hostNames: string[],
  result: HostMetadataMap
): Promise<void> {
  const missing = hostNames.filter((h) => !result[h.trim()]?.ip);
  if (!missing.length) {
    return;
  }

  for (const batch of chunk(missing, BATCH_SIZE)) {
    const hosts = await zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
      filter: { name: batch },
      output: ['host', 'name'],
      selectInterfaces: ['ip', 'main', 'type'],
    });
    for (const h of hosts ?? []) {
      addHostMeta(result, h);
    }
  }
}

async function fetchByGroup(
  datasourceUid: string,
  groupName: string,
  hostNames: string[],
  result: HostMetadataMap
): Promise<void> {
  const wanted = new Set(hostNames.map((h) => h.trim()));
  const stillMissing = [...wanted].some((h) => !result[h]?.ip);
  if (!stillMissing) {
    return;
  }

  const groups = await zabbixCall<ZabbixHostGroup[]>(datasourceUid, 'hostgroup.get', {
    filter: { name: [groupName] },
    output: ['groupid'],
  });

  const groupId = groups?.[0]?.groupid;
  if (!groupId) {
    return;
  }

  const hosts = await zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
    groupids: [groupId],
    output: ['host', 'name'],
    selectInterfaces: ['ip', 'main', 'type'],
  });

  for (const h of hosts ?? []) {
    const visible = h.name?.trim();
    const technical = h.host?.trim();
    if ((visible && wanted.has(visible)) || (technical && wanted.has(technical))) {
      addHostMeta(result, h);
    }
  }
}

/** Fetch host visible name + main interface IP from Zabbix API. */
export async function fetchZabbixHostMetadata(
  datasourceUid: string,
  groupName: string | undefined,
  hostNames: string[]
): Promise<HostMetadataMap> {
  const result: HostMetadataMap = {};
  if (!datasourceUid || !hostNames.length) {
    return result;
  }

  const names = hostNames.map((h) => h.trim()).filter(Boolean);

  try {
    await fetchByVisibleNames(datasourceUid, names, result);
    if (groupName) {
      await fetchByGroup(datasourceUid, groupName, names, result);
    }
  } catch {
    // metadados virão só da query / fallback do layout salvo
  }

  return result;
}
