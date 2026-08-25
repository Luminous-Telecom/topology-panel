import {
  DataFrame,
  DataQuery,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  Field,
  FieldType,
  LoadingState,
  TimeRange,
  dateTime,
} from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { Observable } from 'rxjs';
import { statusItemMatchRank, statusItemRank } from '../services/zabbixDirectIndex';
import { HostMetadataMap, ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
import { isIpv4 } from './ipv4';
import {
  buildHostHoverSeriesFromZabbixHistory,
  HOVER_SPARKLINE_MAX_POINTS,
  HostHoverSeriesMap,
} from './hostTimeSeries';
import { HostProblemsMap, ZABBIX_PROBLEM_MIN_SEVERITY } from './noc/types';
import { StatusColorOptions } from './statusMapping';
import {
  isBenignZabbixFetchError,
  isNumericZabbixItemId,
  ZabbixDirectHost,
  ZabbixHostInterfaceItems,
  ZabbixInterfaceItem,
  ZabbixItemLastValue,
} from './zabbixApi';

/**
 * Queries programáticas do plugin Zabbix (Zobnin), no mesmo shape do editor.
 *
 * `skipDataQuery` permanece true: a aba Query do Grafana não aparece. Cada preocupação preenche
 * o campo correspondente — grupo de hosts, item ICMP/status, item de interface — e o plugin
 * resolve grupo → hosts → itens → histórico. Identidade (IP, tags, descrição) continua em
 * `host.get`: o frame não traz isso.
 */

/** Metrics no editor Zobnin — grupo + host + item. */
export const ZABBIX_QUERY_TYPE_METRICS = '0';
/** Item ID no editor Zobnin — histórico pelos itemids já resolvidos. */
export const ZABBIX_QUERY_TYPE_ITEMID = '3';
/** Problems no editor Zobnin. */
export const ZABBIX_QUERY_TYPE_PROBLEMS = '5';
/** `metricFindQuery` de grupos — o plugin usa o enum `group`, não o `'0'` do Metrics. */
export const ZABBIX_MFQ_GROUPS = 'group';
/** `metricFindQuery` de itens — o plugin usa o enum `item`. */
export const ZABBIX_MFQ_ITEMS = 'item';
/** Schema atual do modelo de query do grafana-zabbix. */
export const ZABBIX_QUERY_SCHEMA = 12;
/** Janela curta: o último ponto aproxima o lastvalue sem puxar horas de histórico. */
export const ZABBIX_STATUS_QUERY_RANGE_SEC = 300;
/** Inventário de interface: janela maior que o lastvalue de status — o Metrics só devolve ponto na faixa. */
export const ZABBIX_INTERFACE_QUERY_RANGE_SEC = 3_600;
/** grafana-zabbix `filterByRegex` casa só `name`; a key entra no parse. */
export const ZABBIX_INTERFACE_ITEM_FILTER = '/.*/';
export const STATUS_QUERY_MAX_ATTEMPTS = 3;
const STATUS_QUERY_RETRY_DELAY_MS = 300;
/** grafana-zabbix aceita lista grande; fatia evita body enorme no `/api/ds/query`. */
const STATUS_ITEMID_CHUNK = 200;

export interface ZabbixMetricsQuery extends DataQuery {
  queryType?: string;
  schema?: number;
  group?: { filter: string };
  host?: { filter: string };
  application?: { filter: string };
  itemTag?: { filter: string };
  item?: { filter: string };
  itemids?: string;
  trigger?: { filter: string };
  proxy?: { filter: string };
  showProblems?: string;
  functions?: unknown[];
  options?: {
    showDisabledItems?: boolean;
    skipEmptyValues?: boolean;
    disableDataAlignment?: boolean;
    useTrends?: boolean | string;
    minSeverity?: number;
    limit?: number;
    acknowledged?: number;
    sortProblems?: string;
    hostsInMaintenance?: boolean;
  };
  resultFormat?: string;
}

export interface FetchZabbixStatusViaQueryOptions {
  datasourceUid: string;
  groupNames: string[];
  statusItemKey: string;
  hosts: ZabbixDirectHost[];
  /** Itemids já filtrados — `ds.query()` Item ID, sem filtro por nome. */
  itemIds?: string[];
  abortSignal?: AbortSignal;
  refreshSec: number;
  timeRange?: TimeRange;
  statusOptions?: StatusColorOptions;
}

export interface ZabbixStatusQuerySnapshot {
  items: ZabbixInterfaceItem[];
  hoverByHost: HostHoverSeriesMap;
  lastValues: Record<string, ZabbixItemLastValue>;
}

const EMPTY_STATUS_SNAPSHOT: ZabbixStatusQuerySnapshot = { items: [], hoverByHost: {}, lastValues: {} };

function throwIfAborted(abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted) {
    throw new Error('abort');
  }
}

/** Grafana cancelou o fetch (mesmo requestId ou unmount) — não vale repetir. */
function isCanceledQueryError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /abort|request was aborted|context canceled|context cancelled/i.test(msg);
}

/** requestId único por chamada — o BackendSrv aborta o anterior com o mesmo id. Sem host na URL. */
let zabbixQueryRequestSeq = 0;

function nextZabbixQueryRequestId(prefix: string): string {
  zabbixQueryRequestSeq += 1;
  return `${prefix}-${zabbixQueryRequestSeq}`;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Filtro de grupo: nome exato, ou regex âncora se o nome tiver metacaractere do Zobnin. */
export function zabbixGroupFilter(groupName: string): string {
  const name = groupName.trim();
  if (/[/*?]/.test(name)) {
    return `/^${escapeRegex(name)}$/`;
  }
  return name;
}

/**
 * Um filtro para todos os grupos visíveis — um target Metrics, não um por grupo.
 * Regex âncora sem distinguir maiúsculas (queryRefId legado é uppercase; o Zabbix é exact match).
 */
export function zabbixGroupsFilter(groupNames: readonly string[]): string {
  const groups = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  if (!groups.length) {
    return '';
  }
  if (groups.length === 1) {
    return `/^${escapeRegex(groups[0])}$/i`;
  }
  return `/^(?:${groups.map((name) => escapeRegex(name)).join('|')})$/i`;
}

/**
 * Filtro Metrics do grafana-zabbix: casa o **nome** do item, não a `key_`.
 * Aceita nome igual à chave, forma parametrizada, ou a chave com separadores
 * (`ICMP ping` para `icmpping`). Derivadas (`icmppingloss`) ficam de fora pelo `$`.
 */
export function zabbixStatusItemFilter(statusItemKey: string): string {
  const key = statusItemKey.trim();
  const escaped = escapeRegex(key);
  const spaced = [...key].map((ch) => escapeRegex(ch)).join('[\\s._-]*');
  // `$` só no ramo do nome: o ramo da chave precisa aceitar `key[params]`.
  return `/^(?:${escaped}(?:$|\\[)|${spaced}$)/i`;
}

/** Nome exato no campo item do editor — um nome, ou regex âncora se houver vários. */
export function zabbixItemNameFilter(names: string[]): string {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (!unique.length) {
    return '';
  }
  if (unique.length === 1 && !/[/*?]/.test(unique[0])) {
    return unique[0];
  }
  return `/^(?:${unique.map((name) => escapeRegex(name)).join('|')})$/`;
}

/** Valor do campo Item do editor: regex pronta, nome do item, ou chave no formato Zabbix. */
export function zabbixMetricsItemFilter(statusItem: string): string {
  const value = statusItem.trim();
  if (!value) {
    return '';
  }
  if (value.startsWith('/') && value.lastIndexOf('/') > 0) {
    return value;
  }
  if (/^[A-Za-z][A-Za-z0-9_.]*$/.test(value)) {
    return zabbixStatusItemFilter(value);
  }
  return zabbixItemNameFilter([value]);
}

function zabbixMetricsTarget(
  datasourceUid: string,
  refId: string,
  groupFilter: string,
  hostFilter: string,
  itemFilter: string
): ZabbixMetricsQuery {
  return {
    refId,
    datasource: { uid: datasourceUid },
    queryType: ZABBIX_QUERY_TYPE_METRICS,
    schema: ZABBIX_QUERY_SCHEMA,
    group: { filter: groupFilter },
    host: { filter: hostFilter },
    application: { filter: '' },
    itemTag: { filter: '' },
    item: { filter: itemFilter },
    functions: [],
    options: statusQueryOptions(),
    resultFormat: 'time_series',
  };
}

export function statusQueryTimeRange(nowMs: number, rangeSec: number): TimeRange {
  const to = dateTime(nowMs);
  const from = dateTime(nowMs - rangeSec * 1000);
  return {
    from,
    to,
    raw: { from: `now-${rangeSec}s`, to: 'now' },
  };
}

function statusQueryOptions(): NonNullable<ZabbixMetricsQuery['options']> {
  return {
    showDisabledItems: false,
    skipEmptyValues: false,
    disableDataAlignment: true,
    // String: o tipo do grafana-zabbix é 'default' | 'true' | 'false'. Boolean vira default.
    useTrends: 'false',
  };
}

export function buildZabbixStatusTargets(
  datasourceUid: string,
  groupNames: string[],
  statusItemKey: string
): ZabbixMetricsQuery[] {
  const key = statusItemKey.trim();
  const groups = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  const itemFilter = zabbixMetricsItemFilter(key);
  if (!datasourceUid || !itemFilter || !groups.length) {
    return [];
  }

  const groupFilter = zabbixGroupsFilter(groups);
  if (!groupFilter) {
    return [];
  }
  return [zabbixMetricsTarget(datasourceUid, 'G0', groupFilter, '/.*/', itemFilter)];
}

/** Targets Item ID — o plugin busca histórico pelos ids, sem filtrar pelo nome do item. */
export function buildZabbixStatusItemIdTargets(
  datasourceUid: string,
  itemIds: string[],
  refPrefix = 'I'
): ZabbixMetricsQuery[] {
  /*
   * Só id numérico entra. Um valor não numérico faz o datasource recusar o request **inteiro**
   * ("itemid must be a valid numeric value", HTTP 400).
   */
  const ids = [...new Set(itemIds.map((id) => id.trim()).filter((id) => isNumericZabbixItemId(id)))];
  if (!datasourceUid || !ids.length) {
    return [];
  }
  const targets: ZabbixMetricsQuery[] = [];
  for (let offset = 0; offset < ids.length; offset += STATUS_ITEMID_CHUNK) {
    const chunk = ids.slice(offset, offset + STATUS_ITEMID_CHUNK);
    targets.push({
      refId: `${refPrefix}${targets.length}`,
      datasource: { uid: datasourceUid },
      queryType: ZABBIX_QUERY_TYPE_ITEMID,
      schema: ZABBIX_QUERY_SCHEMA,
      itemids: chunk.join(','),
      functions: [],
      options: statusQueryOptions(),
      resultFormat: 'time_series',
    });
  }
  return targets;
}

export function buildZabbixStatusQueryRequest(
  datasourceUid: string,
  groupNames: string[],
  statusItemKey: string,
  refreshSec: number,
  nowMs = Date.now(),
  itemIds?: string[],
  timeRange?: TimeRange
): DataQueryRequest<ZabbixMetricsQuery> | undefined {
  const targets =
    itemIds !== undefined
      ? buildZabbixStatusItemIdTargets(datasourceUid, itemIds)
      : buildZabbixStatusTargets(datasourceUid, groupNames, statusItemKey);
  if (!targets.length) {
    return undefined;
  }
  const range = timeRange ?? statusQueryTimeRange(nowMs, ZABBIX_STATUS_QUERY_RANGE_SEC);
  return zabbixQueryRequest(
    datasourceUid,
    `topology-status-${datasourceUid}`,
    targets,
    range,
    refreshSec,
    HOVER_SPARKLINE_MAX_POINTS,
    nowMs
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scopedVarString(custom: unknown, key: string): string | undefined {
  if (!isRecord(custom)) {
    return undefined;
  }
  const scoped = custom.scopedVars;
  if (!isRecord(scoped)) {
    return undefined;
  }
  const entry = scoped[key];
  if (!isRecord(entry)) {
    return undefined;
  }
  const value = entry.value;
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function labelString(labels: Field['labels'], key: string): string | undefined {
  const value = labels?.[key]?.trim();
  return value || undefined;
}

function hostFromSeriesName(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed) {
    return undefined;
  }
  const sep = trimmed.indexOf(': ');
  if (sep <= 0) {
    return undefined;
  }
  const host = trimmed.slice(0, sep).trim();
  return host || undefined;
}

function hostLabelFromField(field: Field, frameName?: string): string | undefined {
  return (
    labelString(field.labels, 'host') ||
    labelString(field.labels, 'hostname') ||
    scopedVarString(field.config.custom, '__zbx_host_name') ||
    scopedVarString(field.config.custom, '__zbx_host') ||
    hostFromSeriesName(field.name) ||
    hostFromSeriesName(frameName)
  );
}

function itemKeyFromField(field: Field): string | undefined {
  return (
    labelString(field.labels, 'item_key') ||
    labelString(field.labels, 'key_') ||
    scopedVarString(field.config.custom, '__zbx_item_key')
  );
}

function hostIdFromField(field: Field): string | undefined {
  return labelString(field.labels, 'hostid') || scopedVarString(field.config.custom, '__zbx_host_id');
}

function itemIdFromField(field: Field): string | undefined {
  return (
    labelString(field.labels, 'itemid') ||
    labelString(field.labels, '__zbx_itemid') ||
    labelString(field.labels, '__zbx_item_id') ||
    scopedVarString(field.config.custom, '__zbx_item_id') ||
    numericItemIdCandidate(field.name)
  );
}

/** grafana-zabbix não coloca `itemid` no label; às vezes o nome do campo é o id numérico. */
function numericItemIdCandidate(value: string | undefined): string | undefined {
  const id = value?.trim();
  return isNumericZabbixItemId(id) ? id : undefined;
}

function readFieldValues(field: Field): unknown[] {
  const raw: unknown = field.values;
  if (Array.isArray(raw)) {
    return raw;
  }
  if (isRecord(raw) && typeof raw.toArray === 'function') {
    const arr = raw.toArray();
    return Array.isArray(arr) ? arr : [];
  }
  if (isRecord(raw) && typeof raw.get === 'function' && typeof raw.length === 'number') {
    const length = raw.length;
    const out: unknown[] = [];
    for (let i = 0; i < length; i++) {
      out.push(raw.get(i));
    }
    return out;
  }
  return [];
}

function lastFiniteNumber(values: unknown[]): { value: number; index: number } | undefined {
  for (let i = values.length - 1; i >= 0; i--) {
    const raw = values[i];
    if (raw == null || raw === '') {
      continue;
    }
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n)) {
      return { value: n, index: i };
    }
  }
  return undefined;
}

function unixSecFromTimeValue(raw: unknown): number | undefined {
  if (raw == null || raw === '') {
    return undefined;
  }
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    return undefined;
  }
  return Math.floor(n / 1000);
}

function hostIdLookup(hosts: ZabbixDirectHost[]): Map<string, string> {
  const byKey = new Map<string, string>();
  for (const host of hosts) {
    for (const key of [host.name, host.host, host.hostid]) {
      const normalized = key.trim().toLowerCase();
      if (normalized && !byKey.has(normalized)) {
        byKey.set(normalized, host.hostid);
      }
    }
  }
  return byKey;
}

function resolveHostId(
  field: Field,
  hostLabel: string | undefined,
  byHostKey: Map<string, string>,
  itemById?: Map<string, ZabbixInterfaceItem>
): string | undefined {
  const fromField = hostIdFromField(field);
  if (fromField) {
    return fromField;
  }
  const itemid = itemIdFromField(field);
  const fromLookup = itemid ? itemById?.get(itemid)?.hostid?.trim() : undefined;
  if (fromLookup) {
    return fromLookup;
  }
  if (!hostLabel) {
    return undefined;
  }
  return byHostKey.get(hostLabel.trim().toLowerCase());
}

function timeFieldOf(frame: DataFrame): Field | undefined {
  return frame.fields.find((field) => field.type === FieldType.time);
}

function isDataFrame(value: unknown): value is DataFrame {
  return isRecord(value) && Array.isArray(value.fields);
}

function statusItemFromValueField(
  field: Field,
  timeField: Field | undefined,
  wantedKey: string,
  byHostKey: Map<string, string>,
  frameName?: string,
  itemById?: Map<string, ZabbixInterfaceItem>
): ZabbixInterfaceItem | undefined {
  if (field.type === FieldType.time) {
    return undefined;
  }
  const values = readFieldValues(field);
  const last = lastFiniteNumber(values);
  if (!last) {
    return undefined;
  }
  const hostLabel = hostLabelFromField(field, frameName);
  const hostid = resolveHostId(field, hostLabel, byHostKey, itemById);
  if (!hostid) {
    return undefined;
  }
  const labeledItemId = itemIdFromField(field);
  const key_ = itemKeyFromField(field) ?? itemById?.get(labeledItemId ?? '')?.key_ ?? wantedKey;
  const itemName = itemNameFromField(field) ?? itemById?.get(labeledItemId ?? '')?.name;
  if (!isWantedStatusItem(wantedKey, key_, itemName)) {
    return undefined;
  }
  const timeValues = timeField ? readFieldValues(timeField) : [];
  const clock = timeField ? unixSecFromTimeValue(timeValues[last.index]) : undefined;
  const itemid = labeledItemId ?? `${hostid}:${key_}`;
  const item: ZabbixInterfaceItem = {
    itemid,
    key_,
    lastvalue: String(last.value),
    hostid,
  };
  if (itemName) {
    item.name = itemName;
  }
  if (clock != null) {
    item.lastclock = String(clock);
  }
  return item;
}

function itemLookupById(itemLookup?: ZabbixInterfaceItem[]): Map<string, ZabbixInterfaceItem> | undefined {
  if (!itemLookup?.length) {
    return undefined;
  }
  const byId = new Map<string, ZabbixInterfaceItem>();
  for (const item of itemLookup) {
    const itemid = item.itemid?.trim();
    if (itemid && !byId.has(itemid)) {
      byId.set(itemid, item);
    }
  }
  return byId.size ? byId : undefined;
}

function compileItemFilter(filter: string): RegExp | undefined {
  const trimmed = filter.trim();
  const match = trimmed.match(/^\/(.*)\/([imncsxrde]*)$/);
  if (!match) {
    return undefined;
  }
  try {
    return new RegExp(match[1], match[2]);
  } catch {
    return undefined;
  }
}

function isWantedStatusItem(wanted: string, key_: string, name?: string): boolean {
  const wantedKey = wanted.trim();
  if (!wantedKey) {
    return false;
  }
  if (statusItemMatchRank({ key_, name }, wantedKey) !== undefined) {
    return true;
  }
  const itemName = name?.trim();
  const re = compileItemFilter(zabbixMetricsItemFilter(wantedKey));
  if (!re) {
    return false;
  }
  return re.test(key_) || (itemName ? re.test(itemName) : false);
}

/** Converte frames Metrics do Zabbix no mesmo shape que `item.get` alimentava o índice. */
export function parseStatusItemsFromFrames(
  frames: Array<DataFrame | unknown>,
  hosts: ZabbixDirectHost[],
  statusItemKey: string,
  itemLookup?: ZabbixInterfaceItem[]
): ZabbixInterfaceItem[] {
  const wantedKey = statusItemKey.trim();
  if (!wantedKey || !frames.length) {
    return [];
  }
  const byHostKey = hostIdLookup(hosts);
  const itemById = itemLookupById(itemLookup);
  const items: ZabbixInterfaceItem[] = [];
  for (const frame of frames) {
    if (!isDataFrame(frame)) {
      continue;
    }
    const timeField = timeFieldOf(frame);
    for (const field of frame.fields) {
      const item = statusItemFromValueField(field, timeField, wantedKey, byHostKey, frame.name, itemById);
      if (item) {
        items.push(item);
      }
    }
  }
  return items;
}

function hoverPointsFromField(
  field: Field,
  timeField: Field | undefined
): Array<{ clockSec: number; value: number }> {
  const values = readFieldValues(field);
  const times = timeField ? readFieldValues(timeField) : [];
  const points: Array<{ clockSec: number; value: number }> = [];
  for (let i = 0; i < values.length; i++) {
    const raw = values[i];
    if (raw == null || raw === '') {
      continue;
    }
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value)) {
      continue;
    }
    const clockSec = unixSecFromTimeValue(times[i]) ?? i;
    points.push({ clockSec, value });
  }
  return points;
}

function rememberHoverAlias(result: HostHoverSeriesMap, key: string | undefined, series: NonNullable<ReturnType<typeof buildHostHoverSeriesFromZabbixHistory>>): void {
  const trimmed = key?.trim();
  if (!trimmed) {
    return;
  }
  result[trimmed] = series;
  const lower = trimmed.toLowerCase();
  if (result[lower] === undefined) {
    result[lower] = series;
  }
}

/** Sparkline do hover a partir da mesma query Metrics do status. */
export function parseHoverSeriesFromFrames(
  frames: Array<DataFrame | unknown>,
  hosts: ZabbixDirectHost[],
  statusItemKey: string,
  statusOptions?: StatusColorOptions
): HostHoverSeriesMap {
  const wantedKey = statusItemKey.trim();
  if (!wantedKey || !frames.length) {
    return {};
  }
  const byHostKey = hostIdLookup(hosts);
  const hostById = new Map(hosts.map((host) => [host.hostid, host]));
  const bestByHostId = new Map<
    string,
    { rank: number; key: string; label: string; points: Array<{ clockSec: number; value: number }> }
  >();

  for (const frame of frames) {
    if (!isDataFrame(frame)) {
      continue;
    }
    const timeField = timeFieldOf(frame);
    for (const field of frame.fields) {
      if (field.type === FieldType.time) {
        continue;
      }
      const key = itemKeyFromField(field) ?? wantedKey;
      const name = itemNameFromField(field);
      if (!isWantedStatusItem(wantedKey, key, name)) {
        continue;
      }
      const hostLabel = hostLabelFromField(field, frame.name);
      const hostid = resolveHostId(field, hostLabel, byHostKey);
      if (!hostid) {
        continue;
      }
      const points = hoverPointsFromField(field, timeField);
      if (!points.length) {
        continue;
      }
      const rank = statusItemRank(key.trim().toLowerCase(), wantedKey.toLowerCase()) ?? 3;
      const prev = bestByHostId.get(hostid);
      if (!prev || rank < prev.rank) {
        bestByHostId.set(hostid, { rank, key, label: field.name?.trim() || name || key, points });
      }
    }
  }

  const colors: StatusColorOptions = statusOptions ?? {
    colorOnline: '',
    colorOffline: '',
    colorAlert: '',
    statusValueMappings: [],
  };
  const result: HostHoverSeriesMap = {};
  for (const [hostid, best] of bestByHostId) {
    const series = buildHostHoverSeriesFromZabbixHistory(best.points, best.key, best.label, colors);
    if (!series) {
      continue;
    }
    const host = hostById.get(hostid);
    rememberHoverAlias(result, hostid, series);
    rememberHoverAlias(result, host?.name, series);
    rememberHoverAlias(result, host?.host, series);
    rememberHoverAlias(result, host?.ip, series);
  }
  return result;
}

function isQueryObservable(value: unknown): value is Observable<DataQueryResponse> {
  return typeof value === 'object' && value !== null && typeof (value as { subscribe?: unknown }).subscribe === 'function';
}

function isFinalQueryState(state: LoadingState | undefined): boolean {
  return state === undefined || state === LoadingState.Done || state === LoadingState.Error;
}

/**
 * O `query()` do Grafana emite `Loading` com `data: []` e só depois `Done`.
 * Pegar o primeiro `next` zerava o status do mapa (badge vermelho) mesmo com query boa.
 */
function awaitQueryResponse(
  source: Observable<DataQueryResponse>,
  abortSignal?: AbortSignal
): Promise<DataQueryResponse> {
  return new Promise((resolve, reject) => {
    let latest: DataQueryResponse | undefined;
    let settled = false;

    const finishOk = (value: DataQueryResponse) => {
      if (settled) {
        return;
      }
      settled = true;
      abortSignal?.removeEventListener('abort', onAbort);
      sub.unsubscribe();
      resolve(value);
    };
    const finishErr = (err: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      abortSignal?.removeEventListener('abort', onAbort);
      sub.unsubscribe();
      reject(err);
    };

    let sub: { unsubscribe: () => void } = { unsubscribe() {} };
    sub = source.subscribe({
      next: (value) => {
        latest = value;
        if (isFinalQueryState(value.state)) {
          finishOk(value);
        }
      },
      error: finishErr,
      complete: () => {
        if (latest) {
          finishOk(latest);
          return;
        }
        finishErr(new Error('Falha ao consultar itens de status no Zabbix.'));
      },
    });

    function onAbort(): void {
      finishErr(new Error('abort'));
    }

    if (abortSignal?.aborted) {
      onAbort();
      return;
    }
    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function runDatasourceQuery(
  ds: DataSourceApi,
  request: DataQueryRequest<ZabbixMetricsQuery>,
  abortSignal?: AbortSignal
): Promise<DataQueryResponse> {
  const result = ds.query(request);
  if (isQueryObservable(result)) {
    return awaitQueryResponse(result, abortSignal);
  }
  return result;
}

function throwIfQueryFailed(response: DataQueryResponse): void {
  if (response.state === LoadingState.Error && !response.error?.message && !response.errors?.length) {
    throw new Error('Falha ao consultar itens de status no Zabbix.');
  }
  if (response.error?.message) {
    throw new Error(response.error.message);
  }
  const firstError = response.errors?.[0]?.message;
  if (firstError) {
    throw new Error(firstError);
  }
}

export async function fetchZabbixStatusViaQuery(
  options: FetchZabbixStatusViaQueryOptions
): Promise<ZabbixStatusQuerySnapshot> {
  const {
    datasourceUid,
    groupNames,
    statusItemKey,
    hosts,
    itemIds,
    abortSignal,
    refreshSec,
    timeRange,
    statusOptions,
  } = options;
  const nowMs = Date.now();
  const statusRequest = buildZabbixStatusQueryRequest(
    datasourceUid,
    groupNames,
    statusItemKey,
    refreshSec,
    nowMs,
    itemIds,
    timeRange
  );
  if (!statusRequest) {
    return EMPTY_STATUS_SNAPSHOT;
  }

  const statusResponse = await queryZabbixWithRetry(
    datasourceUid,
    statusRequest,
    abortSignal,
    'Falha ao consultar itens de status no Zabbix.'
  );
  const statusFrames = statusResponse.data ?? [];
  return {
    items: parseStatusItemsFromFrames(statusFrames, hosts, statusItemKey),
    hoverByHost: parseHoverSeriesFromFrames(statusFrames, hosts, statusItemKey, statusOptions),
    lastValues: parseItemLastValuesFromFrames(statusFrames),
  };
}

async function queryZabbixWithRetry(
  datasourceUid: string,
  request: DataQueryRequest<ZabbixMetricsQuery>,
  abortSignal: AbortSignal | undefined,
  errorMessage: string
): Promise<DataQueryResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= STATUS_QUERY_MAX_ATTEMPTS; attempt++) {
    throwIfAborted(abortSignal);
    try {
      const ds = await getDataSourceSrv().get(datasourceUid);
      throwIfAborted(abortSignal);
      const response = await runDatasourceQuery(ds, request, abortSignal);
      throwIfQueryFailed(response);
      return response;
    } catch (err) {
      lastError = err;
      if (isCanceledQueryError(err) || (isBenignZabbixFetchError(err) && abortSignal?.aborted)) {
        throw err;
      }
      if (attempt < STATUS_QUERY_MAX_ATTEMPTS) {
        await sleepMs(STATUS_QUERY_RETRY_DELAY_MS);
      }
    }
  }
  if (isBenignZabbixFetchError(lastError)) {
    throw lastError;
  }
  throw new Error(errorMessage);
}

function zabbixQueryRequest(
  datasourceUid: string,
  requestId: string,
  targets: ZabbixMetricsQuery[],
  range: TimeRange,
  refreshSec: number,
  maxDataPoints: number,
  nowMs = Date.now()
): DataQueryRequest<ZabbixMetricsQuery> {
  const intervalSec = Math.max(ZABBIX_DIRECT_MIN_REFRESH_SEC, Math.floor(refreshSec));
  return {
    requestId,
    interval: `${intervalSec}s`,
    intervalMs: intervalSec * 1000,
    maxDataPoints,
    range,
    rangeRaw: range.raw,
    scopedVars: {},
    targets,
    timezone: 'browser',
    app: 'luminous-topology-panel',
    startTime: nowMs,
    hideFromInspector: true,
    skipQueryCache: true,
    queryCachingTTL: 0,
    cacheTimeout: null,
  };
}

function lastValueFromField(field: Field, timeField: Field | undefined): ZabbixItemLastValue | undefined {
  const last = lastFiniteNumber(readFieldValues(field));
  if (!last) {
    return undefined;
  }
  const itemid = itemIdFromField(field) ?? '';
  const timeValues = timeField ? readFieldValues(timeField) : [];
  const clock = timeField ? unixSecFromTimeValue(timeValues[last.index]) : undefined;
  const row: ZabbixItemLastValue = {
    itemid,
    lastvalue: String(last.value),
  };
  if (clock != null) {
    row.lastclock = String(clock);
  }
  return row;
}

/** Lastvalue via Item ID — o plugin busca o histórico; o mapa usa só o último ponto. */
export function parseItemLastValuesFromFrames(
  frames: Array<DataFrame | unknown>
): Record<string, ZabbixItemLastValue> {
  const result: Record<string, ZabbixItemLastValue> = {};
  for (const frame of frames) {
    if (!isDataFrame(frame)) {
      continue;
    }
    const timeField = timeFieldOf(frame);
    const refItemId =
      typeof frame.refId === 'string' && /^I\d+$/.test(frame.refId)
        ? numericItemIdCandidate(frame.refId.slice(1))
        : undefined;
    for (const field of frame.fields) {
      if (field.type === FieldType.time) {
        continue;
      }
      const row = lastValueFromField(field, timeField);
      if (!row) {
        continue;
      }
      const itemid = row.itemid || refItemId || '';
      const key = itemKeyFromField(field);
      const stored = itemid ? { ...row, itemid } : row;
      if (itemid) {
        result[itemid] = stored;
      }
      if (key) {
        result[key] = stored;
      }
    }
  }
  return result;
}

export function buildZabbixProblemsTargets(
  datasourceUid: string,
  groupNames: readonly string[]
): ZabbixMetricsQuery[] {
  const groupFilter = zabbixGroupsFilter(groupNames);
  if (!datasourceUid || !groupFilter) {
    return [];
  }
  return [
    {
      refId: 'P0',
      datasource: { uid: datasourceUid },
      queryType: ZABBIX_QUERY_TYPE_PROBLEMS,
      schema: ZABBIX_QUERY_SCHEMA,
      group: { filter: groupFilter },
      host: { filter: '/.*/' },
      application: { filter: '' },
      itemTag: { filter: '' },
      trigger: { filter: '' },
      proxy: { filter: '' },
      showProblems: 'problems',
      functions: [],
      options: {
        ...statusQueryOptions(),
        minSeverity: ZABBIX_PROBLEM_MIN_SEVERITY,
        limit: 1001,
        acknowledged: 0,
        hostsInMaintenance: true,
        sortProblems: 'severity',
      },
      resultFormat: 'time_series',
    },
  ];
}

function problemHostIds(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  const hosts = value.hosts;
  if (!Array.isArray(hosts)) {
    return [];
  }
  const ids: string[] = [];
  for (const host of hosts) {
    if (!isRecord(host)) {
      continue;
    }
    const id = String(host.hostid ?? '').trim();
    if (id) {
      ids.push(id);
    }
  }
  return ids;
}

function problemSeverity(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }
  const raw = value.severity ?? value.priority;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function problemName(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const name = String(value.name ?? value.description ?? '').trim();
  return name || undefined;
}

export function parseProblemsFromFrames(
  frames: Array<DataFrame | unknown>,
  hostIds: string[]
): HostProblemsMap {
  const wanted = new Set(hostIds.map((id) => id.trim()).filter(Boolean));
  const summary: HostProblemsMap = {};
  const namesByHost = new Map<string, Map<string, number>>();
  if (!wanted.size) {
    return summary;
  }

  const remember = (hostid: string, name: string | undefined, severity: number) => {
    if (!name) {
      return;
    }
    const byName = namesByHost.get(hostid) ?? new Map<string, number>();
    const prev = byName.get(name) ?? -1;
    if (severity >= prev) {
      byName.set(name, severity);
    }
    namesByHost.set(hostid, byName);
  };

  for (const frame of frames) {
    if (!isDataFrame(frame)) {
      continue;
    }
    for (const field of frame.fields) {
      for (const value of readFieldValues(field)) {
        const severity = problemSeverity(value);
        if (severity < ZABBIX_PROBLEM_MIN_SEVERITY) {
          continue;
        }
        const name = problemName(value);
        for (const hostid of problemHostIds(value)) {
          if (!wanted.has(hostid)) {
            continue;
          }
          const prev = summary[hostid];
          summary[hostid] = {
            count: (prev?.count ?? 0) + 1,
            maxSeverity: Math.max(prev?.maxSeverity ?? 0, severity),
          };
          remember(hostid, name, severity);
        }
      }
    }
  }

  for (const [hostid, current] of Object.entries(summary)) {
    const ranked = [...(namesByHost.get(hostid)?.entries() ?? [])].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')
    );
    const names = ranked.map(([name]) => name);
    if (names.length) {
      current.names = names;
    }
  }
  return summary;
}

export async function fetchZabbixHostProblemsViaQuery(
  datasourceUid: string,
  hostIds: string[],
  groupNames: readonly string[]
): Promise<HostProblemsMap> {
  const ids = [...new Set(hostIds.map((id) => id.trim()).filter(Boolean))];
  if (!datasourceUid || !ids.length) {
    return {};
  }
  const targets = buildZabbixProblemsTargets(datasourceUid, groupNames);
  if (!targets.length) {
    return {};
  }
  const nowMs = Date.now();
  const request = zabbixQueryRequest(
    datasourceUid,
    `topology-problems-${datasourceUid}`,
    targets,
    statusQueryTimeRange(nowMs, ZABBIX_STATUS_QUERY_RANGE_SEC),
    ZABBIX_DIRECT_MIN_REFRESH_SEC,
    1000,
    nowMs
  );
  const response = await queryZabbixWithRetry(
    datasourceUid,
    request,
    undefined,
    'Falha ao consultar problemas no Zabbix.'
  );
  return parseProblemsFromFrames(response.data ?? [], ids);
}

function itemNameFromField(field: Field): string | undefined {
  const fromLabel = labelString(field.labels, 'item');
  if (fromLabel) {
    return fromLabel;
  }
  const name = field.name?.trim();
  if (!name || name === 'Value') {
    return undefined;
  }
  return name;
}

export interface ZabbixInterfaceQueryHost {
  hostKey: string;
  name: string;
  aliases?: string[];
  group?: string;
  hostid?: string;
}

/** Host do Metrics: nunca IP — o grafana-zabbix filtra pelo nome do host. */
export function zabbixInterfaceHostFilter(names: readonly string[]): string {
  const unique = [...new Set(names.map((name) => name.trim()).filter((name) => name && !isIpv4(name)))];
  if (!unique.length) {
    return '';
  }
  if (unique.length === 1) {
    return `/^${escapeRegex(unique[0])}$/i`;
  }
  return `/^(?:${unique.map((name) => escapeRegex(name)).join('|')})$/i`;
}

function interfaceQueryHosts(
  hostKeys: string[],
  metadata?: HostMetadataMap
): ZabbixInterfaceQueryHost[] {
  const seen = new Set<string>();
  const hosts: ZabbixInterfaceQueryHost[] = [];
  for (const hostKey of hostKeys) {
    const meta = metadata?.[hostKey];
    const identity = (meta?.hostid?.trim() || hostKey).toLowerCase();
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    const aliases = [meta?.name, hostKey].map((value) => value?.trim() ?? '').filter(Boolean);
    const name = aliases.find((value) => !isIpv4(value));
    if (!name) {
      continue;
    }
    hosts.push({
      hostKey,
      name,
      aliases,
      group: meta?.hostGroups?.find((group) => group.trim())?.trim(),
      hostid: meta?.hostid?.trim(),
    });
  }
  return hosts;
}

/** Um target Metrics por host — qualquer item; as palavras-chave filtram a key no parse. */
export function buildZabbixInterfaceTargets(
  datasourceUid: string,
  hosts: ZabbixInterfaceQueryHost[]
): ZabbixMetricsQuery[] {
  if (!datasourceUid || !hosts.length) {
    return [];
  }
  const targets: ZabbixMetricsQuery[] = [];
  for (const host of hosts) {
    const hostFilter = zabbixInterfaceHostFilter([host.name, ...(host.aliases ?? [])]);
    if (!hostFilter) {
      continue;
    }
    const groupFilter = host.group?.trim() ? zabbixGroupFilter(host.group.trim()) : '/.*/';
    targets.push(
      zabbixMetricsTarget(datasourceUid, `IF${targets.length}`, groupFilter, hostFilter, ZABBIX_INTERFACE_ITEM_FILTER)
    );
  }
  return targets;
}

function matchesInterfaceKeyword(key_: string, name: string | undefined, keywords: string[]): boolean {
  const hay = `${key_} ${name ?? ''}`.toLowerCase();
  return keywords.some((keyword) => hay.includes(keyword.toLowerCase()));
}

function interfaceHostKeyLookup(hostKeys: string[], metadata?: HostMetadataMap): Map<string, string> {
  const byLabel = new Map<string, string>();
  for (const key of hostKeys) {
    const meta = metadata?.[key];
    for (const label of [key, meta?.name, meta?.ip, meta?.hostid]) {
      const normalized = label?.trim().toLowerCase();
      if (normalized && !byLabel.has(normalized)) {
        byLabel.set(normalized, key);
      }
    }
  }
  return byLabel;
}

export function parseInterfaceItemsFromFrames(
  frames: Array<DataFrame | unknown>,
  hostKeys: string[],
  searchKeys: string[],
  metadata?: HostMetadataMap
): ZabbixHostInterfaceItems[] {
  const keywords = [...new Set(searchKeys.map((key) => key.trim()).filter(Boolean))];
  const keys = [...new Set(hostKeys.map((key) => key.trim()).filter(Boolean))];
  const itemsByHost = new Map<string, ZabbixInterfaceItem[]>();
  for (const key of keys) {
    itemsByHost.set(key, []);
  }
  if (!keywords.length || !keys.length) {
    return keys.map((hostKey) => ({
      hostKey,
      hostid: metadata?.[hostKey]?.hostid?.trim() ?? '',
      items: [],
    }));
  }

  const byLabel = interfaceHostKeyLookup(keys, metadata);
  for (const frame of frames) {
    if (!isDataFrame(frame)) {
      continue;
    }
    const timeField = timeFieldOf(frame);
    for (const field of frame.fields) {
      if (field.type === FieldType.time) {
        continue;
      }
      const key_ = itemKeyFromField(field);
      const name = itemNameFromField(field);
      if (!key_ || !matchesInterfaceKeyword(key_, name, keywords)) {
        continue;
      }
      const hostLabel = hostLabelFromField(field, frame.name);
      const hostidLabel = hostIdFromField(field);
      const hostKey =
        (hostLabel ? byLabel.get(hostLabel.trim().toLowerCase()) : undefined) ??
        (hostidLabel ? byLabel.get(hostidLabel.trim().toLowerCase()) : undefined);
      if (!hostKey) {
        continue;
      }
      const last = lastFiniteNumber(readFieldValues(field));
      const hostid = hostidLabel || metadata?.[hostKey]?.hostid?.trim() || '';
      const timeValues = timeField ? readFieldValues(timeField) : [];
      const clock = last && timeField ? unixSecFromTimeValue(timeValues[last.index]) : undefined;
      const item: ZabbixInterfaceItem = {
        itemid: itemIdFromField(field) ?? `${hostid || hostKey}:${key_}`,
        key_,
        hostid,
      };
      if (name) {
        item.name = name;
      }
      if (last) {
        item.lastvalue = String(last.value);
      }
      if (clock != null) {
        item.lastclock = String(clock);
      }
      itemsByHost.get(hostKey)?.push(item);
    }
  }

  return keys.map((hostKey) => ({
    hostKey,
    hostid: metadata?.[hostKey]?.hostid?.trim() ?? itemsByHost.get(hostKey)?.[0]?.hostid ?? '',
    items: itemsByHost.get(hostKey) ?? [],
  }));
}

export async function fetchZabbixHostInterfaceItemsViaQuery(
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
  const targets = buildZabbixInterfaceTargets(datasourceUid, interfaceQueryHosts(keys, metadata));
  if (!targets.length) {
    return [];
  }
  const nowMs = Date.now();
  const request = zabbixQueryRequest(
    datasourceUid,
    nextZabbixQueryRequestId(`topology-interfaces-${datasourceUid}`),
    targets,
    statusQueryTimeRange(nowMs, ZABBIX_INTERFACE_QUERY_RANGE_SEC),
    ZABBIX_DIRECT_MIN_REFRESH_SEC,
    1,
    nowMs
  );
  const response = await queryZabbixWithRetry(
    datasourceUid,
    request,
    undefined,
    'Falha ao consultar itens de interface no Zabbix.'
  );
  return parseInterfaceItemsFromFrames(response.data ?? [], keys, terms, metadata);
}

function metricFindNames(rows: Array<{ text?: string; value?: string | number }> | undefined): string[] {
  const names = new Set<string>();
  for (const row of rows ?? []) {
    const name = String(row.text ?? row.value ?? '').trim();
    if (name) {
      names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export async function fetchZabbixHostGroupNamesViaQuery(datasourceUid: string): Promise<string[]> {
  if (!datasourceUid) {
    return [];
  }
  const ds = await getDataSourceSrv().get(datasourceUid);
  if (typeof ds.metricFindQuery !== 'function') {
    return [];
  }
  const rows = await ds.metricFindQuery({ queryType: ZABBIX_MFQ_GROUPS, group: '/.*/' });
  return metricFindNames(rows);
}

/**
 * Nomes do campo Item do editor grafana-zabbix, a partir dos grupos já escolhidos.
 * Um grupo de cada vez: o plugin resolve os hosts do grupo e devolve os nomes únicos.
 */
export async function fetchZabbixItemNamesViaQuery(
  datasourceUid: string,
  groupNames: string[]
): Promise<string[]> {
  const groups = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  if (!datasourceUid || !groups.length) {
    return [];
  }
  const ds = await getDataSourceSrv().get(datasourceUid);
  if (typeof ds.metricFindQuery !== 'function') {
    return [];
  }
  for (const groupName of groups) {
    const names = metricFindNames(
      await ds.metricFindQuery({
        queryType: ZABBIX_MFQ_ITEMS,
        group: zabbixGroupFilter(groupName),
        host: '/.*/',
        application: '',
        itemTag: '',
        item: '/.*/',
      })
    );
    if (names.length) {
      return names;
    }
  }
  return [];
}
