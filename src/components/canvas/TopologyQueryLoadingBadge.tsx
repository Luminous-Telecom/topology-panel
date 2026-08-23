import React from 'react';
import { css, keyframes } from '@emotion/css';
import { Icon } from '@grafana/ui';
import { CANVAS_EDGE_GAP, MEDIA_COMPACT, MEDIA_MEDIUM } from '../../utils/canvasOverlayLayout';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const queryLoadingBadgeStyle = css`
  position: absolute;
  top: ${CANVAS_EDGE_GAP}px;
  left: ${CANVAS_EDGE_GAP}px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(30, 30, 30, 0.82);
  color: #fff;
  font-size: 11px;
  line-height: 1.3;
  max-width: 280px;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);

  ${MEDIA_MEDIUM} {
    top: 48px;
    max-width: min(280px, calc(100% - ${CANVAS_EDGE_GAP * 2}px));
  }

  ${MEDIA_COMPACT} {
    top: 96px;
    max-width: calc(100% - ${CANVAS_EDGE_GAP * 2}px);
  }
`;

const spinnerStyle = css`
  animation: ${spin} 1s linear infinite;
`;

const queryLoadingDetailStyle = css`
  ${MEDIA_COMPACT} {
    display: none;
  }
`;

const queryLoadingShortStyle = css`
  display: none;

  ${MEDIA_COMPACT} {
    display: inline;
  }
`;

/** Aviso honesto enquanto a consulta real de status ainda não concluiu — sem simular online/offline. */
export function TopologyQueryLoadingBadge({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <div className={queryLoadingBadgeStyle} role="status" aria-live="polite">
      <span className={spinnerStyle}>
        <Icon name="sync" size="sm" />
      </span>
      <span className={queryLoadingDetailStyle}>Consultando status no Zabbix…</span>
      <span className={queryLoadingShortStyle}>Consultando status…</span>
    </div>
  );
}
