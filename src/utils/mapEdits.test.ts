import { describe, expect, it } from 'vitest';
import { ensureUniqueNodeIds, moveStoredNode, moveStoredNodesBulk, rebindZabbixHost, removeNodeFromMap, removeNodesFromMap } from './mapEdits';
import { emptyMap, hostNode } from './testMapFixtures';

describe('removeNodeFromMap', () => {
  it('remove o nó e os links conectados a ele', () => {
    const map = emptyMap({
      nodes: [hostNode(), hostNode({ id: 'b' })],
      links: [{ from: 'a', to: 'b' }],
    });
    const next = removeNodeFromMap(map, 'a');
    expect(next.nodes.map((n) => n.id)).toEqual(['b']);
    expect(next.links).toHaveLength(0);
  });

  it('registra host da Query removido em hiddenHosts (não reaparece no próximo merge)', () => {
    const map = emptyMap({ nodes: [hostNode({ zabbixHost: '10.0.0.1' })] });
    const next = removeNodeFromMap(map, 'a');
    expect(next.hiddenHosts).toContain('10.0.0.1');
  });

  it('não afeta hiddenHosts ao remover um nó que não é host', () => {
    const map = emptyMap({ nodes: [{ id: 'net-1', type: 'network', x: 0, y: 0 }] });
    const next = removeNodeFromMap(map, 'net-1');
    expect(next.hiddenHosts).toBeUndefined();
  });
});

describe('removeNodesFromMap', () => {
  it('sem nós para remover, retorna o mesmo mapa (sem cópia)', () => {
    const map = emptyMap();
    expect(removeNodesFromMap(map, [])).toBe(map);
  });

  it('remove vários nós de uma vez preservando os demais', () => {
    const map = emptyMap({ nodes: [hostNode(), hostNode({ id: 'b' }), hostNode({ id: 'c' })] });
    const next = removeNodesFromMap(map, [hostNode(), hostNode({ id: 'b' })]);
    expect(next.nodes.map((n) => n.id)).toEqual(['c']);
  });
});

describe('moveStoredNode / moveStoredNodesBulk', () => {
  it('arredonda coordenadas e limpa networkId ao mover host manualmente', () => {
    const node = hostNode({ networkId: 'net-1' });
    const map = emptyMap({ nodes: [node] });
    const next = moveStoredNode(map, node, 12.6, 30.2);
    const moved = next.nodes.find((n) => n.id === 'a');
    expect(moved).toMatchObject({ x: 13, y: 30 });
    expect(moved?.networkId).toBeUndefined();
  });

  it('move vários nós de uma vez', () => {
    const map = emptyMap({ nodes: [hostNode(), hostNode({ id: 'b', x: 0, y: 0 })] });
    const next = moveStoredNodesBulk(map, [
      { nodeId: 'a', x: 100, y: 200 },
      { nodeId: 'b', x: 300, y: 400 },
    ]);
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 100, y: 200 });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 300, y: 400 });
  });

  it('ignora ids não encontrados sem lançar erro', () => {
    const map = emptyMap({ nodes: [hostNode()] });
    expect(() => moveStoredNodesBulk(map, [{ nodeId: 'ghost', x: 1, y: 1 }])).not.toThrow();
  });

  it('move o host arrastado quando outro nó compartilha o mesmo IP', () => {
    const first = hostNode({
      id: 'host-a',
      zabbixHost: '10.0.0.10',
      subtitle: '10.0.0.10',
      x: -1089,
      y: -387,
    });
    const second = hostNode({
      id: 'host-b',
      zabbixHost: '10.0.0.10',
      subtitle: '10.0.0.10',
      x: -1009,
      y: -157,
    });
    const map = emptyMap({ nodes: [first, second] });
    const next = moveStoredNode(map, second, 400, 500);
    expect(next.nodes.find((n) => n.id === 'host-a')).toMatchObject({ x: -1089, y: -387 });
    expect(next.nodes.find((n) => n.id === 'host-b')).toMatchObject({ x: 400, y: 500 });
  });
});

describe('ensureUniqueNodeIds', () => {
  it('sem colisão, devolve o mesmo mapa', () => {
    const map = emptyMap({ nodes: [hostNode(), hostNode({ id: 'b' })] });
    expect(ensureUniqueNodeIds(map)).toBe(map);
  });

  it('renomeia a cópia posterior quando dois nós têm o mesmo id', () => {
    const map = emptyMap({
      nodes: [
        hostNode({ id: 'ltbac-ptz07-ptz15-2', x: -1089, y: -387 }),
        hostNode({ id: 'ltbac-ptz07-ptz15-2', x: -1009, y: -157 }),
      ],
    });
    const next = ensureUniqueNodeIds(map);
    expect(next.nodes.map((n) => n.id)).toEqual(['ltbac-ptz07-ptz15-2', 'ltbac-ptz07-ptz15-2-2']);
    expect(next.nodes[1]).toMatchObject({ x: -1009, y: -157 });
  });
});

describe('rebindZabbixHost', () => {
  it('ip inválido não altera o mapa', () => {
    const map = emptyMap({ nodes: [hostNode({ zabbixHost: '10.0.0.1', subtitle: '10.0.0.1' })] });
    expect(rebindZabbixHost(map, 'a', 'Novo nome', 'not-an-ip')).toBe(map);
  });

  it('troca o host vinculado mantendo o id do nó', () => {
    const map = emptyMap({
      nodes: [hostNode({ zabbixHost: '10.0.0.1', subtitle: '10.0.0.1', label: 'Antigo' })],
    });
    const next = rebindZabbixHost(map, 'a', 'Novo nome', '10.0.0.2');
    const rebound = next.nodes.find((n) => n.id === 'a');
    expect(rebound).toMatchObject({ zabbixHost: '10.0.0.2', subtitle: '10.0.0.2', label: 'Novo nome' });
  });
});
