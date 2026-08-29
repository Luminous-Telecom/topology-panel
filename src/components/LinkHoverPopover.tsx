import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  overlayCardBodyStyle,
  overlayCardStyle,
  overlayMetricLabelStyle,
  overlayMetricRowStyle,
  overlayMetricValueStyle,
  overlayMutedStyle,
} from './chrome/overlayChrome';
import { LinkHoverTooltipModel } from '../utils/linkHoverTooltip';
import { clampFixedOverlayPosition, overlayPortalRoot } from '../utils/overlayPortal';
import styles from './LinkHoverPopover.module.scss';

interface Props {
  model: LinkHoverTooltipModel;
  screenX: number;
  screenY: number;
  uploadColor: string;
  downloadColor: string;
  statusColor: string;
}

function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={overlayMetricRowStyle}>
      <span className={overlayMetricLabelStyle}>{label}</span>
      <span className={overlayMetricValueStyle}>{value}</span>
    </div>
  );
}

/** Tooltip do cabo no chrome do painel — substitui o `<title>` nativo do SVG. */
export function LinkHoverPopover({
  model,
  screenX,
  screenY,
  uploadColor,
  downloadColor,
  statusColor,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: screenX + 12, top: screenY + 12 });

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    setPosition(
      clampFixedOverlayPosition(screenX, screenY, rect, {
        width: window.innerWidth,
        height: window.innerHeight,
      })
    );
  }, [screenX, screenY, model.fromLabel, model.toLabel, model.upload, model.download, model.signalTx, model.signalRx, model.errors, model.drops, model.status]);

  return createPortal(
    <div
      ref={popoverRef}
      className={`${overlayCardStyle} ${overlayCardBodyStyle} ${styles.panel}`}
      style={{ left: position.left, top: position.top }}
      role="tooltip"
    >
      <div className={styles.endpoints}>
        <strong>{model.fromLabel}</strong>
        <span className={`${overlayMutedStyle} ${styles.arrow}`}>↕</span>
        <strong>{model.toLabel}</strong>
      </div>
      {model.interfaces ? <div className={overlayMutedStyle}>{model.interfaces}</div> : null}

      <div className={styles.metrics}>
        {model.capacity ? <MetricRow label="Capacidade" value={model.capacity} /> : null}
        {model.upload ? (
          <MetricRow
            label="Upload"
            value={
              <>
                <span className={styles.arrowTx} style={{ color: uploadColor }}>
                  ↑
                </span>
                {model.upload}
              </>
            }
          />
        ) : null}
        {model.download ? (
          <MetricRow
            label="Download"
            value={
              <>
                <span className={styles.arrowRx} style={{ color: downloadColor }}>
                  ↓
                </span>
                {model.download}
              </>
            }
          />
        ) : null}
        {model.utilTx ? <MetricRow label="Util. TX" value={model.utilTx} /> : null}
        {model.utilRx ? <MetricRow label="Util. RX" value={model.utilRx} /> : null}
        {model.signalTx ? (
          <MetricRow
            label="Sinal TX"
            value={
              <>
                <span className={styles.arrowTx} style={{ color: uploadColor }}>
                  ↑
                </span>
                {model.signalTx}
              </>
            }
          />
        ) : null}
        {model.signalRx ? (
          <MetricRow
            label="Sinal RX"
            value={
              <>
                <span className={styles.arrowRx} style={{ color: downloadColor }}>
                  ↓
                </span>
                {model.signalRx}
              </>
            }
          />
        ) : null}
        {model.errors ? <MetricRow label="Erros" value={model.errors} /> : null}
        {model.drops ? <MetricRow label="Drops" value={model.drops} /> : null}
        {model.status ? (
          <MetricRow label="Status" value={<span style={{ color: statusColor }}>{model.status}</span>} />
        ) : null}
      </div>
    </div>,
    overlayPortalRoot()
  );
}