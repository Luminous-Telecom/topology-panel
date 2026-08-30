import { describe, expect, it } from 'vitest';
import { defaultOptions } from '../types';
import { isPositionOnlyMapChange, mapRevisionChanged, nodesOnlyMoved, reuseMapsIfOnlyMoved, reuseResolvedOptionsIfOnlyMoved, sameNodeGeometry } from './mapRevision';
import { emptyMap, hostNode } from './testMapFixtures';

describe('mapRevisionChanged', () => {
  it('mesmo objeto não mudou', () => {
    const map = emptyMap();
    expect(mapRevisionChanged(map, map)).toBe(false);
  });

  it('dois mapas vazios com arrays novos não contam como revisão', () => {
    expect(mapRevisionChanged(emptyMap(), emptyMap())).toBe(false);
  });

  it('novo array de nós (arraste) conta como revisão nova', () => {
    const prev = emptyMap({ nodes: [hostNode()] });
    const next = { ...prev, nodes: [{ ...prev.nodes[0], x: 40 }] };
    expect(mapRevisionChanged(prev, next)).toBe(true);
  });
});

describe('sameNodeGeometry', () => {
  it('mesmas caixas mesmo com objeto novo', () => {
    const a = emptyMap({ nodes: [hostNode({ x: 10, y: 20, width: 48, height: 28 })] });
    const b = emptyMap({ nodes: [hostNode({ x: 10, y: 20, width: 48, height: 28 })] });
    expect(sameNodeGeometry(a, b)).toBe(true);
  });

  it('posição diferente não é a mesma geometria', () => {
    const a = emptyMap({ nodes: [hostNode({ x: 10, y: 20 })] });
    const b = emptyMap({ nodes: [hostNode({ x: 11, y: 20 })] });
    expect(sameNodeGeometry(a, b)).toBe(false);
  });
});

describe('nodesOnlyMoved / isPositionOnlyMapChange', () => {
  it('arraste (só x/y) é só movimento', () => {
    const a = hostNode({ id: 'a', x: 10, y: 20, label: 'A', zabbixHost: '10.0.0.1' });
    const b = { ...a, x: 40, y: 80 };
    expect(nodesOnlyMoved([a], [b])).toBe(true);
  });

  it('rótulo diferente não é só movimento', () => {
    const a = hostNode({ id: 'a', label: 'A' });
    const b = { ...a, label: 'B' };
    expect(nodesOnlyMoved([a], [b])).toBe(false);
  });

  it('sair da rede (networkId) no arraste ainda é só movimento', () => {
    const a = hostNode({ id: 'a', x: 10, y: 10, networkId: 'net-1', zabbixHost: '10.0.0.1' });
    const b = { ...a, x: 40, y: 80, networkId: undefined };
    expect(nodesOnlyMoved([a], [b])).toBe(true);
  });

  it('mapa com os mesmos links e um host arrastado é mudança só de posição', () => {
    const prev = emptyMap({ nodes: [hostNode({ id: 'a', x: 0, y: 0 })] });
    const next = { ...prev, nodes: [{ ...prev.nodes[0], x: 12, y: 8 }] };
    expect(isPositionOnlyMapChange(prev, next)).toBe(true);
  });

  it('array de links novo não é só posição', () => {
    const prev = emptyMap({ nodes: [hostNode({ id: 'a', x: 0, y: 0 })] });
    const next = { ...prev, nodes: [{ ...prev.nodes[0], x: 12, y: 8 }], links: [...prev.links] };
    expect(isPositionOnlyMapChange(prev, next)).toBe(false);
  });
});

describe('reuseMapsIfOnlyMoved', () => {
  it('reusa o array quando só x/y mudou, mesmo com links clonados', () => {
    const prevMap = emptyMap({ nodes: [hostNode({ id: 'a', x: 0, y: 0 })] });
    const previous = [prevMap];
    const moved = {
      ...prevMap,
      nodes: [{ ...prevMap.nodes[0], x: 40, y: 12 }],
      links: [...prevMap.links],
    };
    expect(reuseMapsIfOnlyMoved(previous, [moved])).toBe(previous);
  });

  it('não reusa quando entra um nó novo', () => {
    const prevMap = emptyMap({ nodes: [hostNode({ id: 'a', x: 0, y: 0 })] });
    const nextMap = emptyMap({
      nodes: [hostNode({ id: 'a', x: 0, y: 0 }), hostNode({ id: 'b', x: 1, y: 1 })],
    });
    const next = [nextMap];
    expect(reuseMapsIfOnlyMoved([prevMap], next)).toBe(next);
  });
});

describe('reuseResolvedOptionsIfOnlyMoved', () => {
  it('reusa o objeto quando o Grafana clona o JSON e só x/y mudou', () => {
    const map = emptyMap({ nodes: [hostNode({ id: 'a', x: 0, y: 0 })] });
    const previous = { ...defaultOptions(), map };
    const cloned = JSON.parse(
      JSON.stringify({
        ...previous,
        map: { ...map, nodes: [{ ...map.nodes[0], x: 40, y: 12 }] },
      })
    ) as typeof previous;
    expect(reuseResolvedOptionsIfOnlyMoved(previous, cloned)).toBe(previous);
  });

  it('não reusa quando um cabo muda', () => {
    const map = emptyMap({ nodes: [hostNode({ id: 'a', x: 0, y: 0 })] });
    const previous = { ...defaultOptions(), map };
    const next = {
      ...previous,
      map: { ...map, links: [{ from: 'a', to: 'a', medium: 'fiber' as const }] },
    };
    expect(reuseResolvedOptionsIfOnlyMoved(previous, next)).toBe(next);
  });
});
