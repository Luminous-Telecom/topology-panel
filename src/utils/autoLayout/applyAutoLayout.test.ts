import { describe, expect, it } from 'vitest';
import { TopologyMap } from '../../types';
import { applyAutoLayout, previewAutoLayoutPositions } from './applyAutoLayout';

function makeMap(nodes: TopologyMap['nodes'], links: TopologyMap['links'] = []): TopologyMap {
  return {
    width: 1200,
    height: 800,
    nodes,
    links,
    schemaVersion: 2,
  };
}

describe('applyAutoLayout', () => {
  it('organiza cadeia hierárquica com filho abaixo do pai', () => {
    const map = makeMap(
      [
        { id: 'core', label: 'Core', type: 'host', x: 0, y: 0 },
        { id: 'pop', label: 'POP', type: 'host', x: 0, y: 0 },
        { id: 'sw', label: 'SW', type: 'host', x: 0, y: 0 },
      ],
      [
        { from: 'core', to: 'pop' },
        { from: 'pop', to: 'sw' },
      ]
    );

    const positions = previewAutoLayoutPositions(map, {
      mode: 'hierarchical-down',
      gridStep: 10,
      includeManualPositions: true,
    });

    const core = positions.get('core');
    const pop = positions.get('pop');
    const sw = positions.get('sw');
    expect(core).toBeDefined();
    expect(pop).toBeDefined();
    expect(sw).toBeDefined();
    expect(pop!.y).toBeGreaterThan(core!.y);
    expect(sw!.y).toBeGreaterThan(pop!.y);
  });

  it('não move nós manuais sem confirmação', () => {
    const map = makeMap([
      { id: 'a', type: 'host', x: 100, y: 200, positionMode: 'manual' },
      { id: 'b', type: 'host', x: 300, y: 400, positionMode: 'auto' },
    ]);

    const { map: next, result } = applyAutoLayout(map, {
      mode: 'grid',
      gridStep: 10,
      includeManualPositions: false,
    });

    const a = next.nodes.find((n) => n.id === 'a');
    const b = next.nodes.find((n) => n.id === 'b');
    expect(a?.x).toBe(100);
    expect(a?.y).toBe(200);
    expect(b?.x).not.toBe(300);
    expect(result.movedCount).toBe(1);
    expect(result.skippedManualCount).toBe(1);
  });

  it('ignora redes e estáticos', () => {
    const map = makeMap([
      { id: 'net', type: 'network', x: 50, y: 50, width: 200, height: 120 },
      { id: 'lbl', type: 'static', x: 80, y: 80 },
      { id: 'h1', type: 'host', x: 10, y: 10 },
    ]);

    const { map: next } = applyAutoLayout(map, {
      mode: 'grid',
      gridStep: 10,
      includeManualPositions: true,
    });

    expect(next.nodes.find((n) => n.id === 'net')?.x).toBe(50);
    expect(next.nodes.find((n) => n.id === 'lbl')?.x).toBe(80);
    expect(next.nodes.find((n) => n.id === 'h1')?.positionMode).toBe('auto');
  });

  it('expande dimensões do mapa quando necessário', () => {
    const map = makeMap(
      Array.from({ length: 12 }, (_, i) => ({
        id: `n${i}`,
        type: 'host' as const,
        x: 0,
        y: 0,
      }))
    );

    const { map: next } = applyAutoLayout(map, {
      mode: 'grid',
      gridStep: 10,
      includeManualPositions: true,
    });

    expect(next.width).toBeGreaterThanOrEqual(map.width);
    expect(next.height).toBeGreaterThanOrEqual(map.height);
  });
});
