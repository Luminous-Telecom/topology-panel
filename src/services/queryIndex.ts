import { DataFrame, Field, FieldType, PanelData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';
import {
  HostDisplayInfo,
  HostDisplayMap,
  HostMetadata,
  HostMetadataMap,
  TopologyNetworkInterface,
  TopologyQueryRefInfo,
} from '../types';
import { isIpv4 } from '../utils/ipv4';
import { resolveHostStatusDisplay, StatusColorOptions } from '../utils/statusMapping';
import { parseInterfaceItemKey } from '../utils/zabbixAdapter/interfaceItemKeys';
import {
  groupInterfacesByHost,
  RawZabbixInterfaceItem,
} from '../utils/zabbixAdapter/parseInterfaceItems';

/**
 * Leitura única da aba Query do painel.
 *
 * Antes cada helper de `utils.ts` percorria `data.series` por conta própria e o `TopologyPanel`
 * disparava de 6 a 7 varreduras completas por refresh. Aqui os frames são lidos **uma vez** e todo
 * o resto (status, hosts por refId, metadata, refIds) é derivado do resultado em memória.
 *
 * O índice guarda só fatos crus da Query — nada que dependa das opções do painel. Cores e textos de
 * status são aplicados depois, em `hostDisplayByRefIdFromIndex`, que custa O(hosts) em vez de
 * O(hosts × pontos).
 */

export type QuerySource = PanelData | DataFrame[] | undefined;

export interface QueryRefBucket {
  /** Hosts com label na query, em ordem de aparição (inclui séries não numéricas). */
  hosts: Set<string>;
  /** Host -> último valor numérico. O primeiro campo que resolve um valor vence. */
  lastValues: Map<string, number>;
  /** Host -> epoch (s) do lastclock Zabbix, quando disponível. */
  lastUpdatedAtSec: Map<string, number>;
}

export interface QueryIndex {
  metadata: HostMetadataMap;
  /** Todos os hosts da Query, ordenados por nome visível. */
  hosts: string[];
  refIds: string[];
  refInfos: TopologyQueryRefInfo[];
  byRefId: Map<string, QueryRefBucket>;
  /** Itens de interface por rótulo de host da Query (IP, nome visível, hostid…). */
  interfaceItemsByHost: Map<string, Map<string, RawZabbixInterfaceItem>>;
  datasourceUid?: string;
}

const EMPTY_INDEX: QueryIndex = {
  metadata: {},
  hosts: [],
  refIds: [],
  refInfos: [],
  byRefId: new Map(),
  interfaceItemsByHost: new Map(),
  datasourceUid: undefined,
};

/**
 * Cache por identidade do `PanelData`. O Grafana entrega um objeto novo a cada resultado de query,
 * então a chave de identidade tem exatamente a mesma validade que os `useMemo(..., [data])` que já
 * existiam — a diferença é que agora todos os consumidores compartilham a mesma varredura.
 */
const indexCache = new WeakMap<object, QueryIndex>();

export function buildQueryIndex(data: QuerySource): QueryIndex {
  if (!data) {
    return EMPTY_INDEX;
  }
  const cached = indexCache.get(data);
  if (cached) {
    return cached;
  }
  const index = computeQueryIndex(data);
  indexCache.set(data, index);
  return index;
}

export function hostLabelFromField(field: Pick<Field, 'labels'>): string | undefined {
  const host =
    field.labels?.host?.trim() ||
    field.labels?.__zbx_host_name?.trim() ||
    field.labels?.hostName?.trim();
  return host || undefined;
}

/**
 * `Field.values` é array puro desde o Grafana 10; `.get(i)` só sobrevive por um shim de
 * `Array.prototype` marcado como deprecated no `@grafana/data`. Indexar direto evita depender dele.
 */
function fieldItemKey(field: Field): string {
  return String(field.labels?.item_key ?? field.labels?.key_ ?? '')
    .trim()
    .toLowerCase();
}

function fieldItemName(field: Field): string | undefined {
  return field.labels?.item_name?.trim() || field.labels?.item?.trim() || undefined;
}

function fieldItemId(field: Field): string | undefined {
  return (
    field.labels?.itemid?.trim() ||
    field.labels?.__zbx_itemid?.trim() ||
    field.labels?.__zbx_item_id?.trim() ||
    undefined
  );
}

function fieldLastValueString(field: Field): string | undefined {
  if (field.type === FieldType.number || field.type === FieldType.time) {
    const last = lastNumericValue(field.values);
    return last !== undefined ? String(last) : undefined;
  }
  if (!field.values?.length) {
    return undefined;
  }
  const last = field.values[field.values.length - 1];
  if (last == null) {
    return undefined;
  }
  const text = String(last).trim();
  return text || undefined;
}

function lastNumericValue(values: ArrayLike<unknown>): number | undefined {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v === null || v === undefined) {
      continue;
    }
    const n = Number(v);
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  return undefined;
}

function framesOf(data: PanelData | DataFrame[]): DataFrame[] {
  return Array.isArray(data) ? data : data.series ?? [];
}

function targetsOf(data: PanelData | DataFrame[]): DataQuery[] {
  if (Array.isArray(data)) {
    return [];
  }
  return data.request?.targets ?? [];
}

/**
 * Campos específicos do datasource Zabbix (`group`, `host`, `item`…) não existem em `DataQuery`,
 * que só garante `refId`. A leitura solta fica isolada aqui em vez de espalhar casts.
 */
function targetProp(target: DataQuery, key: string): unknown {
  return (target as unknown as Record<string, unknown>)[key];
}

function frameQueryRefId(frame: DataFrame, fallbackRefId?: string): string {
  return (frame.refId?.trim() || fallbackRefId?.trim() || '').toUpperCase();
}

/** Único refId do painel — usado quando a série vem sem `frame.refId`. */
function soleTargetRefId(targets: DataQuery[]): string | undefined {
  if (targets.length !== 1) {
    return undefined;
  }
  const refId = targets[0].refId?.trim();
  return refId ? refId.toUpperCase() : undefined;
}

function zabbixQueryScopeName(obj: unknown): string | undefined {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }
  const rec = obj as Record<string, unknown>;
  const filter = typeof rec.filter === 'string' ? rec.filter.trim() : '';
  if (filter) {
    return filter;
  }
  const name = typeof rec.name === 'string' ? rec.name.trim() : '';
  if (name) {
    return name;
  }
  return undefined;
}

function zabbixQueryScopeHint(obj: unknown, prefix: string): string | undefined {
  const scopeName = zabbixQueryScopeName(obj);
  if (!scopeName) {
    return undefined;
  }
  return `${prefix}: ${scopeName}`;
}

function zabbixQueryTargetHint(target: DataQuery): string | undefined {
  return (
    zabbixQueryScopeHint(targetProp(target, 'group'), 'Grupo') ||
    zabbixQueryScopeHint(targetProp(target, 'host'), 'Host') ||
    zabbixQueryScopeHint(targetProp(target, 'hosts'), 'Hosts') ||
    zabbixQueryScopeHint(targetProp(target, 'application'), 'App') ||
    zabbixQueryScopeHint(targetProp(target, 'item'), 'Item')
  );
}

function resolveDatasourceUid(data: PanelData | DataFrame[]): string | undefined {
  if (Array.isArray(data)) {
    return undefined;
  }

  for (const target of data.request?.targets ?? []) {
    const ds = target.datasource as string | { uid?: string; type?: string } | undefined;
    if (typeof ds === 'string') {
      const uid = ds.trim();
      if (uid && !uid.startsWith('--')) {
        return uid;
      }
      continue;
    }
    const uid = ds?.uid?.trim();
    if (uid && !uid.startsWith('--')) {
      return uid;
    }
  }

  for (const frame of data.series ?? []) {
    const meta = frame.meta as { custom?: { datasourceUid?: string }; datasourceUid?: string } | undefined;
    const uid = meta?.custom?.datasourceUid?.trim() || meta?.datasourceUid?.trim();
    if (uid) {
      return uid;
    }
  }

  return undefined;
}

function indexHostMetadata(result: HostMetadataMap, field: Field, host: string): void {
  const labels = (field.labels ?? {}) as Record<string, string | undefined>;
  const visible = (labels.__zbx_host_visible_name || labels.__zbx_host_name || labels.host || host).trim();
  const hostid = labels.hostid?.trim() || labels.__zbx_hostid?.trim();
  const entry: HostMetadata = {
    name: visible,
    ip: isIpv4(host) ? host : result[host]?.ip,
    hostid: hostid || result[host]?.hostid,
  };
  result[host] = entry;
  if (entry.name) {
    result[entry.name] = entry;
  }
  if (entry.ip && isIpv4(entry.ip)) {
    result[entry.ip] = entry;
  }
  if (entry.hostid) {
    result[entry.hostid] = entry;
  }
}

function hostAliasKeys(metadata: HostMetadataMap, host: string): string[] {
  const keys = new Set<string>([host]);
  const entry = metadata[host];
  if (entry?.name) {
    keys.add(entry.name);
  }
  if (entry?.ip) {
    keys.add(entry.ip);
  }
  if (entry?.hostid) {
    keys.add(entry.hostid);
  }
  return [...keys];
}

function registerInterfaceItem(
  interfaceItemsByHost: Map<string, Map<string, RawZabbixInterfaceItem>>,
  metadata: HostMetadataMap,
  host: string,
  item: RawZabbixInterfaceItem
): void {
  const itemKey = item.key_.trim().toLowerCase();
  if (!itemKey) {
    return;
  }
  for (const alias of hostAliasKeys(metadata, host)) {
    let bucket = interfaceItemsByHost.get(alias);
    if (!bucket) {
      bucket = new Map();
      interfaceItemsByHost.set(alias, bucket);
    }
    bucket.set(itemKey, item);
  }
}

function indexInterfaceField(
  interfaceItemsByHost: Map<string, Map<string, RawZabbixInterfaceItem>>,
  metadata: HostMetadataMap,
  field: Field,
  host: string
): void {
  const key = fieldItemKey(field);
  if (!key || !parseInterfaceItemKey(key)) {
    return;
  }
  const hostid = metadata[host]?.hostid;
  registerInterfaceItem(interfaceItemsByHost, metadata, host, {
    itemid: fieldItemId(field) || '',
    key_: key,
    name: fieldItemName(field),
    lastvalue: fieldLastValueString(field),
    hostid,
  });
}

function ensureBucket(byRefId: Map<string, QueryRefBucket>, refId: string): QueryRefBucket {
  const existing = byRefId.get(refId);
  if (existing) {
    return existing;
  }
  const created: QueryRefBucket = {
    hosts: new Set(),
    lastValues: new Map(),
    lastUpdatedAtSec: new Map(),
  };
  byRefId.set(refId, created);
  return created;
}

function computeQueryIndex(data: PanelData | DataFrame[]): QueryIndex {
  const frames = framesOf(data);
  const targets = targetsOf(data);

  const metadata: HostMetadataMap = {};
  const allHosts = new Set<string>();
  const byRefId = new Map<string, QueryRefBucket>();
  const interfaceItemsByHost = new Map<string, Map<string, RawZabbixInterfaceItem>>();
  const refInfoByRef = new Map<string, TopologyQueryRefInfo>();

  for (const target of targets) {
    const refId = target.refId?.trim().toUpperCase();
    if (!refId) {
      continue;
    }
    refInfoByRef.set(refId, { refId, hint: zabbixQueryTargetHint(target) });
  }

  const fallbackRefId = soleTargetRefId(targets);

  for (const frame of frames) {
    const refId = frameQueryRefId(frame, fallbackRefId);
    const bucket = refId ? ensureBucket(byRefId, refId) : undefined;
    if (refId && !refInfoByRef.has(refId)) {
      refInfoByRef.set(refId, { refId });
    }

    for (const field of frame.fields ?? []) {
      const host = hostLabelFromField(field);
      if (!host) {
        continue;
      }
      allHosts.add(host);
      indexHostMetadata(metadata, field, host);
      indexInterfaceField(interfaceItemsByHost, metadata, field, host);

      if (!bucket) {
        continue;
      }
      bucket.hosts.add(host);
      if (field.type !== FieldType.number || bucket.lastValues.has(host)) {
        continue;
      }
      const last = lastNumericValue(field.values);
      if (last !== undefined) {
        bucket.lastValues.set(host, last);
      }
    }
  }

  const refInfos = [...refInfoByRef.values()].sort((a, b) => a.refId.localeCompare(b.refId));

  return {
    metadata,
    hosts: [...allHosts].sort((a, b) => a.localeCompare(b)),
    refIds: refInfos.map((info) => info.refId),
    refInfos,
    byRefId,
    interfaceItemsByHost,
    datasourceUid: resolveDatasourceUid(data),
  };
}

function collectQueryHostAliases(hostKey: string, metadata?: HostMetadataMap): string[] {
  const aliases = new Set<string>([hostKey]);
  const direct = metadata?.[hostKey];
  if (direct?.name) {
    aliases.add(direct.name);
  }
  if (direct?.ip) {
    aliases.add(direct.ip);
  }
  if (direct?.hostid) {
    aliases.add(direct.hostid);
  }
  for (const [key, entry] of Object.entries(metadata ?? {})) {
    if (
      key === hostKey ||
      entry.ip === hostKey ||
      entry.name === hostKey ||
      entry.hostid === hostKey
    ) {
      aliases.add(key);
      if (entry.name) {
        aliases.add(entry.name);
      }
      if (entry.ip) {
        aliases.add(entry.ip);
      }
      if (entry.hostid) {
        aliases.add(entry.hostid);
      }
    }
  }
  return [...aliases];
}

function rawInterfaceItemsForHostKey(
  index: QueryIndex,
  hostKey: string,
  metadata?: HostMetadataMap
): RawZabbixInterfaceItem[] {
  const merged = new Map<string, RawZabbixInterfaceItem>();
  for (const alias of collectQueryHostAliases(hostKey, metadata)) {
    const bucket = index.interfaceItemsByHost.get(alias);
    if (!bucket) {
      continue;
    }
    for (const [key, item] of bucket) {
      merged.set(key, item);
    }
  }
  return [...merged.values()];
}

/** Indica se a Query trouxe ao menos um item de interface (tráfego, status, velocidade…). */
export function queryIndexHasInterfaceItems(index: QueryIndex): boolean {
  return index.interfaceItemsByHost.size > 0;
}

/** Interfaces descobertas na Query para as chaves pedidas (IP/nome/hostid do mapa). */
export function interfacesByHostKeysFromIndex(
  index: QueryIndex,
  hostKeys: string[],
  metadata?: HostMetadataMap
): Record<string, TopologyNetworkInterface[]> {
  const entries = hostKeys
    .map((hostKey) => hostKey.trim())
    .filter(Boolean)
    .map((hostKey) => {
      const items = rawInterfaceItemsForHostKey(index, hostKey, metadata);
      const hostid = metadata?.[hostKey]?.hostid ?? items.find((item) => item.hostid)?.hostid;
      return { hostKey, hostid, items };
    })
    .filter((entry) => entry.items.length > 0);

  return groupInterfacesByHost(entries);
}

/**
 * Aplica as cores/textos de status do painel sobre os últimos valores já indexados.
 * Só depende de `statusOptions`, então muda de cor no painel não relê os frames.
 */
export function hostDisplayByRefIdFromIndex(
  index: QueryIndex,
  statusOptions: StatusColorOptions
): Record<string, HostDisplayMap> {
  const result: Record<string, HostDisplayMap> = {};
  for (const [refId, bucket] of index.byRefId) {
    const display: HostDisplayMap = {};
    for (const [host, value] of bucket.lastValues) {
      const updatedAtSec = bucket.lastUpdatedAtSec.get(host);
      const resolved = resolveHostStatusDisplay(value, statusOptions);
      const entry: HostDisplayInfo = resolved
        ? {
            value,
            color: resolved.color,
            text: resolved.text,
            status: resolved.status,
            ...(updatedAtSec != null ? { updatedAtSec } : {}),
          }
        : { value, ...(updatedAtSec != null ? { updatedAtSec } : {}) };
      display[host] = entry;
    }
    result[refId] = display;
  }
  return result;
}

export function queryHostsByRefIdFromIndex(index: QueryIndex): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [refId, bucket] of index.byRefId) {
    result[refId] = [...bucket.hosts];
  }
  return result;
}

/** Hosts com valor numérico nos refIds informados (base do opt-in de exibição). */
export function numericHostsForRefIds(index: QueryIndex, refIds: Iterable<string>): Set<string> {
  const hosts = new Set<string>();
  for (const refId of refIds) {
    const bucket = index.byRefId.get(refId);
    if (!bucket) {
      continue;
    }
    for (const host of bucket.lastValues.keys()) {
      hosts.add(host);
    }
  }
  return hosts;
}
