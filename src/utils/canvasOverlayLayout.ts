import { MAP_NATIVE_SCROLLBAR_PX } from './mapBounds';

/** Espaçamento e medidas dos overlays fixos sobre o canvas (minimapa, listas, toolbar). */
export const CANVAS_EDGE_GAP = 8;

/** Largura da legenda no canto inferior direito — a lista de alertas reserva isso no compacto. */
export const LEGEND_DOCK_WIDTH = 148;

export const MINIMAP_WIDTH = 196;
export const MINIMAP_HEIGHT = 148;

/** Painel estreito — celular em portrait ou Grafana em coluna fina. */
export const MEDIA_COMPACT = '@media (max-width: 640px)';
export const COMPACT_CANVAS_MAX_PX = 640;

export function isCompactCanvasWidth(width: number): boolean {
  return Number.isFinite(width) && width > 0 && width <= COMPACT_CANVAS_MAX_PX;
}

/** Tablet ou painel Grafana em largura intermediária. */
export const MEDIA_MEDIUM = '@media (max-width: 900px)';

/** Altura mínima de botão/chip em telas compactas (alvo de toque). */
export const COMPACT_TOUCH_MIN = 36;

/** Margem à direita para não cobrir o menu ⋯ do painel Grafana. */
export const GRAFANA_PANEL_MENU_RESERVE = 44;

export function minimapBottomOffset(showMinimap: boolean): number {
  if (showMinimap) {
    return CANVAS_EDGE_GAP + MINIMAP_HEIGHT + CANVAS_EDGE_GAP;
  }
  // Sem minimapa a lista senta na borda de baixo — precisa ficar acima da barra nativa.
  return CANVAS_EDGE_GAP + MAP_NATIVE_SCROLLBAR_PX;
}
