import { TopologyMap, defaultTopologyMap } from '../types';

/**
 * Valida a forma estrutural mínima de um `TopologyMap` vindo de `options.map` (JSON editado à mão
 * no dashboard, sem passar por `defaultTopologyMap`/`TopologyEditor`). Sem isso, `nodes`/`links`
 * fora do formato esperado quebram silenciosamente o cálculo de layout e o fit inicial do canvas
 * (`lastFitViewportRef` em `TopologyCanvas.tsx` não encaixa com viewport 0).
 *
 * Retorna a lista de problemas encontrados (vazia = mapa válido). Não corrige nem substitui nada —
 * quem chama decide como mostrar o erro.
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

/**
 * Painel novo: o Grafana aninha `options.map` como `{}` (sem nodes/links/width/height).
 * Isso não é JSON editado à mão — o canvas e o editor usam o mapa padrão.
 */
export function isUninitializedTopologyMap(map: unknown): boolean {
  if (map == null) {
    return true;
  }
  if (typeof map !== 'object' || Array.isArray(map)) {
    return false;
  }
  const rec = map as { nodes?: unknown; links?: unknown; width?: unknown; height?: unknown };
  const hasNodes = Array.isArray(rec.nodes);
  const hasLinks = Array.isArray(rec.links);
  const hasWidth = typeof rec.width === 'number' && Number.isFinite(rec.width) && rec.width > 0;
  const hasHeight = typeof rec.height === 'number' && Number.isFinite(rec.height) && rec.height > 0;
  return !hasNodes && !hasLinks && !hasWidth && !hasHeight;
}

/**
 * Mapa usável no editor da aba de opções. Painel novo no Grafana chega com `map` ausente ou `{}`
 * (nested options) — isso não é JSON corrompido pelo usuário; o editor usa o mapa padrão.
 */
export function topologyMapOrDefault(
  ...candidates: Array<TopologyMap | null | undefined>
): TopologyMap {
  for (const candidate of candidates) {
    if (candidate && validateTopologyMap(candidate).length === 0) {
      return candidate;
    }
  }
  return defaultTopologyMap();
}
