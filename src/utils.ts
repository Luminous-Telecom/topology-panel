import {
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

/** Métrica efetiva de status (ICMP via API Zabbix). */
export function effectiveStatusMetric(
  options: Pick<TopologyPanelOptions, 'statusMetric'>
): TopologyStatusMetric {
  return options.statusMetric === 'packet_loss' ? 'packet_loss' : 'icmp_rtt';
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

/** Busca valor de status por nome visível/técnico (case-insensitive + aliases do metadata). */
export function lookupHostStatus(
  statusMap: HostStatusMap,
  host: string,
  metadata?: HostMetadataMap
): number | null | undefined {
  const key = host.trim();
  if (!key) {
    return undefined;
  }

  const candidates = new Set<string>([key]);
  const meta = metadata?.[key];
  if (meta?.name?.trim()) {
    candidates.add(meta.name.trim());
  }
  for (const [metaKey, entry] of Object.entries(metadata ?? {})) {
    const mk = metaKey.trim();
    const mn = entry.name?.trim();
    if (mk === key || mn === key) {
      candidates.add(mk);
      if (mn) {
        candidates.add(mn);
      }
    }
  }

  for (const name of candidates) {
    const v = statusMap[name];
    if (v !== null && v !== undefined) {
      return v;
    }
  }

  const lower = key.toLowerCase();
  for (const [name, v] of Object.entries(statusMap)) {
    if (v !== null && v !== undefined && name.toLowerCase() === lower) {
      return v;
    }
  }

  return undefined;
}

export function lookupProblemCount(problemMap: HostProblemMap, host: string): number {
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

/** Combina ICMP com problemas ativos do Zabbix (cor do host no mapa). */
export function mergeStatusWithProblems(
  statusMap: HostStatusMap,
  problemMap: HostProblemMap,
  mapHostNames: string[],
  metric: TopologyStatusMetric = 'icmp_rtt'
): HostStatusMap {
  const merged: HostStatusMap = { ...statusMap };
  const threshold = offlineThresholdForMetric(metric);
  const offlineValue = metric === 'packet_loss' ? Math.max(threshold, 100) : 0;

  const markOffline = (host: string) => {
    const key = host.trim();
    if (!key) {
      return;
    }
    if (metric === 'packet_loss') {
      merged[key] = Math.max(Number(merged[key] ?? 0), offlineValue);
    } else {
      merged[key] = 0;
    }
  };

  for (const [host, count] of Object.entries(problemMap)) {
    if (count > 0) {
      markOffline(host);
    }
  }

  for (const host of mapHostNames) {
    if (lookupProblemCount(problemMap, host) > 0) {
      markOffline(host);
    }
  }

  return merged;
}

export function hostToNodeId(host: string): string {
  return host
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

  const nodes = [...map.nodes];
  const idx = nodes.findIndex((n) => (n.type ?? 'host') === 'host' && n.zabbixHost?.trim() === key);

  if (idx >= 0) {
    const merged: TopologyNode = { ...nodes[idx], ...layoutPatch, zabbixHost: key, type: 'host' };
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
  node: { zabbixHost?: string; type?: string },
  statusMap: HostStatusMap,
  threshold: number,
  metric: TopologyStatusMetric = 'icmp_rtt',
  metadata?: HostMetadataMap
): 'online' | 'offline' | 'unknown' {
  if (node.type === 'submap' || node.type === 'static' || node.type === 'network') {
    return 'unknown';
  }
  const key = node.zabbixHost?.trim();
  if (!key) {
    return 'unknown';
  }
  const v = lookupHostStatus(statusMap, key, metadata);
  if (v === null || v === undefined) {
    return 'unknown';
  }
  return resolveStatusFromValue(v, threshold, metric);
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

function nodeDisplayName(node?: TopologyNode): string {
  return (node?.zabbixHost || node?.label || '').trim();
}

/** Infer link medium from endpoint host names (LiteAP, Wi2BE, etc.). */
export function inferLinkMedium(from?: TopologyNode, to?: TopologyNode): TopologyLinkMedium {
  if (RADIO_HOST_PATTERN.test(nodeDisplayName(from)) || RADIO_HOST_PATTERN.test(nodeDisplayName(to))) {
    return 'radio';
  }
  return 'fiber';
}

export function resolveLinkMedium(link: TopologyLink): TopologyLinkMedium {
  return link.medium === 'radio' ? 'radio' : 'fiber';
}

/** Grafana dashboard scroll containers (ancestors with overflow auto/scroll). */
export function findScrollParents(el: HTMLElement | null): HTMLElement[] {
  const result: HTMLElement[] = [];
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY, overflow } = getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowY) || /(auto|scroll)/.test(overflow)) {
      if (node.scrollHeight > node.clientHeight + 1) {
        result.push(node);
      }
    }
    node = node.parentElement;
  }
  return result;
}

export function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  return findScrollParents(el)[0] ?? null;
}

let measureCtx: CanvasRenderingContext2D | null = null;

function textWidth(text: string, fontSize: number): number {
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

  if (node.type === 'submap') {
    const pad = 8;
    const lineGap = 4;
    const label = (node.label || node.id).trim();
    const sub = node.subtitle?.trim();
    const hasTwoLines = Boolean(sub);
    const contentW = Math.max(textWidth(label, fontSize), sub ? textWidth(sub, subFontSize) : 0);
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
  const label = (node.label || node.id).trim();
  const sub = options.showSubtitle && node.subtitle ? node.subtitle.trim() : undefined;
  const showIcon =
    node.type !== 'submap' && node.type !== 'static' && node.type !== 'network' && Boolean(node.icon);
  const iconDims = showIcon && node.icon ? hostIconRenderDimensions(node.icon) : { w: HOST_ICON_SIZE, h: HOST_ICON_SIZE };
  const iconSize = iconDims.h;
  const iconRowHeight = showIcon ? iconSize + HOST_ICON_GAP : 0;

  const contentW = Math.max(textWidth(label, fontSize), sub ? textWidth(sub, subFontSize) : 0);
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
  const label = (node.label || node.id).trim();
  const sub = options.showSubtitle && node.subtitle ? node.subtitle.trim() : undefined;

  const contentW = Math.max(textWidth(label, labelFontSize), sub ? textWidth(sub, subFontSize) : 0);
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
  const label = (node.label || node.id).trim();
  return {
    w,
    h,
    label,
    subFontSize: fontSize,
    labelFontSize: fontSize,
    labelY: pad + fontSize / 2,
  };
}
