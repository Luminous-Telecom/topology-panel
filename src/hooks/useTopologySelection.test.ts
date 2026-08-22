import { describe, expect, it } from 'vitest';
import { nextSelectedNodeIds, nextSelectedNodeIdsOnPointerDown } from './useTopologySelection';

describe('nextSelectedNodeIds', () => {
  it('clique simples seleciona só aquele nó', () => {
    expect(nextSelectedNodeIds(['host-a', 'host-b'], 'host-c', false)).toEqual(['host-c']);
  });

  it('Ctrl/Cmd inclui um nó que ainda não estava selecionado', () => {
    expect(nextSelectedNodeIds(['host-a'], 'host-b', true)).toEqual(['host-a', 'host-b']);
  });

  it('Ctrl/Cmd tira o nó se ele já estava selecionado', () => {
    expect(nextSelectedNodeIds(['host-a', 'host-b'], 'host-a', true)).toEqual(['host-b']);
  });
});

describe('nextSelectedNodeIdsOnPointerDown', () => {
  it('clique em nó fora da seleção substitui pela seleção daquele nó', () => {
    expect(nextSelectedNodeIdsOnPointerDown(['host-a'], 'host-b', false)).toEqual(['host-b']);
  });

  it('clique em nó já selecionado mantém o grupo para arrastar juntos', () => {
    expect(nextSelectedNodeIdsOnPointerDown(['host-a', 'host-b'], 'host-a', false)).toEqual([
      'host-a',
      'host-b',
    ]);
  });

  it('Ctrl/Cmd no pointerdown inclui ou tira o nó', () => {
    expect(nextSelectedNodeIdsOnPointerDown(['host-a'], 'host-b', true)).toEqual(['host-a', 'host-b']);
    expect(nextSelectedNodeIdsOnPointerDown(['host-a', 'host-b'], 'host-a', true)).toEqual(['host-b']);
  });
});
