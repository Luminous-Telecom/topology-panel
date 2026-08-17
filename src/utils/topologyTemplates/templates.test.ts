import { describe, expect, it } from 'vitest';
import { TopologyMap } from '../../types';
import { applyTopologyBlueprint } from '../mapTemplateEdits';
import { BUILTIN_TOPOLOGY_BLUEPRINTS } from '../topologyTemplates/defaults';
import {
  applyTemplateRulesToMap,
  mergeTemplateRules,
  resolveTemplateForNode,
} from '../topologyTemplates/resolveTemplates';
import { buildNodeTemplateDisplay } from '../topologyTemplates/nodeTemplateDisplay';
import { BUILTIN_NODE_TEMPLATES } from '../topologyTemplates/defaults';

describe('resolveTemplateForNode', () => {
  it('associa template por grupo Zabbix', () => {
    const node = {
      id: 'olt-1',
      type: 'host' as const,
      zabbixHost: '10.0.0.1',
      x: 0,
      y: 0,
    };
    const template = resolveTemplateForNode(
      node,
      mergeTemplateRules(),
      BUILTIN_NODE_TEMPLATES,
      {
        '10.0.0.1': { name: 'OLT-POP', hostGroups: ['OLT POP Norte'] },
      }
    );
    expect(template?.id).toBe('olt');
  });

  it('respeita templateLocked', () => {
    const map: TopologyMap = {
      width: 800,
      height: 600,
      nodes: [
        {
          id: 'h1',
          type: 'host',
          zabbixHost: 'sw01',
          x: 0,
          y: 0,
          templateLocked: true,
          icon: 'firewall',
        },
      ],
      links: [],
    };
    const next = applyTemplateRulesToMap(map, {}, { sw01: { name: 'SW01', hostGroups: ['OLT'] } });
    expect(next.nodes[0].icon).toBe('firewall');
    expect(next.nodes[0].nodeTemplateId).toBeUndefined();
  });
});

describe('buildNodeTemplateDisplay', () => {
  it('monta linhas do template OLT com uplinks', () => {
    const node = {
      id: 'olt-1',
      type: 'host' as const,
      label: 'OLT-POP',
      subtitle: '10.0.0.5',
      zabbixHost: '10.0.0.5',
      x: 0,
      y: 0,
    };
    const display = buildNodeTemplateDisplay(
      node,
      BUILTIN_NODE_TEMPLATES.find((t) => t.id === 'olt'),
      { uplinkCount: 2, showSubtitle: true }
    );
    expect(display.label).toBe('OLT-POP');
    expect(display.subtitle).toBe('10.0.0.5');
    expect(display.detailLines.some((l) => l.includes('Uplinks: 2'))).toBe(true);
  });
});

describe('applyTopologyBlueprint', () => {
  it('insere nós e links do modelo POP', () => {
    const map: TopologyMap = { width: 1200, height: 800, nodes: [], links: [] };
    const pop = BUILTIN_TOPOLOGY_BLUEPRINTS.find((b) => b.id === 'pop-standard');
    expect(pop).toBeDefined();
    const { map: next, addedNodes, addedLinks } = applyTopologyBlueprint(map, pop!);
    expect(addedNodes).toBeGreaterThan(0);
    expect(addedLinks).toBe(3);
    expect(next.nodes.some((n) => n.type === 'network')).toBe(true);
    expect(next.links).toHaveLength(3);
  });
});
