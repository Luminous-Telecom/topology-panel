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
  if (state.status !== 'blocked') {
    return <>{children}</>;
  }

  return (
    <div className={styles.shell} style={{ width, height }} role="alert" aria-live="assertive">
      <div className={`${overlayCardStyle} ${styles.card}`}>
        <div className={overlayCardHeaderStyle}>Licença</div>
        <div className={styles.body}>
          <div className={`${styles.icon} ${styles.iconBlocked}`}>
            <Icon name="lock" size="lg" />
          </div>
          <h2 className={styles.title}>Licença necessária</h2>
          <p className={styles.message}>{state.message}</p>
        </div>
      </div>
    </div>
  );
}
