import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import {
  alertListHoverText,
  HostAlertListEntry,
  visibleHostProblemNames,
} from '../../utils/noc/topologyFilters';
import { CANVAS_EDGE_GAP, minimapBottomOffset, MEDIA_COMPACT } from '../../utils/canvasOverlayLayout';
import {
  overlayPanelCompactMaxHeight,
  overlayPanelCompactWidth,
} from './canvasOverlayStyles';
import {
  overlayCardBodyStyle,
  overlayCardHeaderStyle,
  overlayCardStyle,
  overlayListButtonStyle,
  overlayListStyle,
  overlayMutedStyle,
} from '../overlayChrome';
import {
  fitOverlayBesideAnchor,
  overlayBoxFromRect,
  overlayClipBox,
  overlayLocalPosition,
  OverlayBox,
  overlayPortalParent,
} from '../../utils/overlayPortal';

const panelStyle = (bottomOffset: number) => css`
  position: absolute;
  bottom: ${bottomOffset}px;
  left: ${CANVAS_EDGE_GAP}px;
  z-index: 4;
  max-height: 200px;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
`;

const itemButtonStyle = css`
  font-size: 11px;
  line-height: 1.15;
  padding: 5px 10px;
  gap: 6px;

  ${MEDIA_COMPACT} {
    padding: 6px 10px;
    min-height: 28px;
  }
`;

const dotStyle = (color: string) => css`
  flex: 0 0 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${color};
`;

const hostNameStyle = css`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const statusStyle = css`
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
`;

function reasonLabel(entry: HostAlertListEntry): string {
  switch (entry.reason) {
    case 'offline':
      return 'OFFLINE';
    case 'alert':
      return 'ALERTA';
  }
}

function alertRowAriaLabel(entry: HostAlertListEntry): string {
  const mapPart = entry.mapLabel ? ` no mapa ${entry.mapLabel}` : '';
  const hover = alertListHoverText(entry).replace(/\n/g, '; ');
  return `Ir para ${entry.label}${mapPart} — ${reasonLabel(entry)}. ${hover}`;
}

function alertHoverHeading(entry: HostAlertListEntry): string {
  const problems = visibleHostProblemNames(entry.problems);
  const total = problems.visible.length + problems.hidden;
  if (total === 1) {
    return 'Problema ativo';
  }
  if (total > 1) {
    return `Problemas ativos (${total})`;
  }
  return reasonLabel(entry);
}

const TOOLTIP_ESTIMATE = { width: 320, height: 72 };

const tooltipStyle = css`
  position: absolute;
  z-index: 10000;
  max-width: 320px;
  pointer-events: none;
  font-size: 12px;
`;

const tooltipProblemStyle = (color: string) => css`
  margin-top: 2px;
  color: ${color};
  font-size: 11px;
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

interface AlertHoverTip {
  entry: HostAlertListEntry;
  anchor: OverlayBox;
  clip: OverlayBox;
}

const mapLabelStyle = css`
  flex: 0 0 auto;
  font-size: 10px;
  opacity: 0.65;
  white-space: nowrap;
`;

interface Props {
  entries: HostAlertListEntry[];
  colorOffline: string;
  colorAlert: string;
  queryReady?: boolean;
  showMinimap?: boolean;
  onFocusHost: (entry: HostAlertListEntry) => void;
}

/** Lista de hosts offline, em alerta da Query ou com problema Zabbix no canto inferior esquerdo. */
function TopologyHostAlertListComponent({
  entries,
  colorOffline,
  colorAlert,
  queryReady = false,
  showMinimap = false,
  onFocusHost,
}: Props) {
  const bottomOffset = minimapBottomOffset(showMinimap);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [hoverTip, setHoverTip] = useState<AlertHoverTip | undefined>(undefined);
  const [tipPos, setTipPos] = useState({ left: 0, top: 0 });

  const statusColorByEntry = useMemo(() => {
    const colors = new Map<string, string>();
    for (const entry of entries) {
      colors.set(`${entry.mapId}:${entry.nodeId}`, entry.reason === 'offline' ? colorOffline : colorAlert);
    }
    return colors;
  }, [colorAlert, colorOffline, entries]);

  useLayoutEffect(() => {
    if (!hoverTip) {
      return;
    }
    const el = tooltipRef.current;
    if (!el) {
      return;
    }
    const size = el.getBoundingClientRect();
    const next = fitOverlayBesideAnchor(
      hoverTip.anchor,
      { width: size.width || TOOLTIP_ESTIMATE.width, height: size.height || TOOLTIP_ESTIMATE.height },
      hoverTip.clip
    );
    setTipPos((prev) => (prev.left === next.left && prev.top === next.top ? prev : next));
  }, [hoverTip]);

  if (!queryReady || entries.length === 0) {
    return null;
  }

  const hoverProblems = hoverTip ? visibleHostProblemNames(hoverTip.entry.problems) : undefined;
  const tooltipOrigin = hoverTip ? overlayLocalPosition(tipPos, hoverTip.clip) : tipPos;

  return (
    <>
    <div
      ref={listRef}
      className={`${overlayCardStyle} ${panelStyle(bottomOffset)} ${overlayPanelCompactWidth} ${overlayPanelCompactMaxHeight}`}
      data-map-wheel-overlay
      aria-live="polite"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={overlayCardHeaderStyle}>Hosts com alerta ({entries.length})</div>
      <ul className={overlayListStyle}>
        {entries.map((entry) => {
            const entryKey = `${entry.mapId}:${entry.nodeId}`;
            const statusColor = statusColorByEntry.get(entryKey) ?? colorAlert;
            return (
              <li key={entryKey}>
                <button
                  type="button"
                  className={`${overlayListButtonStyle} ${itemButtonStyle}`}
                  aria-label={alertRowAriaLabel(entry)}
                  onMouseEnter={(e) => {
                    const anchor = overlayBoxFromRect(e.currentTarget.getBoundingClientRect());
                    const clip = overlayClipBox(e.currentTarget);
                    setTipPos(fitOverlayBesideAnchor(anchor, TOOLTIP_ESTIMATE, clip));
                    setHoverTip({ entry, anchor, clip });
                  }}
                  onMouseLeave={() => setHoverTip(undefined)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocusHost(entry);
                  }}
                >
                  <span className={dotStyle(statusColor)} aria-hidden="true" />
                  <span className={hostNameStyle}>{entry.label}</span>
                  {entry.mapLabel ? (
                    <span className={mapLabelStyle}>{entry.mapLabel}</span>
                  ) : null}
                  <span className={statusStyle} style={{ color: statusColor }}>
                    {reasonLabel(entry)}
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
    </div>
    {hoverTip
      ? createPortal(
          <div
            ref={tooltipRef}
            className={`${overlayCardStyle} ${overlayCardBodyStyle} ${tooltipStyle}`}
            style={{
              left: tooltipOrigin.left,
              top: tooltipOrigin.top,
              maxHeight: Math.max(48, hoverTip.clip.height - 16),
            }}
            role="tooltip"
          >
            <div className={overlayMutedStyle}>{alertHoverHeading(hoverTip.entry)}</div>
            {hoverProblems && hoverProblems.visible.length > 0 ? (
              <>
                {hoverProblems.visible.map((name, idx) => (
                  <div key={`${idx}:${name}`} className={tooltipProblemStyle(colorAlert)}>
                    {name}
                  </div>
                ))}
                {hoverProblems.hidden > 0 ? (
                  <div className={overlayMutedStyle}>e mais {hoverProblems.hidden}</div>
                ) : null}
              </>
            ) : null}
          </div>,
          overlayPortalParent(listRef.current)
        )
      : null}
    </>
  );
}

/** Não redesenha a cada frame de pan/zoom do mapa. */
export const TopologyHostAlertList = React.memo(TopologyHostAlertListComponent);
