import { DataFrame, FieldType, LoadingState, PanelData, getDefaultTimeRange } from '@grafana/data';
import {
  HostDisplayInfo,
  HostDisplayMap,
  HostMetadata,
  HostMetadataMap,
  TopologyHostIcon,
  TopologyLink,
  TopologyLinkMedium,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
  TopologyQueryRefInfo,
} from './types';
import { hostIp as hostIpFromNode } from './utils/hostTools';
import { resolveHostStatusDisplay, StatusColorOptions } from './utils/statusMapping';
import { HOST_ICON_GAP, HOST_ICON_SIZE, hostIconRenderDimensions } from './utils/hostIcons';
import { isIpv4 } from './utils/ipv4';

export { isIpv4 };

/** Nó do tipo host — inclui nós legados sem `type` (default é 'host'). */
export function isHostNode(node: TopologyNode): boolean {
  return (node.type ?? 'host') === 'host';
}

export function isSubmapNode(node: TopologyNode): boolean {
  return node.type === 'submap';
}

export function findNodeById(nodes: TopologyNode[], id: string): TopologyNode | undefined {
  return nodes.find((n) => n.id === id);
}

/** IP do host (subtitle, zabbixHost ou metadata da Query). */
export function resolveHostIp(
  node: { zabbixHost?: string; subtitle?: string; zabbixHostId?: string },
  metadata?: HostMetadataMap
): string | undefined {
  const fromSubtitle = hostIpFromNode(node);
  if (fromSubtitle) {
    return fromSubtitle;
  }
  const hostKey = node.zabbixHost?.trim();
  if (hostKey && isIpv4(hostKey)) {
    return hostKey;
  }
  const hostId = node.zabbixHostId?.trim();
  const byId = hostId ? metadata?.[hostId] : undefined;
  if (byId?.ip && isIpv4(byId.ip)) {
    return byId.ip.trim();
  }
  const byName = hostKey ? metadata?.[hostKey] : undefined;
  if (byName?.ip && isIpv4(byName.ip)) {
    return byName.ip.trim();
  }
  if (hostKey) {
    for (const entry of Object.values(metadata ?? {})) {
      if (entry.name?.trim() === hostKey && entry.ip && isIpv4(entry.ip)) {
        return entry.ip.trim();
      }
    }
  }
  return undefined;
}

/** Referência de host para casar Query com mapa (IP preferencial; nome só se não houver IP). */
export interface HostLookupRef {
  zabbixHost?: string;
  subtitle?: string;
  zabbixHostId?: string;
  label?: string;
}

/** Chave primária — IP quando existir; senão nome (zabbixHost / label). */
export function resolveHostLookupKey(
  node: HostLookupRef,
  metadata?: HostMetadataMap
): string | undefined {
  const ip = resolveHostIp(node, metadata);
  if (ip) {
    return ip;
  }
  const name = node.zabbixHost?.trim();
  if (name && !isIpv4(name)) {
    return name;
  }
  const label = node.label?.trim();
  if (label && !isIpv4(label)) {
    return label;
  }
  return name || label || undefined;
}

export function collectHostLookupCandidates(ref: HostLookupRef, metadata?: HostMetadataMap): string[] {
  const zabbixHost = ref.zabbixHost?.trim();
  const label = ref.label?.trim();
  const hostId = ref.zabbixHostId?.trim();
  const out: string[] = [];
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed || out.includes(trimmed)) {
      return;
    }
    out.push(trimmed);
  };

  const resolvedIp = resolveHostIp(ref, metadata);
  // IP primeiro — status/hover/sync preferem interface estável ao rename.
  // (resolveHostIp já cobre subtitle/zabbixHost como IP; se vier vazio, nenhum dos dois é IP.)
  if (resolvedIp) {
    add(resolvedIp);
    const metaByIp = metadata?.[resolvedIp];
    if (metaByIp?.name) {
      add(metaByIp.name);
    }
    for (const entry of Object.values(metadata ?? {})) {
      if (entry.ip === resolvedIp && entry.name?.trim()) {
        add(entry.name);
      }
    }
  }

  // Nome só como fallback (ou alias depois do IP).
  if (zabbixHost && !isIpv4(zabbixHost)) {
    add(zabbixHost);
  }
  if (label && label !== zabbixHost && !isIpv4(label)) {
    add(label);
  }

  const metaByHost = zabbixHost ? metadata?.[zabbixHost] : undefined;
  if (metaByHost?.ip && isIpv4(metaByHost.ip)) {
    add(metaByHost.ip);
  }
  if (metaByHost?.name) {
    add(metaByHost.name);
  }

  if (label) {
    const metaByLabel = metadata?.[label];
    if (metaByLabel?.ip && isIpv4(metaByLabel.ip)) {
      add(metaByLabel.ip);
    }
    if (metaByLabel?.name) {
      add(metaByLabel.name);
    }
  }

  if (hostId) {
    const metaById = metadata?.[hostId];
    if (metaById) {
      if (metaById.ip && isIpv4(metaById.ip)) {
        add(metaById.ip);
      }
      if (metaById.name) {
        add(metaById.name);
      }
    }
  }

  if (zabbixHost && !isIpv4(zabbixHost)) {
    for (const entry of Object.values(metadata ?? {})) {
      if (entry.name?.trim() === zabbixHost && entry.ip && isIpv4(entry.ip)) {
        add(entry.ip);
      }
    }
  }

  return out;
}

/** Propaga IP do mapa para o metadata da Query (indexa por IP quando o nome ainda casa). */
export function enrichHostMetadataFromMap(meta: HostMetadataMap, map: TopologyMap): HostMetadataMap {
  if (!Object.keys(meta).length || !map.nodes.length) {
    return meta;
  }

  const result: HostMetadataMap = { ...meta };

  for (const node of map.nodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const ip = resolveHostIp(node);
    if (!ip) {
      continue;
    }

    const nameKeys = [node.label?.trim(), node.zabbixHost?.trim()].filter(
      (value): value is string => Boolean(value && !isIpv4(value))
    );

    let entry = result[ip];
    if (!entry) {
      for (const key of nameKeys) {
        const byName = result[key];
        if (byName) {
          entry = byName;
          break;
        }
      }
    }
    if (!entry) {
      for (const value of Object.values(result)) {
        if (value.name && nameKeys.includes(value.name.trim())) {
          entry = value;
          break;
        }
      }
    }
    if (!entry) {
      continue;
    }

    const next: HostMetadata = {
      ...entry,
      ip: entry.ip && isIpv4(entry.ip) ? entry.ip : ip,
    };
    result[ip] = next;
    if (next.name?.trim()) {
      result[next.name.trim()] = next;
    }
    for (const key of nameKeys) {
      result[key] = next;
    }
  }

  return result;
}

/** Indexa status da Query também pelo IP salvo no mapa (quando o nome ainda casa). */
export function enrichHostDisplayFromMap(
  display: HostDisplayMap,
  map: TopologyMap,
  metadata?: HostMetadataMap
): HostDisplayMap {
  if (!Object.keys(display).length || !map.nodes.length) {
    return display;
  }

  const result: HostDisplayMap = { ...display };

  for (const node of map.nodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const ip = resolveHostIp(node, metadata);
    if (!ip || result[ip]) {
      continue;
    }

    for (const key of collectHostLookupCandidates(
      { zabbixHost: node.zabbixHost, subtitle: node.subtitle, label: node.label },
      metadata
    )) {
      if (key === ip) {
        continue;
      }
      const info = result[key];
      if (info) {
        result[ip] = info;
        break;
      }
    }
  }

  return result;
}

/** Chaves canônicas de host — IP quando existir no metadata, senão o próprio key. */
export function canonicalizeHostKeys(keys: string[], metadata?: HostMetadataMap): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of keys) {
    const key = raw.trim();
    if (!key) {
      continue;
    }
    const meta = metadata?.[key];
    const ip = meta?.ip?.trim() && isIpv4(meta.ip) ? meta.ip.trim() : isIpv4(key) ? key : undefined;
    const canonical = ip || key;
    const seenKey = canonical.toLowerCase();
    if (seen.has(seenKey)) {
      continue;
    }
    seen.add(seenKey);
    out.push(canonical);
  }
  return out;
}

/** UID do datasource Zabbix a partir das queries do painel (aba Query). */
export function resolveZabbixDatasourceUid(data?: PanelData): string | undefined {
  if (!data) {
    return undefined;
  }

  const targets = data.request?.targets ?? [];
  for (const target of targets) {
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

export function hostToNodeId(host: string): string {
  return host
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Chave de layout no mapa salvo — IP quando existir, senão zabbixHost. */
export function resolveHostLayoutKey(node: Pick<TopologyNode, 'zabbixHost' | 'subtitle'>): string | undefined {
  const ip = resolveHostIp(node);
  if (ip) {
    return ip;
  }
  return node.zabbixHost?.trim() || undefined;
}

/** Aliases do host para hiddenHosts (IP, nome visível, chave da Query). */
export function collectHostHiddenKeys(
  node?: Pick<TopologyNode, 'zabbixHost' | 'subtitle' | 'label'>,
  opts?: Pick<TopologyNode, 'zabbixHost' | 'subtitle' | 'label'>
): string[] {
  const keys = new Set<string>();
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (trimmed) {
      keys.add(trimmed);
    }
  };
  add(node?.zabbixHost ?? opts?.zabbixHost);
  add(node?.subtitle ?? opts?.subtitle);
  add(node?.label ?? opts?.label);
  const ip = resolveHostIp({
    zabbixHost: node?.zabbixHost ?? opts?.zabbixHost,
    subtitle: node?.subtitle ?? opts?.subtitle,
  });
  if (ip) {
    keys.add(ip);
  }
  return [...keys];
}

/** Host da Query oculto pelo usuário (hiddenHosts pode ter IP ou nome). */
export function isQueryHostHidden(
  hostName: string,
  meta: HostMetadataMap[string] | undefined,
  hidden: Set<string>
): boolean {
  const candidates = collectHostHiddenKeys({
    zabbixHost: hostName,
    label: meta?.name,
    subtitle: meta?.ip,
  });
  return candidates.some((key) => hidden.has(key));
}

function panelDataFromFrames(frames: DataFrame[]): PanelData {
  return {
    series: frames,
    state: LoadingState.Done,
    timeRange: getDefaultTimeRange(),
  };
}

function lastNumericValue(field: { values: { length: number; get(i: number): unknown } }): number | undefined {
  for (let i = field.values.length - 1; i >= 0; i--) {
    const v = field.values.get(i);
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

function hostLabelFromField(field: { labels?: Record<string, string> }): string | undefined {
  const host =
    field.labels?.host?.trim() ||
    field.labels?.__zbx_host_name?.trim() ||
    field.labels?.hostName?.trim();
  return host || undefined;
}

/**
 * Host -> último valor + cor/texto via mapeamento de status do painel.
 * Query Zabbix crua (time_series).
 */
/** RefIds (A, B, C…) configurados na aba Query do painel. */
export function collectQueryRefIdsFromPanelData(data?: PanelData | DataFrame[]): string[] {
  return collectQueryRefInfosFromPanelData(data).map((info) => info.refId);
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

function zabbixQueryTargetHint(target: Record<string, unknown>): string | undefined {
  return (
    zabbixQueryScopeHint(target.group, 'Grupo') ||
    zabbixQueryScopeHint(target.host, 'Host') ||
    zabbixQueryScopeHint(target.hosts, 'Hosts') ||
    zabbixQueryScopeHint(target.application, 'App') ||
    zabbixQueryScopeHint(target.item, 'Item')
  );
}

/** Queries do painel com refId visível e resumo opcional (host group etc.). */
export function collectQueryRefInfosFromPanelData(data?: PanelData | DataFrame[]): TopologyQueryRefInfo[] {
  const byRef = new Map<string, TopologyQueryRefInfo>();
  if (!data) {
    return [];
  }
  const panelData = Array.isArray(data) ? panelDataFromFrames(data) : data;

  for (const target of panelData.request?.targets ?? []) {
    const rec = target as Record<string, unknown> & { refId?: string };
    const refId = rec.refId?.trim().toUpperCase();
    if (!refId) {
      continue;
    }
    byRef.set(refId, {
      refId,
      hint: zabbixQueryTargetHint(rec),
    });
  }

  for (const frame of panelData.series ?? []) {
    const refId = frame.refId?.trim().toUpperCase();
    if (!refId || byRef.has(refId)) {
      continue;
    }
    byRef.set(refId, { refId });
  }

  return [...byRef.values()].sort((a, b) => a.refId.localeCompare(b.refId));
}

export function sameQueryRefInfos(a: TopologyQueryRefInfo[], b: TopologyQueryRefInfo[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((item, index) => item.refId === b[index].refId && item.hint === b[index].hint);
}

export function sameStringList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

function frameQueryRefId(frame: DataFrame, fallbackRefId?: string): string {
  return (frame.refId?.trim() || fallbackRefId?.trim() || '').toUpperCase();
}

/** Único refId do painel — usado quando a série vem sem frame.refId. */
function soleTargetRefId(data: PanelData): string | undefined {
  const targets = data.request?.targets ?? [];
  if (targets.length !== 1) {
    return undefined;
  }
  const refId = (targets[0] as { refId?: string }).refId?.trim();
  return refId ? refId.toUpperCase() : undefined;
}

/** Bucket de status por refId (match case-insensitive). */
export function findHostDisplayBucket(
  byRefId: Record<string, HostDisplayMap>,
  refId: string
): HostDisplayMap | undefined {
  const trimmed = refId.trim();
  if (!trimmed) {
    return undefined;
  }
  const direct = byRefId[trimmed] ?? byRefId[trimmed.toUpperCase()];
  if (direct) {
    return direct;
  }
  const upper = trimmed.toUpperCase();
  for (const [key, bucket] of Object.entries(byRefId)) {
    if (key.toUpperCase() === upper) {
      return bucket;
    }
  }
  return undefined;
}

function collectHostDisplayFromFrame(
  frame: DataFrame,
  bucket: HostDisplayMap,
  statusOptions: StatusColorOptions
): void {
  for (const field of frame.fields ?? []) {
    if (field.type !== FieldType.number) {
      continue;
    }
    const host = hostLabelFromField(field);
    if (!host) {
      continue;
    }
    if (bucket[host]) {
      const labels = (field.labels ?? {}) as Record<string, string | undefined>;
      const ip = pickIpFromLabels(labels);
      if (ip && !bucket[ip]) {
        bucket[ip] = bucket[host];
      }
      continue;
    }
    const last = lastNumericValue(field);
    if (last === undefined) {
      continue;
    }
    const resolved = resolveHostStatusDisplay(last, statusOptions);
    const entry: HostDisplayInfo = resolved
      ? {
          value: last,
          color: resolved.color,
          text: resolved.text,
          status: resolved.status,
        }
      : { value: last };
    bucket[host] = entry;
    const labels = (field.labels ?? {}) as Record<string, string | undefined>;
    const ip = pickIpFromLabels(labels);
    if (ip) {
      bucket[ip] = entry;
    }
  }
}

export function extractHostDisplay(
  data: PanelData,
  statusOptions: StatusColorOptions
): HostDisplayMap {
  const result: HostDisplayMap = {};
  if (!data?.series?.length) {
    return result;
  }

  for (const frame of data.series) {
    collectHostDisplayFromFrame(frame, result, statusOptions);
  }

  return result;
}

/**
 * Mantém refIds que ainda não voltaram no refresh; os que chegaram substituem o bucket inteiro.
 */
export function mergeHostDisplayByRefId(
  live: Record<string, HostDisplayMap>,
  previous: Record<string, HostDisplayMap>
): Record<string, HostDisplayMap> {
  if (Object.keys(live).length === 0) {
    return previous;
  }
  if (Object.keys(previous).length === 0) {
    return live;
  }
  const merged: Record<string, HostDisplayMap> = { ...previous };
  for (const [refId, bucket] of Object.entries(live)) {
    merged[refId] = bucket;
  }
  return merged;
}

/** Achata buckets por refId num mapa único (hosts do canvas). */
export function flattenHostDisplayByRefId(
  byRefId: Record<string, HostDisplayMap>
): HostDisplayMap {
  const result: HostDisplayMap = {};
  for (const bucket of Object.values(byRefId)) {
    for (const [key, info] of Object.entries(bucket)) {
      const existing = result[key];
      if (!existing) {
        result[key] = info;
        continue;
      }
      if (info.status && !existing.status) {
        result[key] = info;
      } else if (info.status) {
        result[key] = info;
      }
    }
  }
  return result;
}

/** Mantém listas de hosts por refId quando o refresh ainda não trouxe aquela query. */
export function mergeQueryHostsByRefId(
  live: Record<string, string[]>,
  previous: Record<string, string[]>
): Record<string, string[]> {
  if (Object.keys(live).length === 0) {
    return previous;
  }
  if (Object.keys(previous).length === 0) {
    return live;
  }
  const merged: Record<string, string[]> = { ...previous };
  for (const [refId, hosts] of Object.entries(live)) {
    if (hosts.length > 0) {
      merged[refId] = hosts;
    }
  }
  return merged;
}

/** Host -> status por refId da query Grafana (A, B, C…). */
export function extractHostDisplayByRefId(
  data: PanelData,
  statusOptions: StatusColorOptions
): Record<string, HostDisplayMap> {
  const result: Record<string, HostDisplayMap> = {};
  if (!data?.series?.length) {
    return result;
  }

  const fallbackRefId = soleTargetRefId(data);
  for (const frame of data.series) {
    const refId = frameQueryRefId(frame, fallbackRefId);
    if (!refId) {
      continue;
    }
    const bucket = result[refId] ?? (result[refId] = {});
    collectHostDisplayFromFrame(frame, bucket, statusOptions);
  }

  return result;
}

/**
 * Hosts por refId a partir dos labels da Query (não exige último valor numérico).
 * Usado na contagem de hosts do submapa / host group.
 */
export function extractQueryHostsByRefId(data?: PanelData): Record<string, string[]> {
  const sets: Record<string, Set<string>> = {};
  if (!data?.series?.length) {
    return {};
  }

  const fallbackRefId = soleTargetRefId(data);
  for (const frame of data.series) {
    const refId = frameQueryRefId(frame, fallbackRefId);
    if (!refId) {
      continue;
    }
    const bucket = sets[refId] ?? (sets[refId] = new Set());
    for (const field of frame.fields ?? []) {
      const host = hostLabelFromField(field);
      if (host) {
        bucket.add(host);
      }
    }
  }

  const result: Record<string, string[]> = {};
  for (const [refId, hosts] of Object.entries(sets)) {
    result[refId] = [...hosts];
  }
  return result;
}

/** RefIds de query reservados a submapas (não desenham hosts no mapa pai). */
export function collectSubmapQueryRefIds(map: TopologyMap): Set<string> {
  const refs = new Set<string>();
  for (const node of map.nodes ?? []) {
    if (node.type !== 'submap') {
      continue;
    }
    const refId = node.queryRefId?.trim();
    if (refId) {
      refs.add(refId.toUpperCase());
    }
  }
  return refs;
}

/** RefIds das queries que importam hosts ao mapa (opt-in). */
export function resolveDisplayQueryRefIds(
  options: Pick<TopologyPanelOptions, 'displayQueryRefIds'>
): string[] {
  if (!options.displayQueryRefIds?.length) {
    return [];
  }
  return options.displayQueryRefIds.map((r) => r.trim().toUpperCase()).filter(Boolean);
}

/** Hosts das queries marcadas para exibição (opt-in; submapas nunca importam). */
export function extractDisplayQueryHosts(
  data: PanelData | undefined,
  submapQueryRefIds: Set<string>,
  displayQueryRefIds: string[] = []
): string[] {
  if (!data?.series?.length || !displayQueryRefIds.length) {
    return [];
  }
  const byRef = extractHostDisplayByRefId(data, {
    colorOnline: '',
    colorOffline: '',
    colorAlert: '',
    statusValueMappings: [],
  });
  const allowed = new Set(displayQueryRefIds.map((r) => r.trim().toUpperCase()).filter(Boolean));
  const hosts = new Set<string>();
  for (const refId of allowed) {
    if (submapQueryRefIds.has(refId)) {
      continue;
    }
    const display = byRef[refId];
    if (!display) {
      continue;
    }
    for (const host of Object.keys(display)) {
      hosts.add(host);
    }
  }
  const metadata = extractHostMetadataFromData(data);
  return canonicalizeHostKeys([...hosts], metadata).sort((a, b) => a.localeCompare(b));
}

/** Busca cor/texto mapeados por IP ou nome (mesmos aliases do status). */
export function lookupHostDisplay(
  displayMap: HostDisplayMap | undefined,
  ref: HostLookupRef,
  metadata?: HostMetadataMap
): HostDisplayInfo | undefined {
  if (!displayMap) {
    return undefined;
  }
  if (!ref.zabbixHost?.trim() && !ref.zabbixHostId?.trim()) {
    return undefined;
  }
  for (const name of collectHostLookupCandidates(ref, metadata)) {
    const info = displayMap[name];
    if (info) {
      return info;
    }
  }
  for (const name of collectHostLookupCandidates(ref, metadata)) {
    const lower = name.toLowerCase();
    for (const [key, info] of Object.entries(displayMap)) {
      if (key.toLowerCase() === lower) {
        return info;
      }
    }
  }
  return undefined;
}

/** Hosts da Query Zabbix crua (labels.host de cada série). */
export function extractQueryHosts(data: PanelData | DataFrame[] | undefined): string[] {
  const hosts = new Set<string>();
  if (!data) {
    return [];
  }

  const panelData = Array.isArray(data) ? panelDataFromFrames(data) : data;
  for (const host of Object.keys(
    extractHostDisplay(panelData, {
      colorOnline: '',
      colorOffline: '',
      colorAlert: '',
      statusValueMappings: [],
    })
  )) {
    hosts.add(host);
  }
  for (const frame of panelData.series ?? []) {
    for (const field of frame.fields ?? []) {
      const host = hostLabelFromField(field);
      if (host) {
        hosts.add(host);
      }
    }
  }

  return [...hosts].sort((a, b) => a.localeCompare(b));
}

export interface QueryHostOption {
  visibleName: string;
  technicalName: string;
  ip?: string;
}

export interface QueryHostNodeRef {
  zabbixHost?: string;
  subtitle?: string;
  label?: string;
}

function queryHostIpCandidates(node: QueryHostNodeRef): string[] {
  const out: string[] = [];
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed || !isIpv4(trimmed) || out.includes(trimmed)) {
      return;
    }
    out.push(trimmed);
  };
  add(node.subtitle);
  add(node.zabbixHost);
  return out;
}

const IP_LABEL_KEYS = ['host_ip', 'ip', '__zbx_host_ip', 'hostip', 'interface_ip'];

function pickIpFromLabels(labels: Record<string, string | undefined>): string | undefined {
  for (const key of IP_LABEL_KEYS) {
    const v = labels[key]?.trim();
    if (v && isIpv4(v)) {
      return v;
    }
  }
  const technical = labels.__zbx_host?.trim();
  if (technical && isIpv4(technical)) {
    return technical;
  }
  return undefined;
}

/** IP de um host da Query (labels, chave IPv4 ou índice por nome no metadata). */
function resolveQueryHostOptionIp(
  hostKey: string,
  meta: HostMetadata | undefined,
  metadata: HostMetadataMap
): string | undefined {
  const fromMeta = meta?.ip?.trim();
  if (fromMeta && isIpv4(fromMeta)) {
    return fromMeta;
  }
  if (isIpv4(hostKey)) {
    return hostKey;
  }
  for (const [key, entry] of Object.entries(metadata)) {
    if (!isIpv4(key)) {
      continue;
    }
    const entryName = entry.name?.trim();
    if (entryName === hostKey || entryName === meta?.name?.trim()) {
      return key;
    }
  }
  return undefined;
}

export function formatQueryHostOptionLabel(host: QueryHostOption): string {
  if (host.ip && isIpv4(host.ip)) {
    return `${host.visibleName} (${host.ip})`;
  }
  return host.visibleName;
}

/** Preenche IP ausente na Query com subtitle/zabbixHost dos nós já salvos no mapa. */
export function enrichQueryHostOptionsFromMap(
  options: QueryHostOption[],
  map: TopologyMap
): QueryHostOption[] {
  if (!options.length) {
    return options;
  }

  return options.map((opt) => {
    if (opt.ip && isIpv4(opt.ip)) {
      return opt;
    }

    for (const node of map.nodes) {
      if (!isHostNode(node)) {
        continue;
      }
      const nodeIp = resolveHostIp(node);
      if (!nodeIp) {
        continue;
      }
      const linked = node.zabbixHost?.trim();
      const label = node.label?.trim();
      const nameMatch =
        linked === opt.visibleName ||
        linked === opt.technicalName ||
        label === opt.visibleName ||
        label === opt.technicalName;
      const ipKeyMatch = linked === nodeIp && (opt.visibleName === label || isIpv4(opt.technicalName));
      if (nameMatch || ipKeyMatch) {
        return { ...opt, ip: nodeIp };
      }
    }

    return opt;
  });
}

/** Hosts visíveis + IP a partir das séries da Query do painel. */
export function extractQueryHostOptions(data: PanelData | DataFrame[] | undefined): QueryHostOption[] {
  const metadata = extractHostMetadataFromData(data);
  const hostKeys = extractQueryHosts(data);
  const options: QueryHostOption[] = [];
  const seen = new Set<string>();

  for (const hostKey of hostKeys) {
    const meta = metadata[hostKey];
    const visibleName = meta?.name?.trim() || hostKey;
    const ip = resolveQueryHostOptionIp(hostKey, meta, metadata);
    const technicalName = isIpv4(hostKey) ? visibleName : hostKey;
    const dedupeKey = (ip && isIpv4(ip) ? ip : visibleName).toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    options.push({
      visibleName,
      technicalName,
      ip,
    });
  }

  return options.sort((a, b) => a.visibleName.localeCompare(b.visibleName));
}

/** Encontra o host da Query que corresponde ao nó do mapa (IP, depois nome). */
export function resolveQueryHostOptionForNode(
  list: QueryHostOption[],
  node: QueryHostNodeRef
): QueryHostOption | undefined {
  for (const ip of queryHostIpCandidates(node)) {
    const byIp = list.find((host) => host.ip === ip);
    if (byIp) {
      return byIp;
    }
  }

  const name = node.zabbixHost?.trim();
  const label = node.label?.trim();
  for (const candidate of [name, label]) {
    if (!candidate || isIpv4(candidate)) {
      continue;
    }
    const lower = candidate.toLowerCase();
    const byName = list.find(
      (host) =>
        host.visibleName.toLowerCase() === lower || host.technicalName.toLowerCase() === lower
    );
    if (byName) {
      return byName;
    }
  }

  return undefined;
}

/** IPs/nomes já usados por hosts do mapa (para excluir da lista de hosts disponíveis). */
export function hostsAlreadyOnMap(
  map: TopologyMap,
  exceptIp?: string,
  exceptName?: string
): { ips: Set<string>; names: Set<string> } {
  const ips = new Set<string>();
  const names = new Set<string>();
  const skipIp = exceptIp?.trim();
  const skipName = exceptName?.trim();
  for (const entry of map.nodes) {
    if (!isHostNode(entry)) {
      continue;
    }
    const ip = resolveHostIp(entry);
    if (ip && ip !== skipIp) {
      ips.add(ip);
    }
    const z = entry.zabbixHost?.trim();
    if (z && !isIpv4(z) && z !== skipName) {
      names.add(z);
    }
    const label = entry.label?.trim();
    if (label && label !== skipName && label !== z) {
      names.add(label);
    }
  }
  return { ips, names };
}

export function queryHostPickerOptions(
  list: QueryHostOption[],
  onMap: { ips: Set<string>; names: Set<string> },
  boundHost?: QueryHostOption
): Array<{ label: string; value: string }> {
  return list
    .filter((host) => {
      if (boundHost?.ip && host.ip === boundHost.ip) {
        return true;
      }
      if (host.ip && onMap.ips.has(host.ip)) {
        return false;
      }
      return !onMap.names.has(host.visibleName);
    })
    .map((host) => ({
      label: formatQueryHostOptionLabel(host),
      value: host.ip ?? host.visibleName,
    }));
}

/** Nome/IP só dos labels da Query Zabbix (sem colunas de transform). */
export function extractHostMetadataFromData(data: PanelData | DataFrame[] | undefined): HostMetadataMap {
  const result: HostMetadataMap = {};
  if (!data) {
    return result;
  }

  const panelData = Array.isArray(data) ? panelDataFromFrames(data) : data;
  for (const frame of panelData.series ?? []) {
    for (const field of frame.fields ?? []) {
      const labels = (field.labels ?? {}) as Record<string, string | undefined>;
      const host = hostLabelFromField(field);
      if (!host) {
        continue;
      }
      const visible = (labels.__zbx_host_visible_name || labels.host || host).trim();
      const ip = pickIpFromLabels(labels) ?? result[host]?.ip;
      const entry = {
        name: visible,
        ip,
        hostid: labels.hostid?.trim() || labels.__zbx_hostid?.trim() || result[host]?.hostid,
      };
      result[host] = entry;
      if (ip && isIpv4(ip)) {
        result[ip] = entry;
      }
      const hostid = entry.hostid?.trim();
      if (hostid) {
        result[hostid] = entry;
      }
    }
  }

  return result;
}

function findSavedHostNodes(
  map: TopologyMap,
  hostName: string,
  hostIp?: string
): TopologyNode[] {
  const key = hostName.trim();
  const ip = hostIp?.trim();
  return map.nodes.filter((n) => {
    if (!isHostNode(n)) {
      return false;
    }
    const linked = n.zabbixHost?.trim();
    if (!linked) {
      return false;
    }
    if (ip && (n.subtitle?.trim() === ip || linked === ip)) {
      return true;
    }
    return linked === key || n.label?.trim() === key || n.id === key;
  });
}

/**
 * Monta o mapa de exibição: hosts da Query Zabbix + layout salvo.
 * Sem hosts na Query, mantém os hosts configurados no mapa.
 */
export function mergeMapWithQueryHosts(
  map: TopologyMap,
  queryHosts: string[],
  hostMetadata: HostMetadataMap = {}
): TopologyMap {
  const submaps = map.nodes.filter((n) => n.type === 'submap');
  const dashboardPickers = map.nodes.filter((n) => n.type === 'dashboard_picker');
  const savedHosts = map.nodes.filter((n) => isHostNode(n));

  const hostNames =
    queryHosts.length > 0
      ? queryHosts
      : savedHosts.map((n) => n.zabbixHost?.trim()).filter((key): key is string => Boolean(key));

  const hidden = new Set((map.hiddenHosts ?? []).map((h) => h.trim()).filter(Boolean));
  const visibleHostNames = hostNames.filter((h) => !isQueryHostHidden(h, hostMetadata[h], hidden));

  const hostNodes: TopologyNode[] = [];
  const usedSavedIds = new Set<string>();
  const usedHostKeys = new Set<string>();

  visibleHostNames.forEach((hostName, index) => {
    const meta = hostMetadata[hostName];
    const ip = meta?.ip?.trim();
    const hostKey = ip && isIpv4(ip) ? ip : hostName;
    if (usedHostKeys.has(hostKey.toLowerCase())) {
      return;
    }
    usedHostKeys.add(hostKey.toLowerCase());
    const savedMatches = findSavedHostNodes(map, hostName, ip).filter(
      (n) => !usedSavedIds.has(n.id)
    );
    const label = meta?.name ?? hostName;

    if (savedMatches.length > 0) {
      for (const saved of savedMatches) {
        usedSavedIds.add(saved.id);
        hostNodes.push({
          ...saved,
          type: 'host',
          zabbixHost: hostKey,
          label: saved.label ?? label,
          subtitle: (ip && isIpv4(ip) ? ip : undefined) ??
            (isIpv4(saved.subtitle?.trim() ?? '') ? saved.subtitle : undefined),
          icon: saved.icon ?? map.hostIcons?.[hostKey] ?? map.hostIcons?.[hostName],
          zabbixHostId: undefined,
        });
      }
      return;
    }

    const cols = 5;
    hostNodes.push({
      id: hostToNodeId(hostKey),
      label,
      subtitle: ip && isIpv4(ip) ? ip : undefined,
      zabbixHost: hostKey,
      type: 'host',
      icon: map.hostIcons?.[hostKey] ?? map.hostIcons?.[hostName],
      x: 100 + (index % cols) * 160,
      y: 100 + Math.floor(index / cols) * 80,
    });
  });

  const manualHosts = savedHosts.filter((n) => !n.zabbixHost?.trim() && !usedSavedIds.has(n.id));
  const staticNodes = map.nodes.filter((n) => n.type === 'static');
  const networkNodes = map.nodes.filter((n) => n.type === 'network');

  return {
    ...map,
    nodes: [...networkNodes, ...hostNodes, ...manualHosts, ...submaps, ...staticNodes, ...dashboardPickers],
  };
}

export function upsertHostLayout(map: TopologyMap, zabbixHost: string, patch: Partial<TopologyNode>): TopologyMap {
  const key = zabbixHost.trim();
  const layoutPatch: Partial<TopologyNode> = {};
  if (patch.x !== undefined) {
    layoutPatch.x = patch.x;
  }
  if (patch.y !== undefined) {
    layoutPatch.y = patch.y;
  }
  if (patch.id !== undefined) {
    layoutPatch.id = patch.id;
  }
  if (patch.width !== undefined) {
    layoutPatch.width = patch.width;
  }
  if (patch.height !== undefined) {
    layoutPatch.height = patch.height;
  }
  if (patch.icon !== undefined) {
    layoutPatch.icon = patch.icon;
  }
  if (patch.label !== undefined) {
    layoutPatch.label = patch.label;
  }
  if (patch.subtitle !== undefined) {
    layoutPatch.subtitle = patch.subtitle;
  }
  if ('toolUsername' in patch) {
    layoutPatch.toolUsername = patch.toolUsername?.trim() || undefined;
  }
  if ('toolPassword' in patch) {
    layoutPatch.toolPassword =
      patch.toolPassword != null && patch.toolPassword !== '' ? patch.toolPassword : undefined;
  }
  if ('networkId' in patch) {
    layoutPatch.networkId = patch.networkId?.trim() || undefined;
  }

  const nodes = [...map.nodes];
  let idx = -1;
  if (isIpv4(key)) {
    idx = nodes.findIndex(
      (n) => isHostNode(n) && (n.subtitle?.trim() === key || n.zabbixHost?.trim() === key)
    );
  }
  if (idx < 0) {
    idx = nodes.findIndex((n) => isHostNode(n) && n.zabbixHost?.trim() === key);
  }

  if (idx >= 0) {
    const merged: TopologyNode = {
      ...nodes[idx],
      ...layoutPatch,
      zabbixHost: key,
      type: 'host',
      zabbixHostId: undefined,
    };
    if ('toolUsername' in patch && !merged.toolUsername) {
      delete merged.toolUsername;
    }
    if ('toolPassword' in patch && !merged.toolPassword) {
      delete merged.toolPassword;
    }
    if ('networkId' in patch && !merged.networkId) {
      delete merged.networkId;
    }
    nodes[idx] = merged;
  } else {
    nodes.push({
      id: hostToNodeId(key),
      zabbixHost: key,
      type: 'host',
      x: 100,
      y: 100,
      ...layoutPatch,
    });
  }

  let hostIcons = map.hostIcons;
  if (patch.icon !== undefined) {
    hostIcons = { ...(map.hostIcons ?? {}), [key]: patch.icon };
  }

  return { ...map, nodes, hostIcons };
}

/** Overlay do nome/IP atuais do Zabbix (sem alterar o mapa persistido). */
export function withLiveZabbixMeta(node: TopologyNode, metadata?: HostMetadataMap): TopologyNode {
  if (!isHostNode(node) || !metadata) {
    return node;
  }
  const name = node.zabbixHost?.trim();
  const ip = resolveHostIp(node, metadata);
  const entry =
    (ip && metadata?.[ip]) ||
    (name ? metadata?.[name] : undefined);
  if (!entry?.name?.trim()) {
    return node;
  }
  const nextName = entry.name.trim();
  const nextIp = entry.ip?.trim();
  const nextHostKey = nextIp && isIpv4(nextIp) ? nextIp : name;
  if (
    nextName === (node.label?.trim() || name) &&
    (nextIp || '') === (node.subtitle?.trim() || '') &&
    nextHostKey === name
  ) {
    return node;
  }
  return {
    ...node,
    label: nextName,
    zabbixHost: nextHostKey || nextName,
    subtitle: nextIp || node.subtitle,
    zabbixHostId: undefined,
  };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Round coordinate to nearest grid line. */
export function snapToGrid(n: number, step: number): number {
  if (step <= 0) {
    return Math.round(n);
  }
  return Math.round(n / step) * step;
}

/** Snap node position so its center aligns to the grid (keeps vertical links straight). */
export function snapNodeCenterToGrid(
  x: number,
  y: number,
  w: number,
  h: number,
  step: number
): { x: number; y: number } {
  if (step <= 0) {
    return { x: Math.round(x), y: Math.round(y) };
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  return {
    x: snapToGrid(cx, step) - w / 2,
    y: snapToGrid(cy, step) - h / 2,
  };
}

const RADIO_HOST_PATTERN = /LITEAP|WI2BE|LITE.?AP|PTMP|PTP|AIRFIBER|NANOBEAM|RADIO/i;

function nodeRadioHints(node?: TopologyNode): string {
  return [node?.zabbixHost?.trim(), node?.label?.trim()].filter(Boolean).join(' ');
}

/** Infer link medium from endpoint host names (LiteAP, Wi2BE, etc.). */
export function inferLinkMedium(from?: TopologyNode, to?: TopologyNode): TopologyLinkMedium {
  if (RADIO_HOST_PATTERN.test(nodeRadioHints(from)) || RADIO_HOST_PATTERN.test(nodeRadioHints(to))) {
    return 'radio';
  }
  return 'fiber';
}

export function resolveLinkMedium(link: TopologyLink): TopologyLinkMedium {
  return link.medium === 'radio' ? 'radio' : 'fiber';
}

/** Ancestors with overflow auto/scroll (Grafana dashboard/panel scroll containers). */
export function findScrollParents(el: HTMLElement | null): HTMLElement[] {
  const result: HTMLElement[] = [];
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY, overflow } = getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowY) || /(auto|scroll)/.test(overflow)) {
      result.push(node);
    }
    node = node.parentElement;
  }
  return result;
}

export function eventTargetsElement(e: Event, target: HTMLElement): boolean {
  return e.composedPath().includes(target);
}

let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * Cache de `measureTextWidth` por texto+fontSize — `nodeLayouts` (TopologyCanvas.tsx) recalcula
 * o layout de todos os nós em todo render (inclui drag/resize preview nas deps), então sem cache
 * o mesmo label/subtítulo é medido no canvas repetidamente a cada frame de arraste. Rótulos de
 * host/rede são um conjunto pequeno e estável por mapa, então um cap simples evita crescimento
 * ilimitado sem precisar de uma LRU real.
 */
const MEASURE_TEXT_CACHE_MAX = 4000;
const measureTextCache = new Map<string, number>();

export function measureTextWidth(text: string, fontSize: number): number {
  if (!text) {
    return 0;
  }
  const cacheKey = `${fontSize}\u0000${text}`;
  const cached = measureTextCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const width = measureTextWidthUncached(text, fontSize);
  if (measureTextCache.size >= MEASURE_TEXT_CACHE_MAX) {
    const oldestKey = measureTextCache.keys().next().value;
    if (oldestKey !== undefined) {
      measureTextCache.delete(oldestKey);
    }
  }
  measureTextCache.set(cacheKey, width);
  return width;
}

function measureTextWidthUncached(text: string, fontSize: number): number {
  if (typeof document === 'undefined') {
    return text.length * fontSize * 0.55;
  }
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d');
  }
  if (!measureCtx) {
    return text.length * fontSize * 0.55;
  }
  measureCtx.font = `${fontSize}px Inter, Helvetica, Arial, sans-serif`;
  return measureCtx.measureText(text).width;
}

export interface NodeLayout {
  w: number;
  h: number;
  label: string;
  sub?: string;
  labelFontSize: number;
  subFontSize: number;
  labelY: number;
  subY?: number;
  /** Centro Y do ícone (relativo ao topo do nó) */
  iconCenterY?: number;
}

export function computeNodeLayout(
  node: {
    id: string;
    label?: string;
    subtitle?: string;
    width?: number;
    height?: number;
    type?: string;
    icon?: TopologyHostIcon;
  },
  options: Pick<TopologyPanelOptions, 'nodeFontSize' | 'showSubtitle'>
): NodeLayout {
  const fontSize = options.nodeFontSize;
  const subFontSize = Math.max(9, fontSize - 2);

  if (node.type === 'submap' || node.type === 'dashboard_picker') {
    const pad = 8;
    const lineGap = 4;
    const label = (node.label ?? '').trim();
    const sub = node.subtitle?.trim();
    const hasTwoLines = Boolean(sub);
    const contentW = Math.max(measureTextWidth(label, fontSize), sub ? measureTextWidth(sub, subFontSize) : 0);
    const autoMinW = Math.max(Math.ceil(contentW + pad * 2), 80);
    const w = node.width != null ? Math.max(node.width, autoMinW) : autoMinW;
    const autoMinH = hasTwoLines
      ? pad * 2 + fontSize + lineGap + subFontSize
      : pad * 2 + fontSize;
    const floorH = Math.max(autoMinH, hasTwoLines ? 44 : 28);
    const h = node.height != null ? Math.max(node.height, floorH) : floorH;

    if (hasTwoLines) {
      return {
        w,
        h,
        label,
        sub,
        labelFontSize: fontSize,
        subFontSize,
        labelY: pad + fontSize / 2,
        subY: h - pad - subFontSize / 2,
      };
    }

    return {
      w,
      h,
      label,
      labelFontSize: fontSize,
      subFontSize,
      labelY: h / 2,
    };
  }

  const padX = 10;
  const padY = 6;
  const lineGap = 3;
  const label = (node.label ?? '').trim();
  const sub = options.showSubtitle && node.subtitle ? node.subtitle.trim() : undefined;
  const showIcon =
    node.type !== 'submap' &&
    node.type !== 'static' &&
    node.type !== 'network' &&
    node.type !== 'dashboard_picker' &&
    Boolean(node.icon);
  const iconDims = showIcon && node.icon ? hostIconRenderDimensions(node.icon) : { w: HOST_ICON_SIZE, h: HOST_ICON_SIZE };
  const iconSize = iconDims.h;
  const iconRowHeight = showIcon ? iconSize + HOST_ICON_GAP : 0;

  const contentW = Math.max(measureTextWidth(label, fontSize), sub ? measureTextWidth(sub, subFontSize) : 0);
  const w = Math.max(Math.ceil(contentW + padX * 2), showIcon ? iconDims.w + padX * 2 : 48);
  const textBlockH = sub ? fontSize + lineGap + subFontSize : fontSize;
  const h = Math.max(Math.ceil(padY * 2 + iconRowHeight + textBlockH), showIcon ? iconSize + 32 : 24);

  const iconCenterY = showIcon ? padY + iconSize / 2 : undefined;
  const labelY = showIcon
    ? padY + iconRowHeight + fontSize / 2
    : sub
      ? padY + fontSize / 2
      : h / 2;
  const subY = sub ? padY + iconRowHeight + fontSize + lineGap + subFontSize / 2 : undefined;

  return { w, h, label, sub, labelFontSize: fontSize, subFontSize, labelY, subY, iconCenterY };
}

export const DEFAULT_STATIC_WIDTH = 120;
export const DEFAULT_STATIC_HEIGHT = 36;

export function computeStaticLayout(
  node: {
    id: string;
    label?: string;
    subtitle?: string;
    width?: number;
    height?: number;
    fontSize?: number;
  },
  options: Pick<TopologyPanelOptions, 'nodeFontSize' | 'showSubtitle'>
): NodeLayout {
  const labelFontSize = node.fontSize ?? options.nodeFontSize;
  const subFontSize = Math.max(9, labelFontSize - 2);
  const padX = 10;
  const padY = 6;
  const lineGap = 3;
  const label = (node.label ?? '').trim();
  const sub = options.showSubtitle && node.subtitle ? node.subtitle.trim() : undefined;

  const contentW = Math.max(measureTextWidth(label, labelFontSize), sub ? measureTextWidth(sub, subFontSize) : 0);
  const autoW = Math.max(Math.ceil(contentW + padX * 2), 48);
  const autoH = sub
    ? Math.max(Math.ceil(padY * 2 + labelFontSize + lineGap + subFontSize), 28)
    : Math.max(Math.ceil(padY * 2 + labelFontSize), 24);

  const w = node.width ?? autoW;
  const h = node.height ?? autoH;
  const labelY = sub ? padY + labelFontSize / 2 : h / 2;
  const subY = sub ? h - padY - subFontSize / 2 : undefined;

  return { w, h, label, sub, labelFontSize, subFontSize, labelY, subY };
}

export const DEFAULT_NETWORK_WIDTH = 220;
export const DEFAULT_NETWORK_HEIGHT = 140;

export function computeNetworkLayout(
  node: { id: string; label?: string; width?: number; height?: number },
  options: Pick<TopologyPanelOptions, 'nodeFontSize'>
): NodeLayout {
  const fontSize = options.nodeFontSize;
  const pad = 8;
  const w = node.width ?? DEFAULT_NETWORK_WIDTH;
  const h = node.height ?? DEFAULT_NETWORK_HEIGHT;
  const label = (node.label ?? '').trim();
  return {
    w,
    h,
    label,
    subFontSize: fontSize,
    labelFontSize: fontSize,
    labelY: pad + fontSize / 2,
  };
}
