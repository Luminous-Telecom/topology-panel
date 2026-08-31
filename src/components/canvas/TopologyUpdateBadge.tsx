import React from 'react';
import styles from './TopologyUpdateBadge.module.scss';

/** Aviso quando a loja tem uma versão mais nova que a instalada neste Grafana. */
export function TopologyUpdateBadge({ storeVersion }: { storeVersion?: string }) {
  if (!storeVersion) {
    return null;
  }
  return (
    <div className={styles.badge} role="status">
      Atualização {storeVersion} disponível na loja
    </div>
  );
}
