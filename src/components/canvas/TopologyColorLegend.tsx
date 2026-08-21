import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { useTheme2 } from '@grafana/ui';
import { CANVAS_EDGE_GAP, MEDIA_COMPACT, MEDIA_MEDIUM } from '../../utils/canvasOverlayLayout';
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
  max-width: calc(100% - ${CANVAS_EDGE_GAP * 2}px);

  ${MEDIA_MEDIUM} {
    top: auto;
    bottom: ${CANVAS_EDGE_GAP}px;
    right: ${CANVAS_EDGE_GAP}px;
    transform: none;
    min-width: 0;
    max-width: min(220px, calc(100% - ${CANVAS_EDGE_GAP * 2}px));
  }

  ${MEDIA_COMPACT} {
    top: 96px;
    bottom: auto;
    right: ${CANVAS_EDGE_GAP}px;
    padding: 8px 10px;
    gap: 5px;
    max-width: calc(100% - ${CANVAS_EDGE_GAP * 2}px);
  }
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

  ${MEDIA_COMPACT} {
    font-size: 11px;
    gap: 8px;
    white-space: normal;
  }
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

  ${MEDIA_COMPACT} {
    white-space: normal;
    font-size: 10px;
  }
`;

export function TopologyColorLegend({
  items,
  refreshIntervalSec = null,
  refreshResetKey,
}: {
  items: TopologyLegendItem[];
  refreshIntervalSec?: number | null;
  /** Muda a cada busca boa de tráfego — reinicia o contador local para `refreshIntervalSec`. */
  refreshResetKey?: unknown;
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
