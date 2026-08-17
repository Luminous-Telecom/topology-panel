import { HostMetadataMap, TopologyMap, TopologyNode, TopologyPanelOptions } from '../../types';
import { findQueryMetaForNode } from '../mapSync';
import { resolveHostIp } from '../hostLookup';
import { isHostNode } from '../topologyNodes';
import {
  BUILTIN_NODE_TEMPLATES,
  BUILTIN_TEMPLATE_RULES,
  BUILTIN_TOPOLOGY_BLUEPRINTS,
} from './defaults';
import {
  TemplateRuleCondition,
  TopologyBlueprint,
  TopologyNodeTemplate,
  TopologyTemplateRule,
} from './types';

export interface TemplateMatchContext {
  hostname: string;
  hostKey: string;
  hostGroups: string[];
  tags: Array<{ tag: string; value: string }>;
}

export function mergeNodeTemplates(
  custom?: TopologyNodeTemplate[]
): TopologyNodeTemplate[] {
  const byId = new Map<string, TopologyNodeTemplate>();
  for (const template of BUILTIN_NODE_TEMPLATES) {
    byId.set(template.id, template);
  }
  for (const template of custom ?? []) {
    if (template.id?.trim()) {
      byId.set(template.id.trim(), template);
    }
  }
  return [...byId.values()];
}

export function mergeTemplateRules(custom?: TopologyTemplateRule[]): TopologyTemplateRule[] {
  const byId = new Map<string, TopologyTemplateRule>();
  for (const rule of BUILTIN_TEMPLATE_RULES) {
    byId.set(rule.id, rule);
  }
  for (const rule of custom ?? []) {
    if (rule.id?.trim()) {
      byId.set(rule.id.trim(), rule);
    }
  }
  return [...byId.values()].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

export function mergeTopologyBlueprints(custom?: TopologyBlueprint[]): TopologyBlueprint[] {
  const byId = new Map<string, TopologyBlueprint>();
  for (const blueprint of BUILTIN_TOPOLOGY_BLUEPRINTS) {
    byId.set(blueprint.id, blueprint);
  }
  for (const blueprint of custom ?? []) {
    if (blueprint.id?.trim()) {
      byId.set(blueprint.id.trim(), blueprint);
    }
  }
  return [...byId.values()];
}

export function resolvePanelTemplates(options: Pick<TopologyPanelOptions, 'nodeTemplates' | 'templateRules' | 'topologyTemplates'>) {
  return {
    nodeTemplates: mergeNodeTemplates(options.nodeTemplates),
    templateRules: mergeTemplateRules(options.templateRules),
    topologyBlueprints: mergeTopologyBlueprints(options.topologyTemplates),
  };
}

export function findNodeTemplateById(
  templates: TopologyNodeTemplate[],
  templateId: string | undefined
): TopologyNodeTemplate | undefined {
  if (!templateId?.trim()) {
    return undefined;
  }
  return templates.find((t) => t.id === templateId.trim());
}

export function buildTemplateMatchContext(
  node: TopologyNode,
  hostMetadata?: HostMetadataMap
): TemplateMatchContext | undefined {
  if (!isHostNode(node)) {
    return undefined;
  }
  const meta = hostMetadata ? findQueryMetaForNode(node, hostMetadata) : undefined;
  const hostKey = resolveHostIp(node, hostMetadata) ?? node.zabbixHost?.trim() ?? node.label?.trim() ?? node.id;
  const hostname = meta?.name?.trim() || node.label?.trim() || hostKey;
  return {
    hostname,
    hostKey,
    hostGroups: meta?.hostGroups ?? [],
    tags: meta?.tags ?? [],
  };
}

function parseTagEquals(value: string): { tag: string; tagValue?: string } {
  const trimmed = value.trim();
  const eq = trimmed.indexOf('=');
  if (eq < 0) {
    return { tag: trimmed.toLowerCase() };
  }
  return {
    tag: trimmed.slice(0, eq).trim().toLowerCase(),
    tagValue: trimmed.slice(eq + 1).trim().toLowerCase(),
  };
}

function ruleMatches(rule: TopologyTemplateRule, ctx: TemplateMatchContext): boolean {
  const needle = rule.value.trim();
  if (!needle) {
    return false;
  }
  switch (rule.condition) {
    case 'hostGroupContains': {
      const lower = needle.toLowerCase();
      return ctx.hostGroups.some((g) => g.toLowerCase().includes(lower));
    }
    case 'tagEquals': {
      const { tag, tagValue } = parseTagEquals(needle);
      return ctx.tags.some((t) => {
        if (t.tag.toLowerCase() !== tag) {
          return false;
        }
        if (tagValue === undefined) {
          return true;
        }
        return (t.value ?? '').toLowerCase() === tagValue;
      });
    }
    case 'hostnameContains':
      return ctx.hostname.toLowerCase().includes(needle.toLowerCase());
    case 'hostnameMatches': {
      try {
        const re = new RegExp(needle, 'i');
        return re.test(ctx.hostname);
      } catch {
        return false;
      }
    }
    default: {
      const _exhaustive: never = rule.condition;
      return _exhaustive;
    }
  }
}

export function resolveTemplateForNode(
  node: TopologyNode,
  rules: TopologyTemplateRule[],
  templates: TopologyNodeTemplate[],
  hostMetadata?: HostMetadataMap
): TopologyNodeTemplate | undefined {
  if (!isHostNode(node)) {
    return undefined;
  }
  const explicit = findNodeTemplateById(templates, node.nodeTemplateId);
  if (explicit) {
    return explicit;
  }
  const ctx = buildTemplateMatchContext(node, hostMetadata);
  if (!ctx) {
    return findNodeTemplateById(templates, 'generic');
  }
  for (const rule of rules) {
    if (!findNodeTemplateById(templates, rule.templateId)) {
      continue;
    }
    if (ruleMatches(rule, ctx)) {
      return findNodeTemplateById(templates, rule.templateId);
    }
  }
  return findNodeTemplateById(templates, 'generic');
}

export function applyTemplateToNode(
  node: TopologyNode,
  template: TopologyNodeTemplate | undefined
): TopologyNode {
  if (!isHostNode(node) || !template || node.templateLocked) {
    return node;
  }
  const nextIcon = node.icon ?? template.icon;
  const nextTemplateId = template.id;
  if (node.nodeTemplateId === nextTemplateId && (!template.icon || node.icon)) {
    return node;
  }
  return {
    ...node,
    nodeTemplateId: nextTemplateId,
    ...(nextIcon && !node.icon ? { icon: nextIcon } : {}),
  };
}

export function applyTemplateRulesToMap(
  map: TopologyMap,
  options: Pick<TopologyPanelOptions, 'nodeTemplates' | 'templateRules'>,
  hostMetadata?: HostMetadataMap
): TopologyMap {
  const { nodeTemplates, templateRules } = resolvePanelTemplates(options);
  let changed = false;
  const nodes = map.nodes.map((node) => {
    if (!isHostNode(node) || node.templateLocked) {
      return node;
    }
    const template = resolveTemplateForNode(node, templateRules, nodeTemplates, hostMetadata);
    const next = applyTemplateToNode(node, template);
    if (
      next.nodeTemplateId !== node.nodeTemplateId ||
      next.icon !== node.icon
    ) {
      changed = true;
    }
    return next;
  });
  return changed ? { ...map, nodes } : map;
}
