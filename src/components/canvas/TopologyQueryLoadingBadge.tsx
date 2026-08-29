import React from 'react';
import { Icon } from '@grafana/ui';
import styles from './TopologyQueryLoadingBadge.module.scss';

/** Aviso honesto enquanto a consulta real de status ainda não concluiu — sem simular online/offline. */
export function TopologyQueryLoadingBadge({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <div className={styles.badge} role="status" aria-live="polite">
      <span className={styles.spinner}>
        <Icon name="sync" size="sm" />
      </span>
      <span className={styles.detail}>Consultando status no Zabbix…</span>
      <span className={styles.short}>Consultando status…</span>
    </div>
  );
}
