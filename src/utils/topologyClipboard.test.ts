import { beforeEach, describe, expect, it } from 'vitest';
import { clearTopologyClipboard, copyTopologySelection, getTopologyClipboard } from './topologyClipboard';
import { emptyMap, hostNode } from './testMapFixtures';

const STORAGE_KEY = 'luminous-topology-panel-clipboard';

function mapWithCredentials() {
  return emptyMap({
    nodes: [
      hostNode({
        id: 'host-a',
        label: 'host-a',
        zabbixHost: 'host-a',
        subtitle: '10.0.0.1',
        toolUsername: 'operador',
        toolPassword: 'senha-do-equipamento',
      }),
    ],
  });
}

describe('copyTopologySelection', () => {
  beforeEach(() => {
    clearTopologyClipboard();
  });

  it('copia o nó selecionado com rótulo e endereço', () => {
    const map = mapWithCredentials();
    const payload = copyTopologySelection(map, map, ['host-a'], null);

    expect(payload?.nodes).toHaveLength(1);
    expect(payload?.nodes[0].label).toBe('host-a');
    expect(payload?.nodes[0].subtitle).toBe('10.0.0.1');
  });

  it('não leva credencial de Tools para o clipboard', () => {
    const map = mapWithCredentials();
    const payload = copyTopologySelection(map, map, ['host-a'], null);

    expect(payload?.nodes[0].toolUsername).toBeUndefined();
    expect(payload?.nodes[0].toolPassword).toBeUndefined();
    expect(getTopologyClipboard()?.nodes[0].toolPassword).toBeUndefined();
  });

  it('não deixa a senha no sessionStorage, que o DevTools lê', () => {
    const map = mapWithCredentials();
    copyTopologySelection(map, map, ['host-a'], null);

    expect(sessionStorage.getItem(STORAGE_KEY)).not.toContain('senha-do-equipamento');
  });

  it('não altera o nó do mapa de origem', () => {
    const map = mapWithCredentials();
    copyTopologySelection(map, map, ['host-a'], null);

    expect(map.nodes[0].toolPassword).toBe('senha-do-equipamento');
  });

  it('seleção vazia não gera payload', () => {
    const map = mapWithCredentials();
    expect(copyTopologySelection(map, map, [], null)).toBeNull();
  });
});
