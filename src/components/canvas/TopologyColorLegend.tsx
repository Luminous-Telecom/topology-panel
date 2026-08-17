import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { useTheme2 } from '@grafana/ui';
import { resolvePanelColor } from '../../utils/panelColors';

const legendStyle = css`
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  min-width: 132px;
`;

const legendTitleStyle = css`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.72);
  margin-bottom: 2px;
`;

const legendItemStyle = css`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #fff;
  line-height: 1.2;
  white-space: nowrap;
`;

const legendSwatchStyle = css`
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.45);
  box-sizing: border-box;
`;

type TopologyLegendItem = { label: string; color: string };

const legendCountdownStyle = css`
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.3;
  white-space: nowrap;
`;

export function TopologyColorLegend({
  items,
  refreshIntervalSec = null,
  refreshResetKey,
}: {
  items: TopologyLegendItem[];
  refreshIntervalSec?: number | null;
  /** Muda a cada refresh de verdade da Query — reinicia o contador local para `refreshIntervalSec`. */
  refreshResetKey?: unknown;
}) {
  const theme = useTheme2();
  const visible = items
    .map((item) => ({ label: item.label, color: resolvePanelColor(theme, item.color) }))
    .filter((item) => Boolean(item.color));

  // Contador local, isolado do resto do mapa: sem isto, o tick de 1s subia até o `TopologyPanel`
  // e forçava um re-render do `TopologyCanvas` inteiro a cada segundo (ver auto-deploy.mdc /
  // pontos prioritários de performance do arraste).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshIntervalSec, refreshResetKey]);

  const countdownLabel =
    refreshIntervalSec == null ? 'Atualização: manual' : `Atualiza em ${countdown ?? refreshIntervalSec}s`;

  if (visible.length === 0) {
    // Ainda mostra o contador mesmo sem itens de legenda
    return (
      <div className={legendStyle} aria-label="Atualização do mapa">
        <div className={legendCountdownStyle} style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          {countdownLabel}
        </div>
      </div>
    );
  }
  return (
    <div className={legendStyle} aria-label="Legenda de cores">
      <div className={legendTitleStyle}>Legenda</div>
      {visible.map((item) => (
        <div key={item.label} className={legendItemStyle}>
          <span className={legendSwatchStyle} style={{ background: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
      <div className={legendCountdownStyle}>{countdownLabel}</div>
    </div>
  );
}
