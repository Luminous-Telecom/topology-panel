import { getBackendSrv } from '@grafana/runtime';
import { HostMetadataMap, HostProblemMap, HostStatusMap, TopologyStatusMetric } from '../types';

interface ZabbixApiResponse<T> {
  result?: T;
  error?: { message?: string };
}

interface ZabbixHostGroup {
  groupid: string;
  name: string;
}

interface ZabbixHost {
  hostid?: string;
  host: string;
  name: string;
  interfaces?: Array<{ ip: string; main?: string; type?: string }>;
}

const BATCH_SIZE = 50;
/** Zabbix host.status — 0 monitorado, 1 desativado (não entra em ICMP/stats). */
const ZABBIX_HOST_MONITORED = 0;

/** hostid / ids do Zabbix podem vir como number no JSON — normaliza p/ string. */
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
  const hostid = asZabbixId(h.hostid);
  const name = visible || technical || '';
  if (!name && !hostid) {
    return;
  }
  const entry: HostMetadataMap[string] = { name: name || hostid || '', ip, hostid: hostid || undefined };
  if (hostid) {
    result[hostid] = entry;
  }
  if (visible) {
    result[visible] = entry;
  }
  if (technical) {
    result[technical] = entry;
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
      filter: { name: batch, status: ZABBIX_HOST_MONITORED },
      output: ['hostid', 'host', 'name'],
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
    filter: { status: ZABBIX_HOST_MONITORED },
    output: ['hostid', 'host', 'name'],
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
  hostNames: string[],
  hostIds: string[] = []
): Promise<HostMetadataMap> {
  const result: HostMetadataMap = {};
  if (!datasourceUid || (!hostNames.length && !hostIds.length)) {
    return result;
  }

  const names = hostNames.map((h) => h.trim()).filter(Boolean);
  const ids = [...new Set(hostIds.map((h) => h.trim()).filter(Boolean))];

  try {
    for (const batch of chunk(ids, BATCH_SIZE)) {
      const hosts = await zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
        hostids: batch,
        output: ['hostid', 'host', 'name'],
        selectInterfaces: ['ip', 'main', 'type'],
      });
      for (const h of hosts ?? []) {
        addHostMeta(result, h);
      }
    }
    if (names.length) {
      await fetchByVisibleNames(datasourceUid, names, result);
      // Fallback por nome técnico
      const stillMissing = names.filter((n) => !result[n.trim()]);
      for (const batch of chunk(stillMissing, BATCH_SIZE)) {
        const hosts = await zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
          filter: { host: batch, status: ZABBIX_HOST_MONITORED },
          output: ['hostid', 'host', 'name'],
          selectInterfaces: ['ip', 'main', 'type'],
        });
        for (const h of hosts ?? []) {
          addHostMeta(result, h);
        }
      }
      if (groupName) {
        await fetchByGroup(datasourceUid, groupName, names, result);
      }
    }
  } catch {
    // Sem metadados da API: mantém o que já veio no layout/query
  }

  return result;
}

export interface ZabbixGroupOption {
  groupid: string;
  name: string;
}

export interface ZabbixHostOption {
  /** hostid Zabbix (vínculo estável) */
  hostid: string;
  /** Nome visível (usado na query Zabbix / status) */
  visibleName: string;
  /** Nome técnico do host */
  technicalName: string;
  ip?: string;
}

/** Lista grupos de hosts no Zabbix. */
export async function fetchZabbixGroups(datasourceUid: string): Promise<ZabbixGroupOption[]> {
  if (!datasourceUid) {
    return [];
  }
  try {
    const groups = await zabbixCall<ZabbixHostGroup[]>(datasourceUid, 'hostgroup.get', {
      output: ['groupid', 'name'],
      sortfield: 'name',
    });
    return (groups ?? []).map((g) => ({ groupid: g.groupid, name: g.name }));
  } catch {
    return [];
  }
}

/** Hosts de um grupo Zabbix (nome visível + IP). */
export async function fetchZabbixHostsInGroup(
  datasourceUid: string,
  groupId: string
): Promise<ZabbixHostOption[]> {
  if (!datasourceUid || !groupId) {
    return [];
  }
  try {
    const hosts = await zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
      groupids: [groupId],
      output: ['hostid', 'host', 'name'],
      selectInterfaces: ['ip', 'main', 'type'],
      sortfield: 'name',
    });
    return (hosts ?? []).map((h) => ({
      hostid: asZabbixId(h.hostid),
      visibleName: h.name?.trim() || h.host?.trim() || '',
      technicalName: h.host?.trim() || h.name?.trim() || '',
      ip: pickMainIp(h.interfaces),
    })).filter((h) => h.hostid && h.visibleName);
  } catch {
    return [];
  }
}

/** Grupos Zabbix aos quais um host pertence (para edição). */
export async function fetchZabbixGroupsForHost(
  datasourceUid: string,
  visibleName: string,
  hostId?: string
): Promise<ZabbixGroupOption[]> {
  if (!datasourceUid || (!visibleName.trim() && !hostId?.trim())) {
    return [];
  }
  try {
    let hosts: Array<{ groups?: ZabbixHostGroup[] }> | undefined;
    const id = hostId?.trim();
    if (id) {
      hosts = await zabbixCall<Array<{ groups?: ZabbixHostGroup[] }>>(datasourceUid, 'host.get', {
        hostids: [id],
        output: ['hostid'],
        selectGroups: ['groupid', 'name'],
      });
    }
    if (!hosts?.length) {
      const key = visibleName.trim();
      hosts = await zabbixCall<Array<{ groups?: ZabbixHostGroup[] }>>(datasourceUid, 'host.get', {
        filter: { name: [key] },
        output: ['hostid'],
        selectGroups: ['groupid', 'name'],
      });
      if (!hosts?.length) {
        hosts = await zabbixCall<Array<{ groups?: ZabbixHostGroup[] }>>(datasourceUid, 'host.get', {
          filter: { host: [key] },
          output: ['hostid'],
          selectGroups: ['groupid', 'name'],
        });
      }
    }
    const groups = hosts?.[0]?.groups ?? [];
    return groups.map((g) => ({ groupid: g.groupid, name: g.name }));
  } catch {
    return [];
  }
}

interface ZabbixProblemHost {
  hostid?: string;
  host?: string;
  name?: string;
}

interface ZabbixHostRef {
  hostid: string;
  host?: string;
  name?: string;
}

interface ZabbixTriggerProblem {
  triggerid?: string;
  hosts?: ZabbixProblemHost[];
}

function addProblemHost(result: HostProblemMap, h: ZabbixProblemHost): void {
  const hostid = asZabbixId(h.hostid);
  const visible = h.name?.trim();
  const technical = h.host?.trim();
  const bump = (key: string) => {
    if (!key) {
      return;
    }
    result[key] = (result[key] ?? 0) + 1;
  };
  bump(hostid);
  if (visible) {
    bump(visible);
  }
  if (technical) {
    bump(technical);
  }
}

async function fetchHostIdsForProblems(
  datasourceUid: string,
  groupName?: string,
  hostNames?: string[],
  hostIds?: string[]
): Promise<{ hostIds: string[]; hosts: ZabbixHostRef[] }> {
  const merged = new Map<string, ZabbixHostRef>();

  const ids = [...new Set((hostIds ?? []).map((h) => asZabbixId(h)).filter(Boolean))];
  if (ids.length) {
    for (const batch of chunk(ids, BATCH_SIZE)) {
      const hosts = await zabbixCall<ZabbixHostRef[]>(datasourceUid, 'host.get', {
        hostids: batch,
        output: ['hostid', 'host', 'name'],
      });
      for (const h of hosts ?? []) {
        const id = asZabbixId(h.hostid);
        if (id) {
          merged.set(id, { hostid: id, host: h.host, name: h.name });
        }
      }
    }
  }

  if (groupName) {
    const groups = await zabbixCall<ZabbixHostGroup[]>(datasourceUid, 'hostgroup.get', {
      filter: { name: [groupName] },
      output: ['groupid'],
    });
    const groupId = groups?.[0]?.groupid;
    if (groupId) {
      const hosts = await zabbixCall<ZabbixHostRef[]>(datasourceUid, 'host.get', {
        groupids: [groupId],
        filter: { status: ZABBIX_HOST_MONITORED },
        output: ['hostid', 'host', 'name'],
      });
      for (const h of hosts ?? []) {
        const id = asZabbixId(h.hostid);
        if (id) {
          merged.set(id, { hostid: id, host: h.host, name: h.name });
        }
      }
    }
  }

  if (hostNames?.length) {
    const names = hostNames.map((h) => h.trim()).filter(Boolean);
    const byVisible = await zabbixCall<ZabbixHostRef[]>(datasourceUid, 'host.get', {
      filter: { name: names, status: ZABBIX_HOST_MONITORED },
      output: ['hostid', 'host', 'name'],
    });
    const byTechnical = await zabbixCall<ZabbixHostRef[]>(datasourceUid, 'host.get', {
      filter: { host: names, status: ZABBIX_HOST_MONITORED },
      output: ['hostid', 'host', 'name'],
    });
    for (const h of [...(byVisible ?? []), ...(byTechnical ?? [])]) {
      const id = asZabbixId(h.hostid);
      if (id) {
        merged.set(id, { hostid: id, host: h.host, name: h.name });
      }
    }
  }

  const list = [...merged.values()];
  return { hostIds: list.map((h) => h.hostid), hosts: list };
}

/** Problemas ativos no Zabbix por hostid e/ou nome (visível e técnico). */
export async function fetchZabbixHostProblems(
  datasourceUid: string,
  groupName?: string,
  hostNames?: string[],
  hostIds?: string[]
): Promise<HostProblemMap> {
  const result: HostProblemMap = {};
  if (!datasourceUid) {
    return result;
  }

  try {
    const { hostIds: resolvedIds, hosts: resolvedHosts } = await fetchHostIdsForProblems(
      datasourceUid,
      groupName,
      hostNames,
      hostIds
    );
    if (!resolvedIds.length) {
      return result;
    }
    const hostById = new Map(resolvedHosts.map((h) => [h.hostid, h]));

    const absorbHosts = (hosts: ZabbixProblemHost[] | undefined) => {
      for (const h of hosts ?? []) {
        addProblemHost(result, h);
        const id = asZabbixId(h.hostid);
        const ref = id ? hostById.get(id) : undefined;
        if (ref) {
          addProblemHost(result, { hostid: ref.hostid, name: ref.name, host: ref.host });
        }
      }
    };

    // Triggers em PROBLEM (sem only_true/skipDependent — filtravam demais)
    try {
      const triggers = await zabbixCall<ZabbixTriggerProblem[]>(datasourceUid, 'trigger.get', {
        hostids: resolvedIds,
        output: ['triggerid'],
        selectHosts: ['hostid', 'name', 'host'],
        filter: { value: 1 },
        monitored: true,
      });
      for (const trigger of triggers ?? []) {
        absorbHosts(trigger.hosts);
      }
    } catch {
      // tenta event.get / problem.get
    }

    if (!Object.keys(result).length) {
      try {
        const events = await zabbixCall<Array<{ hosts?: ZabbixProblemHost[] }>>(datasourceUid, 'event.get', {
          output: ['eventid'],
          hostids: resolvedIds,
          source: 0,
          object: 0,
          value: 1,
          selectHosts: ['hostid', 'name', 'host'],
          suppressed: false,
          sortfield: 'clock',
          sortorder: 'DESC',
          limit: 200,
        });
        for (const event of events ?? []) {
          absorbHosts(event.hosts);
        }
      } catch {
        // Sem problemas Zabbix: mapa segue só com ICMP
      }
    }
  } catch {
    // Sem problemas Zabbix: mapa segue só com ICMP
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
  hostid?: string;
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

/** Converte itens ICMP do Zabbix em valor numérico para colorir o mapa. */
function icmpItemsToStatusValue(items: ZabbixIcmpItem[], metric: TopologyStatusMetric): number | undefined {
  let reachable: boolean | null = null;
  let lossPct: number | null = null;
  let rttSec: number | null = null;

  for (const item of items) {
    const key = item.key_?.toLowerCase() ?? '';
    const value = parseFloatOrNull(item.lastvalue);
    if (value === null) {
      continue;
    }
    if (key.includes('icmppingloss')) {
      lossPct = value;
    } else if (key.includes('icmppingsec')) {
      rttSec = value;
    } else if (key.startsWith('icmpping')) {
      reachable = value >= 1;
    }
  }

  if (metric === 'packet_loss') {
    // icmppingsec tem prioridade: >0 = online (ignora loss atrasado em 100);
    // =0 = offline (não esperar loss chegar em 100 — igual ao gráfico de RTT).
    if (rttSec !== null) {
      return rttSec > 0 ? 0 : 100;
    }
    if (lossPct !== null) {
      return lossPct;
    }
    return reachable === null ? undefined : reachable ? 0 : 100;
  }

  // icmp_rtt: confiar em icmppingsec quando existir (0 = offline, >0 = online).
  // Antes, RTT=0 caía no loss e, com loss ainda <100, o host ficava verde.
  if (rttSec !== null) {
    return rttSec;
  }
  if (lossPct !== null) {
    return lossPct >= 100 ? 0 : 0.001;
  }
  if (reachable !== null) {
    return reachable ? 0.001 : 0;
  }
  return undefined;
}

interface ResolvedZabbixHost {
  hostid: string;
  visible?: string;
  technical?: string;
}

async function resolveZabbixHostsBatch(
  datasourceUid: string,
  hostNames: string[],
  hostIds: string[] = []
): Promise<ResolvedZabbixHost[]> {
  const names = [...new Set(hostNames.map((h) => h.trim()).filter(Boolean))];
  const ids = [...new Set(hostIds.map((h) => asZabbixId(h)).filter(Boolean))];
  const byId = new Map<string, ResolvedZabbixHost>();

  for (const batch of chunk(ids, BATCH_SIZE)) {
    const hosts = await zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
      hostids: batch,
      output: ['hostid', 'host', 'name'],
    });
    for (const h of hosts ?? []) {
      const hostid = asZabbixId(h.hostid);
      if (!hostid) {
        continue;
      }
      byId.set(hostid, {
        hostid,
        visible: h.name?.trim(),
        technical: h.host?.trim(),
      });
    }
  }

  for (const batch of chunk(names, BATCH_SIZE)) {
    const [byVisible, byTechnical] = await Promise.all([
      zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
        filter: { name: batch, status: ZABBIX_HOST_MONITORED },
        output: ['hostid', 'host', 'name'],
      }),
      zabbixCall<ZabbixHost[]>(datasourceUid, 'host.get', {
        filter: { host: batch, status: ZABBIX_HOST_MONITORED },
        output: ['hostid', 'host', 'name'],
      }),
    ]);

    for (const h of [...(byVisible ?? []), ...(byTechnical ?? [])]) {
      const hostid = asZabbixId(h.hostid);
      if (!hostid) {
        continue;
      }
      const existing = byId.get(hostid);
      if (existing) {
        existing.visible = existing.visible || h.name?.trim();
        existing.technical = existing.technical || h.host?.trim();
      } else {
        byId.set(hostid, {
          hostid,
          visible: h.name?.trim(),
          technical: h.host?.trim(),
        });
      }
    }
  }

  return [...byId.values()];
}

/** ICMP de vários hosts via API Zabbix (icmpping / icmppingsec / icmppingloss). */
export async function fetchZabbixHostIcmpStatusMap(
  datasourceUid: string,
  hostNames: string[],
  metric: TopologyStatusMetric = 'icmp_rtt',
  hostIds: string[] = []
): Promise<HostStatusMap> {
  const result: HostStatusMap = {};
  if (!datasourceUid || (!hostNames.length && !hostIds.length)) {
    return result;
  }

  try {
    const hosts = await resolveZabbixHostsBatch(datasourceUid, hostNames, hostIds);
    if (!hosts.length) {
      return result;
    }

    const itemsByHostId = new Map<string, ZabbixIcmpItem[]>();

    for (const batch of chunk(
      hosts.map((h) => h.hostid),
      BATCH_SIZE
    )) {
      const items = await zabbixCall<ZabbixIcmpItem[]>(datasourceUid, 'item.get', {
        hostids: batch,
        output: ['hostid', 'key_', 'lastvalue'],
        search: { key_: 'icmpping' },
        searchByAny: true,
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
    }

    for (const host of hosts) {
      const value = icmpItemsToStatusValue(itemsByHostId.get(host.hostid) ?? [], metric);
      if (value === undefined) {
        continue;
      }
      result[host.hostid] = value;
      if (host.visible) {
        result[host.visible] = value;
      }
      if (host.technical) {
        result[host.technical] = value;
      }
    }
  } catch {
    // mantém mapa parcial/vazio
  }

  return result;
}

interface ZabbixIcmpItemLegacy {
  key_: string;
  lastvalue?: string;
  lastclock?: string;
}

async function resolveZabbixHostId(datasourceUid: string, hostName: string): Promise<string | undefined> {
  const name = hostName.trim();
  if (!name) {
    return undefined;
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
  return hosts?.[0]?.hostid;
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

/** Executa script Ping no Zabbix. Modo painel = pacotes curtos; contínuo = até timeout do script. */
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

  const parsed = icmpItemsToStatusValue(items, 'icmp_rtt');
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
    // Prioridade alinhada ao mapa: RTT>0 vence loss atrasado
    if (rttMs !== null && rttMs > 0) {
      reachable = true;
    } else if (lossPct !== null) {
      reachable = lossPct < 100;
    } else if (parsed !== undefined) {
      reachable = parsed > 0;
    }
  } else if (rttMs !== null && rttMs > 0) {
    reachable = true;
  } else if (lossPct !== null && lossPct < 100) {
    reachable = true;
  }

  return { reachable, lossPct, rttMs, lastClock };
}
