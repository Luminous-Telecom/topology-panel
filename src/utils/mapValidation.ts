import { TopologyMap } from '../types';

/**
 * Valida a forma estrutural mínima de um `TopologyMap` vindo de `options.map` (JSON editado à mão
 * no dashboard, sem passar por `defaultTopologyMap`/`TopologyEditor`). Sem isso, `nodes`/`links`
 * fora do formato esperado quebram silenciosamente o cálculo de layout e o fit inicial do canvas
 * (ver `didInitialFitRef` em `TopologyCanvas.tsx`, que nunca dispara com `width`/`height` inválidos).
 *
 * Retorna a lista de problemas encontrados (vazia = mapa válido). Não corrige nem substitui nada —
 * quem chama decide como mostrar o erro (ver `no-fallbacks.mdc`).
 */
export function validateTopologyMap(map: TopologyMap | null | undefined): string[] {
  const errors: string[] = [];
  if (!map || typeof map !== 'object') {
    errors.push('O mapa (options.map) não é um objeto válido.');
    return errors;
  }
  if (!Array.isArray(map.nodes)) {
    errors.push('"nodes" não é uma lista (array).');
  }
  if (!Array.isArray(map.links)) {
    errors.push('"links" não é uma lista (array).');
  }
  if (typeof map.width !== 'number' || !Number.isFinite(map.width) || map.width <= 0) {
    errors.push('"width" precisa ser um número maior que zero.');
  }
  if (typeof map.height !== 'number' || !Number.isFinite(map.height) || map.height <= 0) {
    errors.push('"height" precisa ser um número maior que zero.');
  }
  return errors;
}
