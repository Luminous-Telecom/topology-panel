import React, { useEffect, useState } from 'react';
import { useTheme2 } from '@grafana/ui';
import { resolvePanelColor } from '../../utils/panelColors';
import { overlayCardBodyStyle, overlayCardHeaderStyle, overlayCardStyle, overlayMutedStyle } from '../chrome/overlayChrome';
import styles from './TopologyColorLegend.module.scss';

type TopologyLegendItem = { label: string; color: string };

export function TopologyColorLegend({
  items,
  refreshIntervalSec = null,
}: {
  items: TopologyLegendItem[];
  refreshIntervalSec?: number | null;
}) {
  const theme = useTheme2();
  const visible = items
    .map((item) => ({ label: item.label, color: resolvePanelColor(theme, item.color) }))
    .filter((item) => Boolean(item.color));

  // Contador local, isolado do resto do mapa: sem isto, o tick de 1s subia até o `TopologyPanel`
  // e forçava um re-render do `TopologyCanvas` inteiro a cada segundo.
  const [countdown, setCountdown] = useState<number | null>(refreshIntervalSec);
  useEffect(() => {
    if (refreshIntervalSec == null) {
      setCountdown(null);
      return;
    }
    setCountdown(refreshIntervalSec);
    const id = window.setInterval(() => {
      setCountdown((c) => (c == null || c <= 1 ? refreshIntervalSec : c - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [refreshIntervalSec]);

  const countdownLabel =
    refreshIntervalSec == null ? 'Atualização: manual' : `Atualiza em ${countdown ?? refreshIntervalSec}s`;

  if (visible.length === 0) {
    // Ainda mostra o contador mesmo sem itens de legenda
    return (
      <div className={`${overlayCardStyle} ${styles.legend}`} data-topology-legend aria-label="Atualização do mapa">
        <div className={`${overlayCardBodyStyle} ${styles.body}`}>
          <div className={`${overlayMutedStyle} ${styles.countdown} ${styles.countdownSolo}`}>
            {countdownLabel}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`${overlayCardStyle} ${styles.legend}`} data-topology-legend aria-label="Legenda de cores">
      <div className={overlayCardHeaderStyle}>Legenda</div>
      <div className={`${overlayCardBodyStyle} ${styles.body}`}>
        {visible.map((item) => (
          <div key={item.label} className={styles.item}>
            <span className={styles.swatch} style={{ background: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
        <div className={`${overlayMutedStyle} ${styles.countdown}`}>{countdownLabel}</div>
      </div>
    </div>
  );
}
