import { HostProblemsMap, ZABBIX_PROBLEM_MIN_SEVERITY } from '../noc/types';
import { asZabbixId, isNumericZabbixItemId } from './itemIds';
import { ZABBIX_CALL_TIMEOUT_MS, zabbixCall } from './client';

/** Teto igual ao do grafana-zabbix (`limit: 1001`) — o mapa só precisa do resumo por host. */
const PROBLEMS_LIMIT = 1001;
const PROBLEM_MAX_SEVERITY = 5;
const PROBLEM_SEVERITIES = Array.from(
  { length: PROBLEM_MAX_SEVERITY - ZABBIX_PROBLEM_MIN_SEVERITY + 1 },
  (_, i) => ZABBIX_PROBLEM_MIN_SEVERITY + i
);

export interface ZabbixProblemRow {
  name?: string;
  description?: string;
  severity?: string | number;
  objectid?: string;
  hostid?: string;
  /** Presente no Zabbix 5.4+ — manutenção/supressão. */
  suppressed?: boolean | string | number;
  hosts?: Array<{ hostid?: string }>;
}

interface ZabbixTriggerHostRow {
  triggerid?: string;
  /** 0 = habilitado, 1 = desabilitado — a tela Problems omite desabilitado. */
  status?: string | number;
  hosts?: Array<{ hostid?: string }>;
}

function problemHostIds(row: ZabbixProblemRow): string[] {
  const ids: string[] = [];
  const add = (raw: unknown) => {
    const id = asZabbixId(raw);
    if (isNumericZabbixItemId(id) && !ids.includes(id)) {
      ids.push(id);
    }
  };
  add(row.hostid);
  for (const host of row.hosts ?? []) {
    add(host.hostid);
  }
  return ids;
}

function problemSeverity(row: ZabbixProblemRow): number {
  const n = typeof row.severity === 'number' ? row.severity : Number(row.severity);
  return Number.isFinite(n) ? n : 0;
}

function problemName(row: ZabbixProblemRow): string | undefined {
  const name = String(row.name ?? row.description ?? '').trim();
  return name || undefined;
}

/** A tela Problems do Zabbix omite suprimidos por padrão; o mapa segue o mesmo recorte. */
function problemIsSuppressed(row: ZabbixProblemRow): boolean {
  const value = row.suppressed;
  return value === true || value === 1 || value === '1' || value === 'true';
}

function uniqueNumericIds(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((id) => asZabbixId(id)).filter((id) => isNumericZabbixItemId(id)))];
}

/** Trigger desabilitado some da tela Problems; `problem.get` ainda devolve o evento aberto. */
function triggerIsDisabled(row: ZabbixTriggerHostRow): boolean {
  return row.status === 1 || row.status === '1';
}

/** Agrega Warning+ por hostid — mesma forma que o mapa já consome. */
export function parseZabbixProblems(rows: ZabbixProblemRow[], hostIds: string[]): HostProblemsMap {
  const wanted = new Set(hostIds.map((id) => id.trim()).filter(Boolean));
  const summary: HostProblemsMap = {};
  const namesByHost = new Map<string, Map<string, number>>();
  if (!wanted.size) {
    return summary;
  }

  for (const row of rows) {
    if (problemIsSuppressed(row)) {
      continue;
    }
    const severity = problemSeverity(row);
    if (severity < ZABBIX_PROBLEM_MIN_SEVERITY) {
      continue;
    }
    const name = problemName(row);
    for (const hostid of problemHostIds(row)) {
      if (!wanted.has(hostid)) {
        continue;
      }
      const prev = summary[hostid];
      summary[hostid] = {
        count: (prev?.count ?? 0) + 1,
        maxSeverity: Math.max(prev?.maxSeverity ?? 0, severity),
      };
      if (!name) {
        continue;
      }
      const byName = namesByHost.get(hostid) ?? new Map<string, number>();
      const prevSev = byName.get(name) ?? -1;
      if (severity >= prevSev) {
        byName.set(name, severity);
      }
      namesByHost.set(hostid, byName);
    }
  }

  for (const [hostid, current] of Object.entries(summary)) {
    const ranked = [...(namesByHost.get(hostid)?.entries() ?? [])].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')
    );
    const names = ranked.map(([entryName]) => entryName);
    if (names.length) {
      current.names = names;
    }
  }
  return summary;
}

/** Compara o resumo Warning+ — lastvalue igual não pode esconder recover/novo problema. */
export function sameHostProblems(a: HostProblemsMap, b: HostProblemsMap): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const key of keysA) {
    const left = a[key];
    const right = b[key];
    if (!left || !right || left.count !== right.count || left.maxSeverity !== right.maxSeverity) {
      return false;
    }
    const namesA = left.names ?? [];
    const namesB = right.names ?? [];
    if (namesA.length !== namesB.length) {
      return false;
    }
    for (let i = 0; i < namesA.length; i += 1) {
      if (namesA[i] !== namesB[i]) {
        return false;
      }
    }
  }
  return true;
}

/**
 * `problem.get` não devolve host — `selectHosts` ali é parâmetro inválido e o grafana-zabbix
 * mapeia o erro JSON-RPC para HTTP 500. O join é o mesmo do plugin: `trigger.get` pelos
 * objectids (triggerid), só `hostid`. Trigger desabilitado não entra (status=1).
 */
async function attachProblemHosts(
  datasourceUid: string,
  rows: ZabbixProblemRow[],
  abortSignal?: AbortSignal
): Promise<ZabbixProblemRow[]> {
  const triggerids = uniqueNumericIds(rows.map((row) => row.objectid));
  if (!triggerids.length) {
    return rows;
  }
  const triggers = await zabbixCall<ZabbixTriggerHostRow[]>(
    datasourceUid,
    'trigger.get',
    {
      triggerids,
      output: ['triggerid', 'status'],
      filter: { status: 0 },
      selectHosts: ['hostid'],
    },
    ZABBIX_CALL_TIMEOUT_MS,
    { abortSignal, requestId: `topology-problems-hosts-${datasourceUid}` }
  );
  const hostsByTrigger = new Map<string, string[]>();
  for (const trigger of triggers ?? []) {
    if (triggerIsDisabled(trigger)) {
      continue;
    }
    const triggerid = asZabbixId(trigger.triggerid);
    const hostids = uniqueNumericIds((trigger.hosts ?? []).map((host) => host.hostid));
    if (isNumericZabbixItemId(triggerid) && hostids.length) {
      hostsByTrigger.set(triggerid, hostids);
    }
  }
  return rows.map((row) => {
    const hostids = hostsByTrigger.get(asZabbixId(row.objectid));
    if (!hostids?.length) {
      return row;
    }
    return { ...row, hosts: hostids.map((hostid) => ({ hostid })) };
  });
}

/**
 * Problemas ativos (Warning+) dos hosts já conhecidos do `host.get`.
 *
 * `problem.get` por `groupids` (lista curta). Mandar todos os hostids no body faz o proxy
 * do grafana-zabbix devolver 500. O recorte para hosts do índice é no parse.
 * `recent: false` e `suppressed: false` batem com a tela Problems (sem recentes, sem manutenção).
 * Trigger desabilitado também some da tela e é recortado no `trigger.get` (`filter.status: 0`).
 */
export async function fetchZabbixProblems(
  datasourceUid: string,
  hostids: string[],
  groupids: string[],
  abortSignal?: AbortSignal
): Promise<HostProblemsMap> {
  const ids = uniqueNumericIds(hostids);
  const groups = uniqueNumericIds(groupids);
  if (!datasourceUid || !ids.length || !groups.length) {
    return {};
  }
  const rows = await zabbixCall<ZabbixProblemRow[]>(
    datasourceUid,
    'problem.get',
    {
      output: ['eventid', 'objectid', 'name', 'severity'],
      groupids: groups,
      severities: PROBLEM_SEVERITIES,
      source: 0,
      object: 0,
      recent: false,
      suppressed: false,
      limit: PROBLEMS_LIMIT,
    },
    ZABBIX_CALL_TIMEOUT_MS,
    { abortSignal, requestId: `topology-problems-${datasourceUid}` }
  );
  const withHosts = await attachProblemHosts(datasourceUid, rows ?? [], abortSignal);
  return parseZabbixProblems(withHosts, ids);
}
