import { describe, expect, it } from 'vitest';
import { NodeEditSavePayload, TopologyMap, TopologyNode } from '../types';
import { applyNodeEditSave } from './nodeEditSave';

function emptyMap(overrides?: Partial<TopologyMap>): TopologyMap {
  return { width: 800, height: 600, nodes: [], links: [], ...overrides };
}

function hostNode(overrides?: Partial<TopologyNode>): TopologyNode {
  return { id: 'host-a', type: 'host', x: 10, y: 20, label: 'A', ...overrides };
}

function payload(overrides?: Partial<NodeEditSavePayload>): NodeEditSavePayload {
  return { patch: {}, ...overrides };
}

describe('applyNodeEditSave', () => {
  it('aplica o patch em nó já salvo no mapa', () => {
    const node = hostNode();
    const map = emptyMap({ nodes: [node] });

    const next = applyNodeEditSave(map, node, payload({ patch: { label: 'Novo rótulo' } }));

    expect(next.nodes[0].label).toBe('Novo rótulo');
  });

  it('não altera o mapa quando o patch vem vazio', () => {
    const node = hostNode();
    const map = emptyMap({ nodes: [node] });

    expect(applyNodeEditSave(map, node, payload())).toBe(map);
  });

  it('grava o layout antes de editar host que só existia na Query', () => {
    const queryOnly = hostNode({ id: 'q-1', subtitle: '10.0.0.9', zabbixHost: 'rb-01' });
    const map = emptyMap();

    const next = applyNodeEditSave(map, queryOnly, payload({ patch: { label: 'Borda' } }));

    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0].label).toBe('Borda');
  });

  it('reencontra o nó pelo host antigo depois de um rebind', () => {
    const node = hostNode({ zabbixHost: 'antigo' });
    const map = emptyMap({ nodes: [node] });

    const next = applyNodeEditSave(
      map,
      node,
      payload({
        patch: { label: 'Renomeado' },
        rebind: { visibleName: 'novo', ip: '10.0.0.1', icon: 'router' },
      })
    );

    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0].label).toBe('Renomeado');
  });

  it('não inventa nó quando o host da Query não tem chave de layout', () => {
    const semChave = hostNode({ id: 'sem-chave', label: undefined, subtitle: undefined, zabbixHost: undefined });
    const map = emptyMap();

    expect(applyNodeEditSave(map, semChave, payload({ patch: { label: 'X' } })).nodes).toHaveLength(0);
  });
});
