import React from 'react';
import { css } from '@emotion/css';
import { Icon } from '@grafana/ui';

const queryErrorBadgeStyle = css`
  position: absolute;
  top: 8px;
  left: 8px;
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
`;

/** Aviso discreto (não bloqueia o mapa) quando a Query do painel falhou — status ao vivo indisponível. */
export function TopologyQueryErrorBadge({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <div className={queryErrorBadgeStyle} role="status">
      <Icon name="exclamation-triangle" size="sm" />
      <span>Falha na Query do painel — sem status ao vivo dos hosts.</span>
    </div>
  );
}
