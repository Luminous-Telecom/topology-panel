import { TopologyMap, TopologyNode } from '../types';

/**
 * Fábricas de mapa e nó usadas só pelos testes — não é importado por código de produção e por isso
 * não entra no bundle. Mantém os testes focados no comportamento em vez do preenchimento do objeto.
 */
export function emptyMap(overrides?: Partial<TopologyMap>): TopologyMap {
  return { width: 800, height: 600, nodes: [], links: [], ...overrides };
}

export function hostNode(overrides?: Partial<TopologyNode>): TopologyNode {
  return { id: 'a', type: 'host', x: 10, y: 10, ...overrides };
}
