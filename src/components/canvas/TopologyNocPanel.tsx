import React from 'react';
import { css } from '@emotion/css';
import { NocHostListEntry } from '../../utils/noc/topologyFilters';
import { TopologyMapFilterId, TOPOLOGY_FILTER_LABELS } from '../../utils/noc/types';
import { CANVAS_EDGE_GAP, minimapBottomOffset } from '../../utils/canvasOverlayLayout';
import {
  overlayFilterChipStyle,
  overlayListItemButtonStyle,
  overlayNocTopClearance,
  overlayPanelNocCompactWidth,
} from './canvasOverlayStyles';
import { overlayCardHeaderStyle, overlayCardStyle, overlayListButtonStyle, overlayListStyle, overlayMutedStyle } from '../overlayChrome';

const panelStyle = (bottomOffset: number) => css`
  position: absolute;
  left: ${CANVAS_EDGE_GAP}px;
  bottom: ${bottomOffset}px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
`;

const filtersStyle = css`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const nocListStyle = css`
  flex: 1 1 auto;
  min-height: 0;
`;

const itemButtonStyle = css`
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  font-size: 11px;
`;

const rowStyle = css`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

const hostNameStyle = css`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
`;

const mapLabelStyle = css`
  flex: 0 0 auto;
  font-size: 10px;
  opacity: 0.65;
  white-space: nowrap;
`;

const tagsStyle = css`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const tagStyle = css`
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 1px 5px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.92);
`;

const emptyStyle = css`
  padding: 12px;
`;

const filterChipBaseStyle = css`
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 10px;
  cursor: pointer;
`;

interface Props {
  entries: NocHostListEntry[];
  activeFilters: ReadonlySet<TopologyMapFilterId>;
  queryReady?: boolean;
  showMinimap?: boolean;
  onToggleFilter: (filter: TopologyMapFilterId) => void;
  onSelectHost: (entry: NocHostListEntry) => void;
}

const FILTER_IDS = Object.keys(TOPOLOGY_FILTER_LABELS) as TopologyMapFilterId[];

function TopologyNocPanelComponent({
  entries,
  activeFilters,
  queryReady = false,
  showMinimap = false,
  onToggleFilter,
  onSelectHost,
}: Props) {
  const filters = FILTER_IDS;
  const bottomOffset = minimapBottomOffset(showMinimap);

  return (
    <div
      className={`${overlayCardStyle} ${panelStyle(bottomOffset)} ${overlayPanelNocCompactWidth} ${overlayNocTopClearance}`}
      data-map-wheel-overlay
      aria-live="polite"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={overlayCardHeaderStyle}>Modo NOC — equipamentos ({entries.length})</div>
      <div className={filtersStyle}>
        {filters.map((id) => {
          const active = activeFilters.has(id);
          return (
            <button
              key={id}
              type="button"
              className={`${filterChipBaseStyle} ${overlayFilterChipStyle}`}
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
        <div className={`${overlayMutedStyle} ${emptyStyle}`}>Carregando status da Query…</div>
      ) : entries.length === 0 ? (
        <div className={`${overlayMutedStyle} ${emptyStyle}`}>
          {activeFilters.size > 0
            ? 'Nenhum equipamento corresponde aos filtros selecionados.'
            : 'Nenhum host encontrado nos mapas do painel.'}
        </div>
      ) : (
        <ul className={`${overlayListStyle} ${nocListStyle}`}>
          {entries.map((entry) => (
            <li key={`${entry.mapId}:${entry.nodeId}`}>
              <button
                type="button"
                className={`${overlayListButtonStyle} ${itemButtonStyle} ${overlayListItemButtonStyle}`}
                title={`Ir para ${entry.label}`}
                aria-label={`Ir para ${entry.label} no mapa ${entry.mapLabel}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectHost(entry);
                }}
              >
                <div className={rowStyle}>
                  <span className={hostNameStyle}>{entry.label}</span>
                  <span className={mapLabelStyle}>{entry.mapLabel}</span>
                </div>
                {entry.tags.length > 0 ? (
                  <div className={tagsStyle}>
                    {entry.tags.map((tag) => (
                      <span key={tag} className={tagStyle}>
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
