import React from 'react';
import { css } from '@emotion/css';
import { Icon } from '@grafana/ui';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface Props {
  breadcrumb: string[];
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

const barStyle = css`
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: min(60vw, 520px);
  pointer-events: auto;
`;

const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(0,0,0,0.45)',
  color: '#fff',
  fontSize: 11,
  cursor: 'pointer',
};

const btnDisabled: React.CSSProperties = {
  ...btnStyle,
  opacity: 0.35,
  cursor: 'default',
};

const crumbStyle = css`
  margin-left: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

/** Voltar/avançar e breadcrumb da navegação hierárquica de submapas internos. */
export function MapNavigationControls({
  breadcrumb,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: Props) {
  const visible = canGoBack || canGoForward || breadcrumb.length > 0;

  useEscapeKey(onBack, visible && canGoBack);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={barStyle}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        style={canGoBack ? btnStyle : btnDisabled}
        title="Voltar (Esc)"
        aria-label="Voltar"
        disabled={!canGoBack}
        onClick={(e) => {
          e.stopPropagation();
          if (canGoBack) {
            onBack();
          }
        }}
      >
        <Icon name="arrow-left" size="sm" />
      </button>
      <button
        type="button"
        style={canGoForward ? btnStyle : btnDisabled}
        title="Avançar"
        aria-label="Avançar"
        disabled={!canGoForward}
        onClick={(e) => {
          e.stopPropagation();
          if (canGoForward) {
            onForward();
          }
        }}
      >
        <Icon name="arrow-right" size="sm" />
      </button>
      {breadcrumb.length > 0 ? (
        <div className={crumbStyle} title={breadcrumb.join(' › ')}>
          {breadcrumb.join(' › ')}
        </div>
      ) : null}
    </div>
  );
}
