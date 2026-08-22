import { describe, expect, it } from 'vitest';
import { TopologyMap } from '../../types';
import { applyTopologyBlueprint } from '../mapTemplateEdits';
import { resolveHostDescription, resolveHostVisibleName } from '../mapSync';
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
  it('não mostra status nem uplinks no card — a cor do host já indica o estado', () => {
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
      {
        id: 'olt',
        name: 'OLT',
        fields: ['name', 'ip', 'status', 'uplinks', 'onuCount'],
      },
      {
        uplinkCount: 2,
        showSubtitle: true,
        hostDisplay: { '10.0.0.5': { status: 'online', value: 1 } },
      }
    );
    expect(display.detailLines.some((l) => l.includes('Status:'))).toBe(false);
    expect(display.detailLines.some((l) => l.includes('Uplinks:'))).toBe(false);
  });

  it('mostra a descrição do Zabbix como linha extra e omite quando igual ao nome', () => {
    const node = {
      id: 'olt-1',
      type: 'host' as const,
      label: 'OLT-POP',
      subtitle: '10.0.0.5',
      zabbixHost: '10.0.0.5',
      x: 0,
      y: 0,
    };
    const withDescription = buildNodeTemplateDisplay(
      node,
      BUILTIN_NODE_TEMPLATES.find((t) => t.id === 'generic'),
      {
        showSubtitle: true,
        hostMetadata: {
          '10.0.0.5': { name: 'OLT-POP', ip: '10.0.0.5', description: 'OLT Huawei do POP Norte' },
        },
      }
    );
    expect(withDescription.detailLines[0]).toBe('OLT Huawei do POP Norte');

    const sameAsName = buildNodeTemplateDisplay(node, undefined, {
      showSubtitle: true,
      hostMetadata: {
        '10.0.0.5': { name: 'OLT-POP', ip: '10.0.0.5', description: 'olt-pop' },
      },
    });
    expect(sameAsName.detailLines).toEqual([]);
  });

  it('trunca descrição longa no card do host', () => {
    const long = 'A'.repeat(50);
    const display = buildNodeTemplateDisplay(
      {
        id: 'h1',
        type: 'host',
        label: 'host-a',
        subtitle: '10.0.0.1',
        zabbixHost: '10.0.0.1',
        x: 0,
        y: 0,
      },
      undefined,
      {
        showSubtitle: true,
        hostMetadata: {
          '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', description: long },
        },
      }
    );
    expect(display.detailLines[0]?.endsWith('…')).toBe(true);
    expect(display.detailLines[0]?.length).toBeLessThanOrEqual(42);
  });
});

describe('resolveHostVisibleName', () => {
  it('prefere o nome do metadata ao rótulo do mapa', () => {
    expect(
      resolveHostVisibleName(
        { id: 'h1', type: 'host', label: 'rótulo', zabbixHost: '10.0.0.1', subtitle: '10.0.0.1', x: 0, y: 0 },
        { '10.0.0.1': { name: 'host-a', ip: '10.0.0.1' } }
      )
    ).toBe('host-a');
  });

  it('usa o rótulo quando não há nome no metadata', () => {
    expect(
      resolveHostVisibleName({ id: 'h1', type: 'host', label: 'host-a', zabbixHost: '10.0.0.1', x: 0, y: 0 })
    ).toBe('host-a');
  });

  it('não usa o id do nó nem IP como nome', () => {
    expect(
      resolveHostVisibleName({ id: 'h1', type: 'host', zabbixHost: '10.0.0.1', subtitle: '10.0.0.1', x: 0, y: 0 })
    ).toBeUndefined();
  });
});

describe('resolveHostDescription', () => {
  it('devolve a descrição do metadata pelo IP do nó', () => {
    expect(
      resolveHostDescription(
        { id: 'h1', type: 'host', zabbixHost: '10.0.0.1', subtitle: '10.0.0.1', x: 0, y: 0 },
        { '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', description: 'Core POP' } }
      )
    ).toBe('Core POP');
  });

  it('não devolve descrição vazia', () => {
    expect(
      resolveHostDescription(
        { id: 'h1', type: 'host', zabbixHost: '10.0.0.1', subtitle: '10.0.0.1', x: 0, y: 0 },
        { '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', description: '   ' } }
      )
    ).toBeUndefined();
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
