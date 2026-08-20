import React from 'react';
import { css } from '@emotion/css';
import { Icon } from '@grafana/ui';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { TopologyBreadcrumbItem } from '../../utils/topologyMapNavigation';

interface Props {
  breadcrumb: TopologyBreadcrumbItem[];
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onHomeClick?: () => void;
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

const crumbBarStyle = css`
  display: flex;
  align-items: stretch;
  min-width: 0;
  margin-left: 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.2);
  overflow: hidden;
`;

const crumbSegmentStyle = css`
  display: flex;
  align-items: center;
  min-width: 0;
`;

const crumbLinkStyle = css`
  display: block;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }
`;

const crumbCurrentStyle = css`
  display: block;
  padding: 4px 8px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const crumbSeparatorStyle = css`
  display: flex;
  align-items: center;
  padding: 0 2px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 10px;
  user-select: none;
`;

/** Voltar/avançar e breadcrumb da navegação hierárquica de submapas internos. */
export function MapNavigationControls({
  breadcrumb,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onHomeClick,
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
        <div className={crumbBarStyle} title={breadcrumb.map((item) => item.label).join(' › ')}>
          {breadcrumb.map((item, index) => {
            const isLast = index === breadcrumb.length - 1;
            return (
              <div key={item.mapId} className={crumbSegmentStyle}>
                {index > 0 ? <span className={crumbSeparatorStyle} aria-hidden="true">›</span> : null}
                {isLast || !onHomeClick ? (
                  <span className={crumbCurrentStyle}>{item.label}</span>
                ) : (
                  <button
                    type="button"
                    className={crumbLinkStyle}
                    title={`Ir para ${item.label}`}
                    aria-label={`Ir para ${item.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onHomeClick();
                    }}
                  >
                    {item.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
