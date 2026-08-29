import React from 'react';
import { Icon } from '@grafana/ui';
import styles from './TopologyQueryErrorBadge.module.scss';

/** Aviso discreto (não bloqueia o mapa) quando a fonte de dados falhou — status ao vivo indisponível. */
export function TopologyQueryErrorBadge({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <div className={styles.badge} role="status">
      <Icon name="exclamation-triangle" size="sm" />
      <span className={styles.detail}>
        Falha na fonte de dados — sem status ao vivo dos hosts.
      </span>
      <span className={styles.short}>Fonte falhou — sem status ao vivo.</span>
    </div>
  );
}
