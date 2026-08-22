import {
  HostDisplayMap,
  HostMetadataMap,
  TopologyHostStatus,
  TopologyNode,
  TopologyPanelOptions,
} from '../../types';
import { lookupHostDisplay } from '../queryHosts';
import { findQueryMetaForNode, resolveHostDescription } from '../mapSync';
import { resolveHostIp } from '../hostLookup';
import { NODE_TEMPLATE_FIELD_LABELS, NodeTemplateFieldKind, TopologyNodeTemplate } from './types';
import { resolvePanelTemplates, resolveTemplateForNode } from './resolveTemplates';

export interface NodeTemplateDisplay {
  label: string;
  subtitle?: string;
  detailLines: string[];
}

export interface NodeTemplateDisplayContext {
  hostMetadata?: HostMetadataMap;
  hostDisplay?: HostDisplayMap;
  uplinkCount?: number;
  showSubtitle?: boolean;
}

function statusLabel(status: TopologyHostStatus | undefined): string {
  switch (status) {
    case 'online':
      return 'Online';
    case 'offline':
      return 'Offline';
    case 'alert':
      return 'Alerta';
    default:
      return '—';
  }
}

function resolveHostStatus(
  node: TopologyNode,
  hostDisplay: HostDisplayMap | undefined,
  hostMetadata: HostMetadataMap | undefined
): TopologyHostStatus | undefined {
  const key = resolveHostIp(node, hostMetadata) ?? node.zabbixHost?.trim();
  if (!key || !hostDisplay) {
    return undefined;
  }
  const display = lookupHostDisplay(hostDisplay, { zabbixHost: key }, hostMetadata);
  return display?.status;
}

function formatMetricLine(kind: NodeTemplateFieldKind, value: string | undefined): string {
  const label = NODE_TEMPLATE_FIELD_LABELS[kind];
  if (!label) {
    return value ?? '—';
  }
  return `${label}: ${value ?? '—'}`;
}

function fieldLine(
  kind: NodeTemplateFieldKind,
  node: TopologyNode,
  ctx: NodeTemplateDisplayContext
): string | undefined {
  const meta = ctx.hostMetadata ? findQueryMetaForNode(node, ctx.hostMetadata) : undefined;
  const ip = resolveHostIp(node, ctx.hostMetadata) ?? meta?.ip;

  switch (kind) {
    case 'name':
      return node.label?.trim() || meta?.name?.trim() || node.id;
    case 'ip':
      return ip || node.subtitle?.trim() || undefined;
    case 'status':
      return formatMetricLine('status', statusLabel(resolveHostStatus(node, ctx.hostDisplay, ctx.hostMetadata)));
    case 'traffic':
      return formatMetricLine('traffic', undefined);
    case 'cpu':
      return formatMetricLine('cpu', undefined);
    case 'memory':
      return formatMetricLine('memory', undefined);
    case 'temperature':
      return formatMetricLine('temperature', undefined);
    case 'problems':
      return formatMetricLine('problems', undefined);
    case 'uplinks':
      return formatMetricLine(
        'uplinks',
        ctx.uplinkCount !== undefined ? String(ctx.uplinkCount) : undefined
      );
    case 'onuCount':
      return formatMetricLine('onuCount', undefined);
    case 'bgp':
      return formatMetricLine('bgp', undefined);
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

const NODE_DESCRIPTION_MAX_CHARS = 42;

function truncateHostDescription(text: string): string {
  if (text.length <= NODE_DESCRIPTION_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, NODE_DESCRIPTION_MAX_CHARS - 1).trimEnd()}…`;
}

export function buildNodeTemplateDisplay(
  node: TopologyNode,
  template: TopologyNodeTemplate | undefined,
  ctx: NodeTemplateDisplayContext
): NodeTemplateDisplay {
  const fields = template?.fields ?? ['name', 'ip'];
  const label = fieldLine('name', node, ctx) ?? node.id;
  let subtitle: string | undefined;
  const detailLines: string[] = [];

  for (const field of fields) {
    if (field === 'name') {
      continue;
    }
    const line = fieldLine(field, node, ctx);
    if (!line) {
      continue;
    }
    if (field === 'ip' && ctx.showSubtitle !== false) {
      if (!subtitle) {
        subtitle = line;
      }
      continue;
    }
    detailLines.push(line);
  }

  if (!subtitle && ctx.showSubtitle !== false) {
    const ip = resolveHostIp(node, ctx.hostMetadata) ?? node.subtitle?.trim();
    if (ip) {
      subtitle = ip;
    }
  }

  const description = resolveHostDescription(node, ctx.hostMetadata);
  if (description) {
    const line = truncateHostDescription(description);
    if (line !== label && line !== subtitle && !detailLines.includes(line)) {
      detailLines.unshift(line);
    }
  }

  return {
    label,
    subtitle,
    detailLines: detailLines.slice(0, 3),
  };
}

export function resolveNodeDisplayFromTemplates(
  node: TopologyNode,
  options: Pick<TopologyPanelOptions, 'nodeTemplates' | 'templateRules' | 'showSubtitle'>,
  ctx: NodeTemplateDisplayContext
): NodeTemplateDisplay {
  const { nodeTemplates, templateRules } = resolvePanelTemplates(options);
  const template = resolveTemplateForNode(node, templateRules, nodeTemplates, ctx.hostMetadata);
  return buildNodeTemplateDisplay(node, template, { ...ctx, showSubtitle: options.showSubtitle });
}
