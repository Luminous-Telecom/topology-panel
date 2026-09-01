import { describe, expect, it } from 'vitest';
import { compactPollLayout, regionLayoutKeyFromMap } from './zabbixBackendLayout';
import { emptyMap, hostNode } from './testMapFixtures';

describe('compactPollLayout', () => {
  it('envia só host, rede e submapa, com itemid de tráfego dos cabos', () => {
    const map = emptyMap({
      nodes: [
        { id: 'net1', type: 'network', x: 0, y: 0, width: 400, height: 200 },
        hostNode({ id: 'h1', x: 10, y: 10, zabbixHost: '10.0.0.1', networkId: 'net1' }),
        { id: 'label', type: 'static', x: 0, y: 0, label: 'POP' },
        { id: 'sm1', type: 'submap', x: 500, y: 10, submapChildMapId: 'child-a' },
      ],
      links: [
        {
          from: 'h1',
          to: 'sm1',
          fromInterface: { name: 'ether1', metrics: { rx: { itemId: '11' }, tx: { itemId: '12' } } },
        },
      ],
    });
    const child = emptyMap({
      nodes: [hostNode({ id: 'h2', zabbixHost: '10.0.0.2', label: 'host-b' })],
    });
    const compact = compactPollLayout(map, { 'child-a': child });
    expect(compact.nodes.map((node) => node.id).sort()).toEqual(['h1', 'net1', 'sm1']);
    expect(compact.links[0]).toMatchObject({ from: 'h1', to: 'sm1', fromRxItemId: '11', fromTxItemId: '12' });
    expect(compact.childHostKeys?.sm1).toEqual(['10.0.0.2']);
  });
});

describe('regionLayoutKeyFromMap', () => {
  it('só muda quando entra ou sai rede/submapa, não na posição do host', () => {
    const base = emptyMap({
      nodes: [
        { id: 'net1', type: 'network', x: 0, y: 0, width: 100, height: 100 },
        hostNode({ id: 'h1', x: 10, y: 10 }),
      ],
    });
    const moved = emptyMap({
      nodes: [
        { id: 'net1', type: 'network', x: 0, y: 0, width: 100, height: 100 },
        hostNode({ id: 'h1', x: 80, y: 80 }),
      ],
    });
    expect(regionLayoutKeyFromMap(base)).toBe(regionLayoutKeyFromMap(moved));
    const withSubmap = emptyMap({
      nodes: [
        { id: 'net1', type: 'network', x: 0, y: 0, width: 100, height: 100 },
        { id: 'sm1', type: 'submap', x: 0, y: 0 },
      ],
    });
    expect(regionLayoutKeyFromMap(withSubmap)).not.toBe(regionLayoutKeyFromMap(base));
  });
});
