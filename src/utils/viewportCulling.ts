import { TopologyView } from '../types';

/**
 * Recorte por viewport: quais caixas precisam existir no DOM.
 *
 * O `<g>` do canvas já move o mapa inteiro por `transform`, então pan e zoom **não** re-renderizam
 * as camadas. Recortar pela viewport só pode manter essa propriedade: se o retângulo visível
 * mudasse a cada pixel de pan, a camada voltaria a reconciliar os quinhentos nós por frame e o
 * recorte sairia mais caro que o problema.
 *
 * Por isso o retângulo é alinhado a uma grade grossa (`tile`) depois de expandido pela margem: o
 * conjunto visível só muda ao cruzar uma linha dessa grade, e não a cada frame.
 */
export interface WorldRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BoxLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Margem de segurança, em pixels de tela, para o nó já estar montado quando entra na viewport. */
export const CULL_MARGIN_PX = 400;

/** Lado da grade de alinhamento, em unidades do mundo. */
export const CULL_TILE = 512;

/**
 * A partir de quantos nós o recorte compensa. Abaixo disso o mapa inteiro cabe em poucos milhares
 * de elementos e filtrar só adiciona trabalho.
 */
export const CULL_MIN_NODES = 150;

/** `-0` normalizado para `0`: as bordas viram dependência de `useMemo`, e `Object.is(-0, 0)` é falso. */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function snapDown(value: number, tile: number): number {
  return normalizeZero(Math.floor(value / tile) * tile);
}

function snapUp(value: number, tile: number): number {
  return normalizeZero(Math.ceil(value / tile) * tile);
}

/**
 * Retângulo do mundo coberto pela viewport, com margem e alinhado à grade.
 *
 * `view` leva mundo para tela por `tela = mundo * scale + view.{x,y}`, então o inverso é
 * `mundo = (tela - view.{x,y}) / scale`.
 */
export function visibleWorldRect(
  view: TopologyView,
  viewport: { w: number; h: number },
  marginPx: number = CULL_MARGIN_PX,
  tile: number = CULL_TILE
): WorldRect {
  const scale = view.scale > 0 ? view.scale : 1;
  const x0 = (-marginPx - view.x) / scale;
  const y0 = (-marginPx - view.y) / scale;
  const x1 = (viewport.w + marginPx - view.x) / scale;
  const y1 = (viewport.h + marginPx - view.y) / scale;
  return {
    x0: snapDown(x0, tile),
    y0: snapDown(y0, tile),
    x1: snapUp(x1, tile),
    y1: snapUp(y1, tile),
  };
}

/**
 * Caixa e retângulo se cruzam (bordas encostando contam como visível).
 *
 * Caixa com número não finito conta como visível: não dá para provar que está fora, e recortar no
 * escuro faria o nó **sumir** do mapa — inclusive o nó que está sendo arrastado, se a posição do
 * gesto ainda não é um número válido.
 */
export function boxIntersectsRect(box: BoxLike, rect: WorldRect): boolean {
  if (!Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.w) || !Number.isFinite(box.h)) {
    return true;
  }
  return box.x <= rect.x1 && box.x + box.w >= rect.x0 && box.y <= rect.y1 && box.y + box.h >= rect.y0;
}

/**
 * Caixa que envolve um cabo: as duas pontas mais os waypoints.
 *
 * Um cabo entre dois nós fora da tela ainda pode atravessá-la, então o teste é pela caixa do
 * próprio cabo — nunca pela visibilidade das pontas.
 */
export function linkBoundingBox(
  from: BoxLike | undefined,
  to: BoxLike | undefined,
  waypoints: ReadonlyArray<{ x: number; y: number }>
): BoxLike | undefined {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const box of [from, to]) {
    if (!box) {
      continue;
    }
    xs.push(box.x, box.x + box.w);
    ys.push(box.y, box.y + box.h);
  }
  for (const point of waypoints) {
    xs.push(point.x);
    ys.push(point.y);
  }
  if (xs.length === 0) {
    return undefined;
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
