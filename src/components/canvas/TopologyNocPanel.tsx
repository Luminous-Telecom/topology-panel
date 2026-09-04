import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { NocHostListEntry } from '../../utils/noc/topologyFilters';
import { TopologyMapFilterId, TOPOLOGY_FILTER_LABELS } from '../../utils/noc/types';
import { minimapBottomOffset } from '../../utils/canvasOverlayLayout';
import {
  overlayFilterChipStyle,
  overlayListItemButtonStyle,
  overlayNocTopClearance,
  overlayPanelNocCompactWidth,
} from './canvasOverlayStyles';
import {
  overlayCardHeaderStyle,
  overlayCardStyle,
  overlayListButtonStyle,
  overlayMutedStyle,
} from '../chrome/overlayChrome';
import styles from './TopologyNocPanel.module.scss';

const ROW_ESTIMATE_PX = 52;
const VIRTUAL_LIST_THRESHOLD = 48;

interface Props {
  entries: NocHostListEntry[];
  filterIds: readonly TopologyMapFilterId[];
  activeFilters: ReadonlySet<TopologyMapFilterId>;
  queryReady?: boolean;
  listPending?: boolean;
  showMinimap?: boolean;
  onToggleFilter: (filter: TopologyMapFilterId) => void;
  onSelectHost: (entry: NocHostListEntry) => void;
}

function TopologyNocPanelComponent({
  entries,
  filterIds,
  activeFilters,
  queryReady = false,
  listPending = false,
  showMinimap = false,
  onToggleFilter,
  onSelectHost,
}: Props) {
  const bottomOffset = minimapBottomOffset(showMinimap);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 8,
    enabled: entries.length > VIRTUAL_LIST_THRESHOLD,
  });

  const useVirtual = entries.length > VIRTUAL_LIST_THRESHOLD;

  return (
    <div
      className={`${overlayCardStyle} ${styles.panel} ${overlayPanelNocCompactWidth} ${overlayNocTopClearance}`}
      style={{ ['--overlay-bottom' as string]: `${bottomOffset}px` }}
      data-map-wheel-overlay
      aria-live="polite"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={overlayCardHeaderStyle}>Modo NOC — equipamentos ({entries.length})</div>
      <div className={styles.filters}>
        {filterIds.map((id) => {
          const active = activeFilters.has(id);
          return (
            <button
              key={id}
              type="button"
              className={`${styles.filterChip} ${overlayFilterChipStyle}`}
              onClick={() => onToggleFilter(id)}
              aria-pressed={active}
              style={{
                padding: '4px 8px',
                background: active ? 'rgba(229,57,53,0.85)' : 'rgba(0,0,0,0.45)',
              }}
            >
              {TOPOLOGY_FILTER_LABELS[id]}
            </button>
          );
        })}
      </div>
      {!queryReady ? (
        <div className={`${overlayMutedStyle} ${styles.empty}`}>Carregando status da Query…</div>
      ) : listPending ? (
        <div className={`${overlayMutedStyle} ${styles.empty}`}>Carregando equipamentos…</div>
      ) : entries.length === 0 ? (
        <div className={`${overlayMutedStyle} ${styles.empty}`}>
          {activeFilters.size > 0
            ? 'Nenhum equipamento corresponde aos filtros selecionados.'
            : 'Nenhum host encontrado nos mapas do painel.'}
        </div>
      ) : (
        <div ref={scrollRef} className={styles.scroll}>
          {useVirtual ? (
          <ul className={styles.virtualList} style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((row) => {
              const entry = entries[row.index];
              return (
                <li
                  key={`${entry.mapId}:${entry.nodeId}`}
                  className={styles.virtualRow}
                  style={{ transform: `translateY(${row.start}px)` }}
                >
                  <button
                    type="button"
                    className={`${overlayListButtonStyle} ${styles.itemButton} ${overlayListItemButtonStyle}`}
                    title={`Ir para ${entry.label}`}
                    aria-label={`Ir para ${entry.label} no mapa ${entry.mapLabel}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectHost(entry);
                    }}
                  >
                    <div className={styles.row}>
                      <span className={styles.hostName}>{entry.label}</span>
                      <span className={styles.mapLabel}>{entry.mapLabel}</span>
                    </div>
                    {entry.tags.length > 0 ? (
                      <div className={styles.tags}>
                        {entry.tags.map((tag) => (
                          <span key={tag} className={styles.tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          ) : (
          <ul className={styles.plainList}>
            {entries.map((entry) => (
              <li key={`${entry.mapId}:${entry.nodeId}`}>
                <button
                  type="button"
                  className={`${overlayListButtonStyle} ${styles.itemButton} ${overlayListItemButtonStyle}`}
                  title={`Ir para ${entry.label}`}
                  aria-label={`Ir para ${entry.label} no mapa ${entry.mapLabel}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectHost(entry);
                  }}
                >
                  <div className={styles.row}>
                    <span className={styles.hostName}>{entry.label}</span>
                    <span className={styles.mapLabel}>{entry.mapLabel}</span>
                  </div>
                  {entry.tags.length > 0 ? (
                    <div className={styles.tags}>
                      {entry.tags.map((tag) => (
                        <span key={tag} className={styles.tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Lista longa de equipamentos: não redesenha a cada frame de pan/zoom do mapa. */
export const TopologyNocPanel = React.memo(TopologyNocPanelComponent);
