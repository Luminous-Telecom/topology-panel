import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { useTheme2 } from '@grafana/ui';
import { CANVAS_EDGE_GAP, MEDIA_COMPACT, MEDIA_MEDIUM } from '../../utils/canvasOverlayLayout';
import { resolvePanelColor } from '../../utils/panelColors';
import { overlayCardBodyStyle, overlayCardHeaderStyle, overlayCardStyle, overlayMutedStyle } from '../overlayChrome';

const legendStyle = css`
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  z-index: 20;
  pointer-events: none;
  min-width: 148px;
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
    max-width: calc(100% - ${CANVAS_EDGE_GAP * 2}px);
  }
`;

const legendBodyStyle = css`
  display: flex;
  flex-direction: column;
  gap: 7px;

  ${MEDIA_COMPACT} {
    gap: 5px;
    padding: 8px 10px;
  }
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
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  white-space: nowrap;

  ${MEDIA_COMPACT} {
    white-space: normal;
    font-size: 10px;
  }
`;

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
      <div className={`${overlayCardStyle} ${legendStyle}`} aria-label="Atualização do mapa">
        <div className={`${overlayCardBodyStyle} ${legendBodyStyle}`}>
          <div className={`${overlayMutedStyle} ${legendCountdownStyle}`} style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            {countdownLabel}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`${overlayCardStyle} ${legendStyle}`} aria-label="Legenda de cores">
      <div className={overlayCardHeaderStyle}>Legenda</div>
      <div className={`${overlayCardBodyStyle} ${legendBodyStyle}`}>
        {visible.map((item) => (
          <div key={item.label} className={legendItemStyle}>
            <span className={legendSwatchStyle} style={{ background: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
        <div className={`${overlayMutedStyle} ${legendCountdownStyle}`}>{countdownLabel}</div>
      </div>
    </div>
  );
}
