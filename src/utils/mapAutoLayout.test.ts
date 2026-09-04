import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopologyMap } from '../types';
import { autoLayoutTopologyMap, layoutNodeSize } from './mapAutoLayout';
import { emptyMap, hostNode } from './testMapFixtures';

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class ElkMock {
    layout(graph: {
      children?: Array<{ id: string; width: number; height: number }>;
    }) {
      return Promise.resolve({
        ...graph,
        children: graph.children?.map((child, index) => ({
          ...child,
          x: 40 + index * 120,
          y: 40,
        })),
      });
    }
  },
}));

describe('layoutNodeSize', () => {
  it('rede usa largura e altura gravadas no nó', () => {
    expect(
      layoutNodeSize({
        id: 'net-a',
        type: 'network',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
      }).width
    ).toBe(400);
  });

  it('host usa dimensão padrão quando não há caixa explícita', () => {
    const size = layoutNodeSize(hostNode({ id: 'host-a' }));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });
});

describe('autoLayoutTopologyMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mapa vazio não altera o documento', async () => {
    const map = emptyMap();
    await expect(autoLayoutTopologyMap(map, 10)).resolves.toBe(map);
  });

  it('reposiciona nós com snap à grade', async () => {
    const map: TopologyMap = emptyMap({
      nodes: [
        hostNode({ id: 'host-a', x: 5, y: 5 }),
        hostNode({ id: 'host-b', x: 500, y: 500 }),
      ],
      links: [{ from: 'host-a', to: 'host-b', medium: 'fiber' }],
    });

    const next = await autoLayoutTopologyMap(map, 10);
    expect(next.nodes[0].x).not.toBe(5);
    expect(next.nodes[1].x).not.toBe(500);
    const sizeA = layoutNodeSize(next.nodes[0]);
    const centerX = next.nodes[0].x + sizeA.width / 2;
    const centerY = next.nodes[0].y + sizeA.height / 2;
    expect(centerX % 10).toBe(0);
    expect(centerY % 10).toBe(0);
  });
});
