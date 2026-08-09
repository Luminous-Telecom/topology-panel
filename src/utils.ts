import { DataFrame, FieldType, LoadingState, PanelData } from '@grafana/data';
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
  TopologyStatusMetric,
} from './types';
import { HOST_ICON_GAP, HOST_ICON_SIZE, hostIconRenderDimensions, hostIconRenderSize } from './utils/hostIcons';

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

/** Busca valor de status por hostid, nome visível/técnico (case-insensitive + aliases do metadata). */
export function lookupHostStatus(
  statusMap: HostStatusMap,
  host: string,
  metadata?: HostMetadataMap,
  hostId?: string
): number | null | undefined {
  const id = hostId?.trim();
  if (id) {
    const byId = statusMap[id];
    if (byId !== null && byId !== undefined) {
      return byId;
    }
  }

  const key = host.trim();
  if (!key && !id) {
    return undefined;
  }

  const candidates = new Set<string>();
  if (key) {
    candidates.add(key);
  }
  if (id) {
    candidates.add(id);
    const byHostId = metadata?.[id];
    if (byHostId?.name?.trim()) {
      candidates.add(byHostId.name.trim());
    }
  }
  const meta = key ? metadata?.[key] : undefined;
  if (meta?.name?.trim()) {
    candidates.add(meta.name.trim());
  }
  if (meta?.hostid?.trim()) {
    candidates.add(meta.hostid.trim());
  }
  for (const [metaKey, entry] of Object.entries(metadata ?? {})) {
    const mk = metaKey.trim();
    const mn = entry.name?.trim();
    const mid = entry.hostid?.trim();
    if (mk === key || mn === key || (id && (mk === id || mid === id))) {
      candidates.add(mk);
      if (mn) {
        candidates.add(mn);
      }
      if (mid) {
        candidates.add(mid);
      }
    }
  }

  for (const name of candidates) {
    const v = statusMap[name];
    if (v !== null && v !== undefined) {
      return v;
    }
  }

  if (key) {
    const lower = key.toLowerCase();
    for (const [name, v] of Object.entries(statusMap)) {
      if (v !== null && v !== undefined && name.toLowerCase() === lower) {
        return v;
      }
    }
  }

  return undefined;
}

export function lookupProblemCount(
  problemMap: HostProblemMap,
  host: string,
  hostId?: string
): number {
  const id = hostId?.trim();
  if (id && (problemMap[id] ?? 0) > 0) {
    return problemMap[id];
  }
  const key = host.trim();
  if (!key) {
    return 0;
  }
  if ((problemMap[key] ?? 0) > 0) {
    return problemMap[key];
  }
  const lower = key.toLowerCase();
  for (const [name, count] of Object.entries(problemMap)) {
    if (count > 0 && name.toLowerCase() === lower) {
      return count;
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

function panelDataFromFrames(frames: DataFrame[]): PanelData {
  return {
    series: frames,
    state: LoadingState.Done,
    timeRange: { from: 0 as any, to: 0 as any, raw: { from: 'now-5m', to: 'now' } },
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
export function extractHostDisplay(data: PanelData): HostDisplayMap {
  const result: HostDisplayMap = {};
  if (!data?.series?.length) {
    return result;
  }

  for (const frame of data.series) {
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
      result[host] = {
        value: last,
        color: displayed?.color,
        text: displayed?.text,
      };
    }
  }

  return result;
}

/** Host -> último valor numérico da Query (atalho sobre extractHostDisplay). */
export function extractHostStatus(data: PanelData): HostStatusMap {
  const result: HostStatusMap = {};
  for (const [host, info] of Object.entries(extractHostDisplay(data))) {
    result[host] = info.value;
  }
  return result;
}

/** Busca cor/texto mapeados por hostid ou nome (mesmos aliases do status). */
export function lookupHostDisplay(
  displayMap: HostDisplayMap | undefined,
  host: string,
  metadata?: HostMetadataMap,
  hostId?: string
): HostDisplayInfo | undefined {
  if (!displayMap) {
    return undefined;
  }
  const id = hostId?.trim();
  if (id && displayMap[id]) {
    return displayMap[id];
  }
  const key = host.trim();
  if (key && displayMap[key]) {
    return displayMap[key];
  }
  const candidates = new Set<string>();
  if (key) {
    candidates.add(key);
  }
  if (id) {
    candidates.add(id);
    const byId = metadata?.[id];
    if (byId?.name?.trim()) {
      candidates.add(byId.name.trim());
    }
  }
  const meta = key ? metadata?.[key] : undefined;
  if (meta?.name?.trim()) {
    candidates.add(meta.name.trim());
  }
  for (const name of candidates) {
    if (displayMap[name]) {
      return displayMap[name];
    }
  }
  if (key) {
    const lower = key.toLowerCase();
    for (const [name, info] of Object.entries(displayMap)) {
      if (name.toLowerCase() === lower) {
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
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

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
      result[host] = {
        name: visible,
        ip: pickIpFromLabels(labels) ?? result[host]?.ip,
        hostid: labels.hostid?.trim() || labels.__zbx_hostid?.trim() || result[host]?.hostid,
      };
    }
  }

  return result;
}

function findSavedHostNodes(map: TopologyMap, hostName: string, hostId?: string): TopologyNode[] {
  const key = hostName.trim();
  const id = hostId?.trim();
  return map.nodes.filter((n) => {
    if ((n.type ?? 'host') !== 'host') {
      return false;
    }
    if (id && n.zabbixHostId?.trim() === id) {
      return true;
    }
    return n.zabbixHost?.trim() === key || n.label?.trim() === key || n.id === key;
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
  const visibleHostNames = hostNames.filter((h) => !hidden.has(h));

  const hostNodes: TopologyNode[] = [];
  const usedSavedIds = new Set<string>();

  visibleHostNames.forEach((hostName, index) => {
    const meta = hostMetadata[hostName];
    const savedMatches = findSavedHostNodes(map, hostName, meta?.hostid).filter(
      (n) => !usedSavedIds.has(n.id)
    );
    const label = meta?.name ?? hostName;

    if (savedMatches.length > 0) {
      for (const saved of savedMatches) {
        usedSavedIds.add(saved.id);
        hostNodes.push({
          ...saved,
          type: 'host',
          zabbixHost: hostName,
          zabbixHostId: meta?.hostid?.trim() || saved.zabbixHostId,
          label: saved.label ?? label,
          subtitle: meta?.ip ?? saved.subtitle,
          icon: saved.icon ?? map.hostIcons?.[hostName],
        });
      }
      return;
    }

    const cols = 5;
    hostNodes.push({
      id: hostToNodeId(hostName),
      label,
      subtitle: meta?.ip,
      zabbixHost: hostName,
      zabbixHostId: meta?.hostid?.trim() || undefined,
      type: 'host',
      icon: map.hostIcons?.[hostName],
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
  const hostId = patch.zabbixHostId?.trim();
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
  if (patch.zabbixHostId !== undefined) {
    layoutPatch.zabbixHostId = patch.zabbixHostId?.trim() || undefined;
  }
  if ('toolUsername' in patch) {
    layoutPatch.toolUsername = patch.toolUsername?.trim() || undefined;
  }
  if ('toolPassword' in patch) {
    layoutPatch.toolPassword =
      patch.toolPassword != null && patch.toolPassword !== '' ? patch.toolPassword : undefined;
  }

  const nodes = [...map.nodes];
  let idx = -1;
  if (hostId) {
    idx = nodes.findIndex((n) => (n.type ?? 'host') === 'host' && n.zabbixHostId?.trim() === hostId);
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
      zabbixHostId: hostId || nodes[idx].zabbixHostId,
    };
    if ('toolUsername' in patch && !merged.toolUsername) {
      delete merged.toolUsername;
    }
    if ('toolPassword' in patch && !merged.toolPassword) {
      delete merged.toolPassword;
    }
    nodes[idx] = merged;
  } else {
    nodes.push({
      id: hostToNodeId(key),
      zabbixHost: key,
      zabbixHostId: hostId,
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
  node: { zabbixHost?: string; zabbixHostId?: string; type?: string },
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
  const hostId = node.zabbixHostId != null ? String(node.zabbixHostId).trim() : '';
  const key = node.zabbixHost?.trim();
  if (!key && !hostId) {
    return 'unknown';
  }
  const v = lookupHostStatus(statusMap, key ?? '', metadata, hostId || undefined);
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
  const hostId = node.zabbixHostId?.trim();
  const name = node.zabbixHost?.trim();
  const entry = (hostId && metadata[hostId]) || (name ? metadata[name] : undefined);
  if (!entry?.name?.trim()) {
    return node;
  }
  const nextName = entry.name.trim();
  const nextIp = entry.ip?.trim();
  const nextId = entry.hostid?.trim() || hostId;
  if (
    nextName === (node.label?.trim() || name) &&
    nextName === name &&
    (nextIp || '') === (node.subtitle?.trim() || '') &&
    nextId === hostId
  ) {
    return node;
  }
  return {
    ...node,
    label: nextName,
    zabbixHost: nextName,
    zabbixHostId: nextId || node.zabbixHostId,
    subtitle: nextIp || node.subtitle,
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
