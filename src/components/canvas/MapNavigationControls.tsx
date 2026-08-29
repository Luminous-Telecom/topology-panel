import React from 'react';
import { Icon } from '@grafana/ui';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { TopologyBreadcrumbItem } from '../../utils/topologyMapNavigation';
import styles from './MapNavigationControls.module.scss';

interface Props {
  breadcrumb: TopologyBreadcrumbItem[];
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onHomeClick?: () => void;
  /** Desce a barra no compacto para não cobrir a toolbar. Quiosque (sem toolbar) fica no topo. */
  compactBelowToolbar?: boolean;
}

/** Voltar/avançar e breadcrumb da navegação hierárquica de submapas internos. */
export function MapNavigationControls({
  breadcrumb,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onHomeClick,
  compactBelowToolbar = true,
}: Props) {
  const visible = canGoBack || canGoForward || breadcrumb.length > 0;

  useEscapeKey(onBack, visible && canGoBack);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={compactBelowToolbar ? `${styles.bar} ${styles.barBelowToolbar}` : styles.bar}
      data-topology-chrome
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={canGoBack ? styles.navBtn : `${styles.navBtn} ${styles.navBtnDisabled}`}
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
        className={canGoForward ? styles.navBtn : `${styles.navBtn} ${styles.navBtnDisabled}`}
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
        <div className={styles.crumbBar} title={breadcrumb.map((item) => item.label).join(' › ')}>
          {breadcrumb.map((item, index) => {
            const isLast = index === breadcrumb.length - 1;
            return (
              <div key={item.mapId} className={styles.crumbSegment}>
                {index > 0 ? <span className={styles.crumbSeparator} aria-hidden="true">›</span> : null}
                {isLast || !onHomeClick ? (
                  <span className={styles.crumbCurrent}>{item.label}</span>
                ) : (
                  <button
                    type="button"
                    className={styles.crumbLink}
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
