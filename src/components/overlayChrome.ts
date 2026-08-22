import { css } from '@emotion/css';

/** Tokens visuais compartilhados — modais Grafana e overlays do mapa. */
export const OVERLAY_RADIUS = 8;
export const OVERLAY_BG = 'rgba(13, 17, 23, 0.92)';
export const OVERLAY_BORDER = '1px solid rgba(255, 255, 255, 0.22)';
export const OVERLAY_SHADOW = '0 8px 24px rgba(0, 0, 0, 0.45)';
export const OVERLAY_TEXT = '#f2f4f7';
export const OVERLAY_MUTED = 'rgba(255, 255, 255, 0.68)';
export const OVERLAY_DIVIDER = '1px solid rgba(255, 255, 255, 0.12)';
export const OVERLAY_HOVER = 'rgba(79, 195, 247, 0.18)';

/** Casca dos `Modal` do Grafana — mesma largura e padding em todo o plugin. */
export const grafanaModalClass = css`
  && {
    width: 500px;
    max-width: min(500px, 94vw);
    border-radius: ${OVERLAY_RADIUS}px;
    overflow: hidden;
  }
`;

export const grafanaModalContentClass = css`
  && {
    padding: 12px 16px 8px;
  }
`;

export const modalHintStyle = css`
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.8;
`;

export const modalErrorStyle = css`
  color: var(--error-text);
  margin-bottom: 8px;
  font-size: 12px;
`;

/** Cartão flutuante no mapa (legenda, alertas, NOC, tráfego, busca, hover). */
export const overlayCardStyle = css`
  border-radius: ${OVERLAY_RADIUS}px;
  background: ${OVERLAY_BG};
  border: ${OVERLAY_BORDER};
  box-shadow: ${OVERLAY_SHADOW};
  color: ${OVERLAY_TEXT};
  overflow: hidden;
`;

export const overlayCardBarStyle = css`
  padding: 8px 12px;
  border-bottom: ${OVERLAY_DIVIDER};
`;

export const overlayCardHeaderStyle = css`
  padding: 8px 12px;
  border-bottom: ${OVERLAY_DIVIDER};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${OVERLAY_MUTED};
  line-height: 1.3;
`;

export const overlayCardBodyStyle = css`
  padding: 10px 12px;
`;

export const overlayCardFooterStyle = css`
  padding: 8px 12px;
  border-top: ${OVERLAY_DIVIDER};
`;

export const overlayMutedStyle = css`
  color: ${OVERLAY_MUTED};
  font-size: 11px;
  line-height: 1.35;
`;

export const overlayMetricRowStyle = css`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  line-height: 1.5;
`;

export const overlayMetricLabelStyle = css`
  opacity: 0.7;
`;

export const overlayMetricValueStyle = css`
  font-weight: 500;
  text-align: right;
`;

export const overlayListStyle = css`
  margin: 0;
  padding: 4px 0;
  list-style: none;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
`;

export const overlayListButtonStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: ${OVERLAY_TEXT};
  font-size: 12px;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${OVERLAY_HOVER};
  }
`;
