import { describe, expect, it } from 'vitest';
import { activeChildMaps, emptyChildTopologyMap, removeChildMapEntry } from './childMapEdits';

describe('activeChildMaps', () => {
  it('ignora chaves marcadas com undefined após remoção no Grafana', () => {
    const maps = {
      teste: emptyChildTopologyMap(),
      removido: undefined,
    };
    expect(Object.keys(activeChildMaps(maps))).toEqual(['teste']);
  });

  it('retorna objeto vazio quando childMaps é undefined', () => {
    expect(activeChildMaps(undefined)).toEqual({});
  });
});

describe('removeChildMapEntry', () => {
  it('marca o id removido com undefined para o merge do Grafana apagar a chave', () => {
    const maps = {
      teste: emptyChildTopologyMap(),
      teste1: emptyChildTopologyMap(),
    };
    expect(removeChildMapEntry(maps, 'teste')).toEqual({
      teste: undefined,
      teste1: maps.teste1,
    });
  });
});
