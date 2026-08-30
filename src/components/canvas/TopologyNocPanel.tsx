import React from 'react';
import { NocHostListEntry } from '../../utils/noc/topologyFilters';
import { TopologyMapFilterId, TOPOLOGY_FILTER_LABELS } from '../../utils/noc/types';
import { minimapBottomOffset } from '../../utils/canvasOverlayLayout';
import {
  overlayFilterChipStyle,
  overlayListItemButtonStyle,
  overlayNocTopClearance,
  overlayPanelNocCompactWidth,
} from './canvasOverlayStyles';
import { overlayCardHeaderStyle, overlayCardStyle, overlayListButtonStyle, overlayListStyle, overlayMutedStyle } from '../chrome/overlayChrome';
import styles from './TopologyNocPanel.module.scss';

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
        <ul className={`${overlayListStyle} ${styles.list}`}>
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
  );
}

/** Lista longa de equipamentos: não redesenha a cada frame de pan/zoom do mapa. */
export const TopologyNocPanel = React.memo(TopologyNocPanelComponent);
