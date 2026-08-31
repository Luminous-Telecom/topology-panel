import { describe, expect, it } from 'vitest';
import { defaultTopologyMap } from '../types';
import { topologyMapOrDefault, validateTopologyMap, isUninitializedTopologyMap } from './mapValidation';

describe('topologyMapOrDefault', () => {
  it('usa o mapa completo quando nodes e links são listas', () => {
    const map = defaultTopologyMap();
    expect(topologyMapOrDefault(map)).toBe(map);
  });

  it('ignora objeto vazio do Grafana (painel novo) e cai no padrão', () => {
    const next = topologyMapOrDefault({} as never);
    expect(validateTopologyMap(next)).toEqual([]);
    expect(next.nodes.length).toBeGreaterThan(0);
  });

  it('reconhece map vazio ou ausente como painel novo, não como JSON corrompido', () => {
    expect(isUninitializedTopologyMap(undefined)).toBe(true);
    expect(isUninitializedTopologyMap({} as never)).toBe(true);
    expect(isUninitializedTopologyMap(defaultTopologyMap())).toBe(false);
    expect(
      isUninitializedTopologyMap({ width: 1200, height: 800, nodes: 'x', links: [] } as never)
    ).toBe(false);
  });

  it('ignora o primeiro candidato inválido e usa o seguinte válido', () => {
    const valid = defaultTopologyMap();
    expect(topologyMapOrDefault(undefined, {} as never, valid)).toBe(valid);
  });

  it('não quebra com value e fallback ausentes', () => {
    const next = topologyMapOrDefault(undefined, undefined);
    expect(validateTopologyMap(next)).toEqual([]);
  });
});
