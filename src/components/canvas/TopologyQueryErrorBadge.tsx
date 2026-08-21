import React from 'react';
import { css } from '@emotion/css';
import { Icon } from '@grafana/ui';
import { CANVAS_EDGE_GAP, MEDIA_COMPACT, MEDIA_MEDIUM } from '../../utils/canvasOverlayLayout';

const queryErrorBadgeStyle = css`
  position: absolute;
  top: ${CANVAS_EDGE_GAP}px;
  left: ${CANVAS_EDGE_GAP}px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(198, 40, 40, 0.85);
  color: #fff;
  font-size: 11px;
  line-height: 1.3;
  max-width: 260px;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);

  ${MEDIA_MEDIUM} {
    top: 48px;
    max-width: min(260px, calc(100% - ${CANVAS_EDGE_GAP * 2}px));
  }

  ${MEDIA_COMPACT} {
    top: 96px;
    max-width: calc(100% - ${CANVAS_EDGE_GAP * 2}px);
  }
`;

const queryErrorDetailStyle = css`
  ${MEDIA_COMPACT} {
    display: none;
  }
`;

const queryErrorShortStyle = css`
  display: none;

  ${MEDIA_COMPACT} {
    display: inline;
  }
`;

/** Aviso discreto (não bloqueia o mapa) quando a fonte de dados falhou — status ao vivo indisponível. */
export function TopologyQueryErrorBadge({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <div className={queryErrorBadgeStyle} role="status">
      <Icon name="exclamation-triangle" size="sm" />
      <span className={queryErrorDetailStyle}>
        Falha na fonte de dados — sem status ao vivo dos hosts.
      </span>
      <span className={queryErrorShortStyle}>Fonte falhou — sem status ao vivo.</span>
    </div>
  );
}
