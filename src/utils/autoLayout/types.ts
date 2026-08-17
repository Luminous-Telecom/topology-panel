/** Modos de organização automática do mapa. */
export type AutoLayoutMode =
  | 'hierarchical-down'
  | 'hierarchical-up'
  | 'hierarchical-right'
  | 'hierarchical-left'
  | 'radial'
  | 'grid';

export interface AutoLayoutApplyOptions {
  mode: AutoLayoutMode;
  gridStep: number;
  /** Quando falso, nós com `positionMode !== 'auto'` não são movidos. */
  includeManualPositions: boolean;
  snapToGrid?: boolean;
  contentMargin?: number;
}

export interface AutoLayoutApplyResult {
  movedCount: number;
  skippedManualCount: number;
}

export const AUTO_LAYOUT_MODE_LABELS: Record<AutoLayoutMode, string> = {
  'hierarchical-down': 'Hierárquico (topo → baixo)',
  'hierarchical-up': 'Hierárquico (baixo → topo)',
  'hierarchical-right': 'Hierárquico (esquerda → direita)',
  'hierarchical-left': 'Hierárquico (direita → esquerda)',
  radial: 'Radial (hub central)',
  grid: 'Grade uniforme',
};
