import { DataFrame, FieldType, LoadingState, PanelData, getDefaultTimeRange } from '@grafana/data';
import {
  HostDisplayInfo,
  HostDisplayMap,
  HostMetadataMap,
  HostProblemMap,
  HostStatusMap,
  TopologyHostIcon,
  TopologyLink,
  TopologyLinkMedium,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
  TopologyQueryRefInfo,
  TopologyStatusMetric,
} from './types';
import { hostIp as hostIpFromNode } from './utils/hostTools';
import { HOST_ICON_GAP, HOST_ICON_SIZE, hostIconRenderDimensions, hostIconRenderSize } from './utils/hostIcons';

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isIpv4(value: string): boolean {
  return IPV4.test(value.trim());
}

/** IP do host (subtitle, zabbixHost ou metadata da Query/API). */
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

/** Referência de host para casar Query (nome) com mapa (nome/IP/subtitle). */
export interface HostLookupRef {
  zabbixHost?: string;
  subtitle?: string;
  zabbixHostId?: string;
  label?: string;
}

/** Chave primária de exibição — nome visível quando existir (Query usa labels.host). */
export function resolveHostLookupKey(
  node: HostLookupRef,
  metadata?: HostMetadataMap
): string | undefined {
  const name = node.zabbixHost?.trim();
  if (name && !isIpv4(name)) {
    return name;
  }
  const ip = resolveHostIp(node, metadata);
  if (ip) {
    return ip;
  }
  return name || undefined;
}

export function collectHostLookupCandidates(ref: HostLookupRef, metadata?: HostMetadataMap): string[] {
  const zabbixHost = ref.zabbixHost?.trim();
  const label = ref.label?.trim();
  const hostId = ref.zabbixHostId?.trim();
  const subtitleIp = hostIpFromNode(ref);
  const out: string[] = [];
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed || out.includes(trimmed)) {
      return;
    }
    out.push(trimmed);
  };

  // Nome visível primeiro — bate com labels.host da Query Zabbix.
  if (zabbixHost && !isIpv4(zabbixHost)) {
    add(zabbixHost);
  }
  if (label && label !== zabbixHost) {
    add(label);
  }

  const metaByHost = zabbixHost ? metadata?.[zabbixHost] : undefined;
  if (metaByHost?.name) {
    add(metaByHost.name);
  }
  if (metaByHost?.ip && isIpv4(metaByHost.ip)) {
    add(metaByHost.ip);
  }

  if (label) {
    const metaByLabel = metadata?.[label];
    if (metaByLabel?.name) {
      add(metaByLabel.name);
    }
    if (metaByLabel?.ip && isIpv4(metaByLabel.ip)) {
      add(metaByLabel.ip);
    }
  }

  if (zabbixHost && isIpv4(zabbixHost)) {
    add(zabbixHost);
  }
  if (subtitleIp) {
    add(subtitleIp);
    const metaByIp = metadata?.[subtitleIp];
    if (metaByIp?.name) {
      add(metaByIp.name);
    }
  }

  if (hostId) {
    const metaById = metadata?.[hostId];
    if (metaById && (!zabbixHost || metaById.name?.trim() === zabbixHost || metaById.hostid === hostId)) {
      if (metaById.name) {
        add(metaById.name);
      }
      if (metaById.ip && isIpv4(metaById.ip)) {
        add(metaById.ip);
      }
    }
  }

  if (zabbixHost && !isIpv4(zabbixHost)) {
    for (const entry of Object.values(metadata ?? {})) {
      if (entry.name?.trim() === zabbixHost && entry.ip && isIpv4(entry.ip)) {
        add(entry.ip);
      }
      if (subtitleIp && entry.ip === subtitleIp && entry.name?.trim() === zabbixHost) {
        add(entry.name);
        add(entry.ip);
      }
    }
  }

  return out;
}

/** Métrica pelo item_key cru da Query Zabbix (sem transform / sem opções). */
export function effectiveStatusMetric(
  _options?: Pick<TopologyPanelOptions, 'statusMetric'>,
  data?: PanelData
): TopologyStatusMetric {
  for (const frame of data?.series ?? []) {
    for (const field of frame.fields ?? []) {
      const key = String(field.labels?.item_key ?? field.labels?.key_ ?? '').trim().toLowerCase();
      if (key.includes('icmppingloss')) {
        return 'packet_loss';
      }
      if (key.includes('icmppingsec') || key === 'icmpping') {
        return 'icmp_rtt';
      }
    }
  }
  return 'icmp_rtt';
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

/** Limiar de perda (%) para marcar offline — só em modo perda de pacotes. */
export function offlineThresholdForMetric(metric: TopologyStatusMetric): number {
  return metric === 'packet_loss' ? 1 : 0;
}

export function resolveStatusFromValue(
  v: number,
  threshold: number,
  metric: TopologyStatusMetric
): 'online' | 'offline' {
  if (metric === 'packet_loss') {
    return v >= threshold ? 'offline' : 'online';
  }
  // icmppingsec: segundos; 0 = sem resposta ICMP
  return v <= 0 ? 'offline' : 'online';
}

/** Busca valor de status por nome/IP (aliases do mapa + metadata da Query). */
export function lookupHostStatus(
  statusMap: HostStatusMap,
  ref: HostLookupRef,
  metadata?: HostMetadataMap
): number | null | undefined {
  if (!ref.zabbixHost?.trim() && !ref.zabbixHostId?.trim()) {
    return undefined;
  }

  for (const name of collectHostLookupCandidates(ref, metadata)) {
    const v = statusMap[name];
    if (v !== null && v !== undefined) {
      return v;
    }
  }

  for (const name of collectHostLookupCandidates(ref, metadata)) {
    const lower = name.toLowerCase();
    for (const [key, v] of Object.entries(statusMap)) {
      if (v !== null && v !== undefined && key.toLowerCase() === lower) {
        return v;
      }
    }
  }

  return undefined;
}

export function lookupProblemCount(
  problemMap: HostProblemMap,
  ref: HostLookupRef,
  metadata?: HostMetadataMap
): number {
  if (!ref.zabbixHost?.trim() && !ref.zabbixHostId?.trim()) {
    return 0;
  }
  for (const name of collectHostLookupCandidates(ref, metadata)) {
    const count = problemMap[name] ?? 0;
    if (count > 0) {
      return count;
    }
  }
  for (const name of collectHostLookupCandidates(ref, metadata)) {
    const lower = name.toLowerCase();
    for (const [key, count] of Object.entries(problemMap)) {
      if (count > 0 && key.toLowerCase() === lower) {
        return count;
      }
    }
  }
  return 0;
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
 * Host -> último valor + cor/texto do mapeamento Grafana (Value mappings / Thresholds).
 * Query Zabbix crua (time_series); usa field.display quando o painel tem field config.
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

/** Nome do host group configurado na query Zabbix (aba Query). */
export function zabbixQueryGroupName(target: Record<string, unknown>): string | undefined {
  return zabbixQueryScopeName(target.group);
}

/** Host groups das queries Zabbix do painel (filtra por displayQueryRefIds quando definido). */
export function resolveZabbixGroupNamesFromPanelData(
  data: PanelData | undefined,
  displayQueryRefIds: string[] = []
): string[] {
  if (!data?.request?.targets?.length) {
    return [];
  }
  const preferred = new Set(displayQueryRefIds.map((refId) => refId.trim().toUpperCase()).filter(Boolean));
  const names = new Set<string>();
  for (const target of data.request.targets) {
    const rec = target as Record<string, unknown> & { refId?: string };
    const refId = rec.refId?.trim().toUpperCase();
    if (!refId) {
      continue;
    }
    if (preferred.size > 0 && !preferred.has(refId)) {
      continue;
    }
    const groupName = zabbixQueryGroupName(rec);
    if (groupName) {
      names.add(groupName);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
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

function frameQueryRefId(frame: DataFrame): string {
  return frame.refId?.trim() ?? '';
}

function collectHostDisplayFromFrame(
  frame: DataFrame,
  bucket: HostDisplayMap
): void {
  for (const field of frame.fields ?? []) {
    if (field.type !== FieldType.number) {
      continue;
    }
    const host = hostLabelFromField(field);
    if (!host) {
      continue;
    }
    const last = lastNumericValue(field);
    if (last === undefined) {
      continue;
    }
    const displayed = field.display?.(last);
    const entry: HostDisplayInfo = {
      value: last,
      color: displayed?.color,
      text: displayed?.text,
    };
    bucket[host] = entry;
    const labels = (field.labels ?? {}) as Record<string, string | undefined>;
    const ip = pickIpFromLabels(labels);
    if (ip) {
      bucket[ip] = entry;
    }
  }
}

export function extractHostDisplay(data: PanelData): HostDisplayMap {
  const result: HostDisplayMap = {};
  if (!data?.series?.length) {
    return result;
  }

  for (const frame of data.series) {
    collectHostDisplayFromFrame(frame, result);
  }

  return result;
}

/** Host -> status por refId da query Grafana (A, B, C…). */
export function extractHostDisplayByRefId(data: PanelData): Record<string, HostDisplayMap> {
  const result: Record<string, HostDisplayMap> = {};
  if (!data?.series?.length) {
    return result;
  }

  for (const frame of data.series) {
    const refId = frameQueryRefId(frame);
    const bucket = result[refId] ?? (result[refId] = {});
    collectHostDisplayFromFrame(frame, bucket);
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
  options: Pick<TopologyPanelOptions, 'displayQueryRefIds' | 'displayQueryRefId'>
): string[] {
  if (options.displayQueryRefIds?.length) {
    return options.displayQueryRefIds.map((r) => r.trim().toUpperCase()).filter(Boolean);
  }
  const legacy = options.displayQueryRefId?.trim();
  if (legacy) {
    return [legacy.toUpperCase()];
  }
  return [];
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
  const byRef = extractHostDisplayByRefId(data);
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
  return [...hosts].sort((a, b) => a.localeCompare(b));
}

/** Host -> último valor numérico da Query (atalho sobre extractHostDisplay). */
export function extractHostStatus(data: PanelData): HostStatusMap {
  const result: HostStatusMap = {};
  for (const [host, info] of Object.entries(extractHostDisplay(data))) {
    result[host] = info.value;
  }
  return result;
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
  for (const host of Object.keys(extractHostStatus(panelData))) {
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

const IP_LABEL_KEYS = ['host_ip', 'ip', '__zbx_host_ip', 'hostip', 'interface_ip'];

function pickIpFromLabels(labels: Record<string, string | undefined>): string | undefined {
  for (const key of IP_LABEL_KEYS) {
    const v = labels[key]?.trim();
    if (v && IPV4.test(v)) {
      return v;
    }
  }
  return undefined;
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
    if ((n.type ?? 'host') !== 'host') {
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
  const savedHosts = map.nodes.filter((n) => (n.type ?? 'host') === 'host');

  const hostNames =
    queryHosts.length > 0
      ? queryHosts
      : savedHosts.map((n) => n.zabbixHost?.trim() || n.label?.trim() || n.id).filter(Boolean);

  const hidden = new Set((map.hiddenHosts ?? []).map((h) => h.trim()).filter(Boolean));
  const visibleHostNames = hostNames.filter((h) => !isQueryHostHidden(h, hostMetadata[h], hidden));

  const hostNodes: TopologyNode[] = [];
  const usedSavedIds = new Set<string>();

  visibleHostNames.forEach((hostName, index) => {
    const meta = hostMetadata[hostName];
    const ip = meta?.ip?.trim();
    const hostKey = ip && isIpv4(ip) ? ip : hostName;
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
          subtitle: ip ?? (isIpv4(saved.subtitle?.trim() ?? '') ? saved.subtitle : undefined),
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
      subtitle: ip,
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
      (n) =>
        (n.type ?? 'host') === 'host' &&
        (n.subtitle?.trim() === key || n.zabbixHost?.trim() === key)
    );
  }
  if (idx < 0) {
    idx = nodes.findIndex((n) => (n.type ?? 'host') === 'host' && n.zabbixHost?.trim() === key);
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

export function resolveNodeStatus(
  node: HostLookupRef & { type?: string },
  statusMap: HostStatusMap,
  threshold: number,
  metric: TopologyStatusMetric = 'icmp_rtt',
  metadata?: HostMetadataMap
): 'online' | 'offline' | 'unknown' {
  if (
    node.type === 'submap' ||
    node.type === 'static' ||
    node.type === 'network' ||
    node.type === 'dashboard_picker'
  ) {
    return 'unknown';
  }
  if (!node.zabbixHost?.trim() && !node.zabbixHostId?.trim()) {
    return 'unknown';
  }
  if (!resolveHostLookupKey(node, metadata)) {
    return 'unknown';
  }
  const v = lookupHostStatus(statusMap, node, metadata);
  if (v === null || v === undefined) {
    return 'unknown';
  }
  return resolveStatusFromValue(v, threshold, metric);
}

/** Overlay do nome/IP atuais do Zabbix (sem alterar o mapa persistido). */
export function withLiveZabbixMeta(node: TopologyNode, metadata?: HostMetadataMap): TopologyNode {
  if ((node.type ?? 'host') !== 'host' || !metadata) {
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

export function measureTextWidth(text: string, fontSize: number): number {
  if (!text) {
    return 0;
  }
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
    const w = node.width ?? Math.max(Math.ceil(contentW + pad * 2), 80);
    const autoMinH = hasTwoLines
      ? pad * 2 + fontSize + lineGap + subFontSize
      : pad * 2 + fontSize;
    const h = node.height ?? Math.max(autoMinH, hasTwoLines ? 44 : 28);

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
