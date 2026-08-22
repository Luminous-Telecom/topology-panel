import { css } from '@emotion/css';
import {
  CANVAS_EDGE_GAP,
  COMPACT_TOUCH_MIN,
  MEDIA_COMPACT,
  MEDIA_MEDIUM,
} from '../../utils/canvasOverlayLayout';
import { MAP_NATIVE_SCROLLBAR_PX } from '../../utils/mapBounds';

/** Oculta rótulos longos dos botões da toolbar em telas compactas (mantém ícones). */
export const toolbarLabelStyle = css`
  ${MEDIA_COMPACT} {
    display: none;
  }
`;

export const toolbarOverlayButtonStyle = css`
  pointer-events: auto;

  ${MEDIA_COMPACT} {
    min-height: ${COMPACT_TOUCH_MIN}px;
    min-width: ${COMPACT_TOUCH_MIN}px;
    padding: 6px 8px;
  }
`;

/** Grupo de ferramentas (selecionar / pan) — recebe cliques; o restante da faixa da toolbar é transparente. */
export const toolbarToolGroupStyle = css`
  display: flex;
  align-items: center;
  gap: 4px;
  pointer-events: auto;
`;

export const overlayListItemButtonStyle = css`
  ${MEDIA_COMPACT} {
    min-height: ${COMPACT_TOUCH_MIN}px;
    padding: 8px 10px;
  }
`;

export const overlayFilterChipStyle = css`
  ${MEDIA_COMPACT} {
    min-height: ${COMPACT_TOUCH_MIN}px;
    padding: 6px 10px;
    font-size: 11px;
  }
`;

export const overlayPanelCompactWidth = css`
  width: min(300px, calc(100% - ${CANVAS_EDGE_GAP * 2 + MAP_NATIVE_SCROLLBAR_PX}px));

  ${MEDIA_COMPACT} {
    width: min(340px, calc(100% - ${CANVAS_EDGE_GAP * 2 + MAP_NATIVE_SCROLLBAR_PX}px));
    max-width: calc(100% - ${CANVAS_EDGE_GAP * 2 + MAP_NATIVE_SCROLLBAR_PX}px);
  }
`;

export const overlayPanelNocCompactWidth = css`
  width: min(300px, calc(100% - ${CANVAS_EDGE_GAP * 2}px));

  ${MEDIA_COMPACT} {
    width: calc(100% - ${CANVAS_EDGE_GAP * 2}px);
    max-width: none;
  }
`;

export const overlayPanelCompactMaxHeight = css`
  ${MEDIA_COMPACT} {
    max-height: min(200px, 38vh);
  }
`;

export const overlayNocTopClearance = css`
  top: 44px;

  ${MEDIA_MEDIUM} {
    top: 52px;
  }

  ${MEDIA_COMPACT} {
    top: 96px;
  }
`;
