import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  alertListHoverText,
  HostAlertListEntry,
  visibleHostProblemNames,
  alertListStatusLabel,
} from '../../utils/noc/topologyFilters';
import { minimapBottomOffset } from '../../utils/canvasOverlayLayout';
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
  overlayStackedItemStyle,
} from '../chrome/overlayChrome';
import { useFloatingElementAnchor } from '../../hooks/useFloatingElementAnchor';
import { overlayPortalParent } from '../../utils/overlayPortal';
import styles from './TopologyHostAlertList.module.scss';

function reasonLabel(entry: HostAlertListEntry): string {
  return alertListStatusLabel(entry);
}

function alertRowAriaLabel(entry: HostAlertListEntry): string {
  const mapPart = entry.mapLabel ? ` no mapa ${entry.mapLabel}` : '';
  const hover = alertListHoverText(entry).replace(/\n/g, '; ');
  return `Ir para ${entry.label}${mapPart} — ${reasonLabel(entry)}. ${hover}`;
}

function alertHoverHeading(entry: HostAlertListEntry): string {
  if (entry.reason === 'offline') {
    return reasonLabel(entry);
  }
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

const ROW_ESTIMATE_PX = 32;
/** Listas curtas renderizam todos os itens (testes e poucos alertas); acima disso virtualiza. */
const VIRTUAL_LIST_THRESHOLD = 48;

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
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoverEntry, setHoverEntry] = useState<HostAlertListEntry | undefined>(undefined);
  const [hoverAnchor, setHoverAnchor] = useState<HTMLElement | null>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 6,
    enabled: entries.length > VIRTUAL_LIST_THRESHOLD,
  });

  const useVirtual = entries.length > VIRTUAL_LIST_THRESHOLD;

  const { refs: tipRefs, floatingStyles: tipStyles } = useFloatingElementAnchor({
    anchor: hoverAnchor,
    enabled: hoverEntry != null,
  });

  if (!queryReady || entries.length === 0) {
    return null;
  }

  const hoverProblems =
    hoverEntry && hoverEntry.reason !== 'offline'
      ? visibleHostProblemNames(hoverEntry.problems)
      : undefined;

  return (
    <>
      <div
        ref={listRef}
        className={`${overlayCardStyle} ${styles.panel} ${overlayPanelCompactWidth} ${overlayPanelCompactMaxHeight}`}
        style={{ ['--overlay-bottom' as string]: `${bottomOffset}px` }}
        data-map-wheel-overlay
        aria-live="polite"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={overlayCardHeaderStyle}>Hosts com alerta ({entries.length})</div>
        <div ref={scrollRef} className={styles.scroll}>
          {useVirtual ? (
          <ul
            className={styles.virtualList}
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const entry = entries[row.index];
              const entryKey = `${entry.mapId}:${entry.nodeId}`;
              const statusColor = entry.reason === 'offline' ? colorOffline : colorAlert;
              return (
                <li
                  key={entryKey}
                  className={styles.virtualRow}
                  style={{ transform: `translateY(${row.start}px)` }}
                >
                  <button
                    type="button"
                    className={`${overlayListButtonStyle} ${styles.itemButton}`}
                    aria-label={alertRowAriaLabel(entry)}
                    onMouseEnter={(e) => {
                      setHoverAnchor(e.currentTarget);
                      setHoverEntry(entry);
                    }}
                    onMouseLeave={() => {
                      setHoverAnchor(null);
                      setHoverEntry(undefined);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocusHost(entry);
                    }}
                  >
                    <span className={styles.dot} style={{ background: statusColor }} aria-hidden="true" />
                    <span className={styles.hostName}>{entry.label}</span>
                    {entry.mapLabel ? (
                      <span className={styles.mapLabel}>{entry.mapLabel}</span>
                    ) : null}
                    <span className={styles.status} style={{ color: statusColor }}>
                      {reasonLabel(entry)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          ) : (
          <ul className={`${overlayListStyle} ${styles.plainList}`}>
            {entries.map((entry) => {
              const entryKey = `${entry.mapId}:${entry.nodeId}`;
              const statusColor = entry.reason === 'offline' ? colorOffline : colorAlert;
              return (
                <li key={entryKey}>
                  <button
                    type="button"
                    className={`${overlayListButtonStyle} ${styles.itemButton}`}
                    aria-label={alertRowAriaLabel(entry)}
                    onMouseEnter={(e) => {
                      setHoverAnchor(e.currentTarget);
                      setHoverEntry(entry);
                    }}
                    onMouseLeave={() => {
                      setHoverAnchor(null);
                      setHoverEntry(undefined);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocusHost(entry);
                    }}
                  >
                    <span className={styles.dot} style={{ background: statusColor }} aria-hidden="true" />
                    <span className={styles.hostName}>{entry.label}</span>
                    {entry.mapLabel ? (
                      <span className={styles.mapLabel}>{entry.mapLabel}</span>
                    ) : null}
                    <span className={styles.status} style={{ color: statusColor }}>
                      {reasonLabel(entry)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          )}
        </div>
      </div>
      {hoverEntry
        ? createPortal(
            <div
              ref={tipRefs.setFloating}
              className={`${overlayCardStyle} ${overlayCardBodyStyle} ${styles.tooltip}`}
              style={{
                ...tipStyles,
                position: tipStyles.position ?? 'absolute',
                maxHeight: 'min(240px, 70vh)',
              }}
              role="tooltip"
            >
              <div className={overlayMutedStyle}>{alertHoverHeading(hoverEntry)}</div>
              {hoverProblems && hoverProblems.visible.length > 0 ? (
                <>
                  {hoverProblems.visible.map((name, idx) => (
                    <div
                      key={`${idx}:${name}`}
                      className={`${styles.tooltipProblem} ${overlayStackedItemStyle}`}
                      style={{ color: colorAlert }}
                    >
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
