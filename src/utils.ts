import { DataFrame, FieldType, LoadingState, PanelData } from '@grafana/data';
import {
  HostMetadataMap,
  HostStatusMap,
  TopologyLink,
  TopologyLinkMedium,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
} from './types';

/**
 * Build host -> packet loss map from Grafana panel data.
 * Expects a table frame (after reduce transform) with host + loss columns,
 * or time_series with labels on the value field.
 */
export function extractHostStatus(data: PanelData, options: TopologyPanelOptions): HostStatusMap {
  const result: HostStatusMap = {};
  if (!data?.series?.length) {
    return result;
  }

  const hostField = options.statusHostField || 'host';
  const valueField = options.statusValueField || 'loss';

  for (const frame of data.series) {
    const fields = frame.fields;
    if (!fields?.length) {
      continue;
    }

    const hostIdx = fields.findIndex((f) => f.name === hostField || f.labels?.host);
    const valueIdx = fields.findIndex(
      (f) => f.name === valueField || f.name === 'Last' || f.name === 'Value' || f.type === FieldType.number
    );

    if (hostIdx >= 0 && valueIdx >= 0 && hostIdx !== valueIdx) {
      const hostCol = fields[hostIdx];
      const valCol = fields[valueIdx];
      const len = hostCol.values.length;
      for (let i = 0; i < len; i++) {
        const host =
          (hostCol.values.get(i) as string) ||
          (hostCol.labels?.host as string) ||
          (valCol.labels?.host as string);
        if (!host) {
          continue;
        }
        const v = valCol.values.get(i);
        if (v !== null && v !== undefined && !Number.isNaN(Number(v))) {
          result[host] = Number(v);
        }
      }
      continue;
    }

    // Time series: one field per series with labels.host
    for (const field of fields) {
      if (field.type !== FieldType.number) {
        continue;
      }
      const host = (field.labels?.host as string) || (field.labels?.__zbx_host_name as string);
      if (!host) {
        continue;
      }
      const vals = field.values.toArray() as Array<number | null>;
      for (let i = vals.length - 1; i >= 0; i--) {
        if (vals[i] !== null && vals[i] !== undefined) {
          result[host] = Number(vals[i]);
          break;
        }
      }
    }
  }

  return result;
}

function panelDataFromFrames(frames: DataFrame[]): PanelData {
  return {
    series: frames,
    state: LoadingState.Done,
    timeRange: { from: 0 as any, to: 0 as any, raw: { from: 'now-5m', to: 'now' } },
  };
}

/** Unique Zabbix host names returned by panel queries (Query tab). */
export function extractQueryHosts(
  data: PanelData | DataFrame[] | undefined,
  options: TopologyPanelOptions
): string[] {
  const hosts = new Set<string>();

  if (!data) {
    return [];
  }

  const panelData = Array.isArray(data) ? panelDataFromFrames(data) : data;
  for (const host of Object.keys(extractHostStatus(panelData, options))) {
    hosts.add(host);
  }

  const frames = panelData.series ?? [];
  const hostField = options.statusHostField || 'host';

  for (const frame of frames) {
    for (const field of frame.fields ?? []) {
      if (field.name === hostField) {
        for (let i = 0; i < field.values.length; i++) {
          const v = field.values.get(i);
          if (typeof v === 'string' && v.trim()) {
            hosts.add(v.trim());
          }
        }
      }
      const labelHost =
        (field.labels?.host as string) ||
        (field.labels?.__zbx_host_name as string) ||
        (field.labels?.hostName as string);
      if (labelHost?.trim()) {
        hosts.add(labelHost.trim());
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

/** Host name + IP from panel query frames (labels/columns). */
export function extractHostMetadataFromData(
  data: PanelData | DataFrame[] | undefined,
  options: TopologyPanelOptions
): HostMetadataMap {
  const result: HostMetadataMap = {};
  if (!data) {
    return result;
  }

  const panelData = Array.isArray(data) ? panelDataFromFrames(data) : data;
  const hostField = options.statusHostField || 'host';
  const ipField = options.hostIpField || 'ip';

  for (const frame of panelData.series ?? []) {
    const fields = frame.fields ?? [];

    const hostIdx = fields.findIndex((f) => f.name === hostField);
    const ipIdx = fields.findIndex((f) => f.name === ipField || f.name === 'host_ip' || f.name === 'IP');

    if (hostIdx >= 0 && ipIdx >= 0 && hostIdx !== ipIdx) {
      const hostCol = fields[hostIdx];
      const ipCol = fields[ipIdx];
      for (let i = 0; i < hostCol.values.length; i++) {
        const host = String(hostCol.values.get(i) ?? '').trim();
        const ip = String(ipCol.values.get(i) ?? '').trim();
        if (host) {
          result[host] = { name: host, ip: IPV4.test(ip) ? ip : result[host]?.ip };
        }
      }
    }

    for (const field of fields) {
      const labels = (field.labels ?? {}) as Record<string, string | undefined>;
      const host = (labels.host || labels.__zbx_host_name || labels.hostName)?.trim();
      if (!host) {
        continue;
      }
      const visible = (labels.__zbx_host_visible_name || labels.host || host).trim();
      const ip = pickIpFromLabels(labels);
      result[host] = {
        name: visible,
        ip: ip ?? result[host]?.ip,
      };
    }
  }

  return result;
}

export function hostToNodeId(host: string): string {
  return host
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function findSavedHostNode(map: TopologyMap, hostName: string): TopologyNode | undefined {
  return findSavedHostNodes(map, hostName)[0];
}

/** All saved layout entries for a Zabbix host (PDF may have same name at two positions, e.g. two IPs). */
function findSavedHostNodes(map: TopologyMap, hostName: string): TopologyNode[] {
  const key = hostName.trim();
  return map.nodes.filter((n) => {
    if ((n.type ?? 'host') !== 'host') {
      return false;
    }
    return n.zabbixHost?.trim() === key || n.label?.trim() === key || n.id === key;
  });
}

/** Build display nodes: hosts from Zabbix queries + saved layout; submapas from options. */
export function mergeMapWithQueryHosts(
  map: TopologyMap,
  queryHosts: string[],
  hostMetadata: HostMetadataMap = {}
): TopologyMap {
  const submaps = map.nodes.filter((n) => n.type === 'submap');
  const savedHosts = map.nodes.filter((n) => (n.type ?? 'host') === 'host');

  const hostNames =
    queryHosts.length > 0
      ? queryHosts
      : savedHosts.map((n) => n.zabbixHost?.trim() || n.label?.trim() || n.id).filter(Boolean);

  const hidden = new Set((map.hiddenHosts ?? []).map((h) => h.trim()));
  const visibleHostNames = hostNames.filter((h) => !hidden.has(h));

  const hostNodes: TopologyNode[] = [];
  visibleHostNames.forEach((hostName, index) => {
    const savedMatches = findSavedHostNodes(map, hostName);
    const meta = hostMetadata[hostName];
    const label = meta?.name ?? hostName;

    if (savedMatches.length > 0) {
      for (const saved of savedMatches) {
        hostNodes.push({
          id: saved.id,
          type: 'host',
          zabbixHost: hostName,
          label: saved.label ?? label,
          subtitle: meta?.ip ?? saved.subtitle,
          x: saved.x,
          y: saved.y,
          width: saved.width,
          height: saved.height,
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
      type: 'host',
      x: 100 + (index % cols) * 160,
      y: 100 + Math.floor(index / cols) * 80,
    });
  });

  const manualHosts = savedHosts.filter((n) => !n.zabbixHost?.trim());
  const staticNodes = map.nodes.filter((n) => n.type === 'static');
  const networkNodes = map.nodes.filter((n) => n.type === 'network');

  return { ...map, nodes: [...networkNodes, ...hostNodes, ...manualHosts, ...submaps, ...staticNodes] };
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

  const nodes = [...map.nodes];
  const idx = nodes.findIndex((n) => (n.type ?? 'host') === 'host' && n.zabbixHost?.trim() === key);

  if (idx >= 0) {
    nodes[idx] = { ...nodes[idx], ...layoutPatch, zabbixHost: key, type: 'host' };
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

  return { ...map, nodes };
}

export function resolveNodeStatus(
  node: { zabbixHost?: string; type?: string },
  statusMap: HostStatusMap,
  threshold: number
): 'online' | 'offline' | 'unknown' {
  if (node.type === 'submap' || node.type === 'static' || node.type === 'network') {
    return 'unknown';
  }
  const key = node.zabbixHost?.trim();
  if (!key) {
    return 'unknown';
  }
  const v = statusMap[key];
  if (v === null || v === undefined) {
    return 'unknown';
  }
  return v >= threshold ? 'offline' : 'online';
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
  subFontSize: number;
  labelY: number;
  subY?: number;
}

export function computeNodeLayout(
  node: { id: string; label?: string; subtitle?: string; width?: number; height?: number },
  options: Pick<TopologyPanelOptions, 'nodeFontSize' | 'showSubtitle'>
): NodeLayout {
  const fontSize = options.nodeFontSize;
  const subFontSize = Math.max(9, fontSize - 2);
  const padX = 10;
  const padY = 6;
  const lineGap = 3;
  const label = (node.label || node.id).trim();
  const sub = options.showSubtitle && node.subtitle ? node.subtitle.trim() : undefined;

  const contentW = Math.max(textWidth(label, fontSize), sub ? textWidth(sub, subFontSize) : 0);
  const w = Math.max(Math.ceil(contentW + padX * 2), 48);
  const h = sub
    ? Math.max(Math.ceil(padY * 2 + fontSize + lineGap + subFontSize), 28)
    : Math.max(Math.ceil(padY * 2 + fontSize), 24);

  const labelY = sub ? padY + fontSize / 2 : h / 2;
  const subY = sub ? h - padY - subFontSize / 2 : undefined;

  return { w, h, label, sub, subFontSize, labelY, subY };
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
    labelY: pad + fontSize / 2,
  };
}
