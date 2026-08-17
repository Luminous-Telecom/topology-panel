import { TopologyView } from '../types';
import { clamp } from './mapCoords';

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;
/** Passo do zoom por "clique" da roda do mouse. */
export const WHEEL_ZOOM_STEP = 0.1;

/**
 * Zoom mantendo fixo o ponto do mapa que está sob o cursor (`mx`/`my` já em coordenadas do
 * elemento, não da tela).
 */
export function zoomAtPoint(from: TopologyView, mx: number, my: number, nextScale: number): TopologyView {
  const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
  return {
    scale,
    x: mx - ((mx - from.x) * scale) / from.scale,
    y: my - ((my - from.y) * scale) / from.scale,
  };
}

/** Roda para baixo afasta, para cima aproxima. */
export function wheelZoom(from: TopologyView, mx: number, my: number, deltaY: number): TopologyView {
  const factor = deltaY > 0 ? 1 - WHEEL_ZOOM_STEP : 1 + WHEEL_ZOOM_STEP;
  return zoomAtPoint(from, mx, my, from.scale * factor);
}

export interface PinchStart {
  dist: number;
  midX: number;
  midY: number;
  view: TopologyView;
}

/**
 * Zoom + pan de dois dedos: a escala segue a razão entre as distâncias e o mapa acompanha o meio
 * dos dedos, para o conteúdo não escapar por baixo da mão.
 */
export function pinchZoom(start: PinchStart, dist: number, midX: number, midY: number): TopologyView {
  const scale = clamp(start.view.scale * (dist / start.dist), MIN_SCALE, MAX_SCALE);
  return {
    scale,
    x: midX - ((start.midX - start.view.x) * scale) / start.view.scale,
    y: midY - ((start.midY - start.view.y) * scale) / start.view.scale,
  };
}
