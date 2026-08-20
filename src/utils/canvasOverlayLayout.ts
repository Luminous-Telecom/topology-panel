/** Espaçamento e medidas dos overlays fixos sobre o canvas (minimapa, listas, toolbar). */
export const CANVAS_EDGE_GAP = 8;

export const MINIMAP_WIDTH = 196;
export const MINIMAP_HEIGHT = 148;

/** Painel estreito — celular em portrait ou Grafana em coluna fina. */
export const MEDIA_COMPACT = '@media (max-width: 640px)';

/** Tablet ou painel Grafana em largura intermediária. */
export const MEDIA_MEDIUM = '@media (max-width: 900px)';

/** Altura mínima de botão/chip em telas compactas (alvo de toque). */
export const COMPACT_TOUCH_MIN = 36;

/** Margem à direita para não cobrir o menu ⋯ do painel Grafana. */
export const GRAFANA_PANEL_MENU_RESERVE = 44;

export function minimapBottomOffset(showMinimap: boolean): number {
  return showMinimap ? CANVAS_EDGE_GAP + MINIMAP_HEIGHT + CANVAS_EDGE_GAP : CANVAS_EDGE_GAP;
}
