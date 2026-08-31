import React from 'react';
import { Icon } from '@grafana/ui';
import type { LicenseCheckState } from '../hooks/useLicenseValidation';
import { overlayCardHeaderStyle, overlayCardStyle } from './chrome/overlayChrome';
import styles from './LicenseGate.module.scss';

export function LicenseGate({
  state,
  width,
  height,
  children,
}: {
  state: LicenseCheckState;
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  if (state.status === 'skipped' || state.status === 'valid') {
    return <>{children}</>;
  }

  const loading = state.status === 'loading';
  const title = loading ? 'Validando licença…' : 'Licença necessária';
  const body = loading
    ? 'Consultando a loja. O mapa abre quando a chave for aceita.'
    : state.message;

  return (
    <div
      className={styles.shell}
      style={{ width, height }}
      role={loading ? 'status' : 'alert'}
      aria-live={loading ? 'polite' : 'assertive'}
    >
      <div className={`${overlayCardStyle} ${styles.card}`}>
        <div className={overlayCardHeaderStyle}>Licença</div>
        <div className={styles.body}>
          <div className={`${styles.icon} ${loading ? '' : styles.iconBlocked}`}>
            <span className={loading ? styles.spinner : undefined}>
              <Icon name={loading ? 'sync' : 'lock'} size="lg" />
            </span>
          </div>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.message}>{body}</p>
        </div>
      </div>
    </div>
  );
}
