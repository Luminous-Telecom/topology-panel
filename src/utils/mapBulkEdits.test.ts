import { describe, expect, it } from 'vitest';
import { TopologyNode } from '../types';
import { seedBulkSubmapFormValues, updateHostsIconBulk } from './mapBulkEdits';
import { emptyMap, hostNode } from './testMapFixtures';

function submap(id: string, overrides?: Partial<TopologyNode>): TopologyNode {
  return { id, type: 'submap', label: id, x: 0, y: 0, ...overrides };
}

describe('seedBulkSubmapFormValues', () => {
  it('mostra largura e altura salvas no mapa', () => {
    const targets = [submap('s1', { width: 180, height: 96 })];
    expect(seedBulkSubmapFormValues(targets)).toEqual({
      width: '180',
      height: '96',
      widthMixed: false,
      heightMixed: false,
    });
  });

  it('cai na caixa medida quando não há tamanho salvo', () => {
    const targets = [submap('s1')];
    const layouts = new Map([['s1', { w: 142, h: 58 }]]);
    expect(seedBulkSubmapFormValues(targets, layouts)).toEqual({
      width: '142',
      height: '58',
      widthMixed: false,
      heightMixed: false,
    });
  });

  it('marca misto quando a seleção tem tamanhos diferentes', () => {
    const targets = [submap('a', { width: 100 }), submap('b', { width: 200 })];
    expect(seedBulkSubmapFormValues(targets)).toMatchObject({
      width: '',
      widthMixed: true,
    });
  });
});

describe('updateHostsIconBulk', () => {
  it('sem ícone informado, retorna o mesmo mapa', () => {
    const map = emptyMap({ nodes: [hostNode({ zabbixHost: '10.0.0.1' })] });
    expect(updateHostsIconBulk(map, map.nodes, undefined)).toBe(map);
  });

  it('aplica o ícone a todos os hosts selecionados vinculados à Query', () => {
    const map = emptyMap({
      nodes: [
        hostNode({ id: 'a', zabbixHost: '10.0.0.1' }),
        hostNode({ id: 'b', zabbixHost: '10.0.0.2' }),
      ],
    });
    const next = updateHostsIconBulk(map, map.nodes, 'switch_managed');
    expect(next.nodes.every((n) => n.icon === 'switch_managed')).toBe(true);
    expect(next.hostIcons?.['10.0.0.1']).toBe('switch_managed');
    expect(next.hostIcons?.['10.0.0.2']).toBe('switch_managed');
  });
});
