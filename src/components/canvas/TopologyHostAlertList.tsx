import React, { useMemo } from 'react';
import { css } from '@emotion/css';
import { HostAlertListEntry } from '../../utils/noc/topologyFilters';
import { CANVAS_EDGE_GAP, minimapBottomOffset, MEDIA_COMPACT } from '../../utils/canvasOverlayLayout';
import {
  overlayPanelCompactMaxHeight,
  overlayPanelCompactWidth,
} from './canvasOverlayStyles';
import { overlayCardHeaderStyle, overlayCardStyle, overlayListButtonStyle, overlayListStyle } from '../overlayChrome';

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

  const statusColorByEntry = useMemo(() => {
    const colors = new Map<string, string>();
    for (const entry of entries) {
      colors.set(`${entry.mapId}:${entry.nodeId}`, entry.reason === 'offline' ? colorOffline : colorAlert);
    }
    return colors;
  }, [colorAlert, colorOffline, entries]);

  if (!queryReady || entries.length === 0) {
    return null;
  }

  return (
    <div
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
                  title={`Ir para ${entry.label}`}
                  aria-label={`Ir para ${entry.label} no mapa ${entry.mapLabel} — ${reasonLabel(entry)}`}
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
  );
}

/** Não redesenha a cada frame de pan/zoom do mapa. */
export const TopologyHostAlertList = React.memo(TopologyHostAlertListComponent);
