import React from 'react';
import { css } from '@emotion/css';
import { NocHostListEntry } from '../../utils/noc/topologyFilters';
import { TopologyMapFilterId, TOPOLOGY_FILTER_LABELS } from '../../utils/noc/types';

const panelStyle = css`
  position: absolute;
  top: 44px;
  right: 8px;
  bottom: 8px;
  z-index: 5;
  width: min(300px, calc(100% - 16px));
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
  overflow: hidden;
`;

const headerStyle = css`
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
`;

const filtersStyle = css`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const listStyle = css`
  margin: 0;
  padding: 4px 0;
  list-style: none;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
`;

const itemButtonStyle = css`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 11px;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
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
  padding: 12px 10px;
  color: rgba(255, 255, 255, 0.65);
  font-size: 11px;
  line-height: 1.4;
`;

interface Props {
  entries: NocHostListEntry[];
  activeFilters: ReadonlySet<TopologyMapFilterId>;
  queryReady?: boolean;
  onToggleFilter: (filter: TopologyMapFilterId) => void;
  onSelectHost: (entry: NocHostListEntry) => void;
}

const FILTER_IDS = Object.keys(TOPOLOGY_FILTER_LABELS) as TopologyMapFilterId[];

function TopologyNocPanelComponent({
  entries,
  activeFilters,
  queryReady = false,
  onToggleFilter,
  onSelectHost,
}: Props) {
  const filters = FILTER_IDS;

  return (
    <div
      className={panelStyle}
      aria-live="polite"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={headerStyle}>Modo NOC — equipamentos ({entries.length})</div>
      <div className={filtersStyle}>
        {filters.map((id) => {
          const active = activeFilters.has(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggleFilter(id)}
              aria-pressed={active}
              style={{
                padding: '4px 8px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.3)',
                background: active ? 'rgba(229,57,53,0.85)' : 'rgba(0,0,0,0.45)',
                color: '#fff',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              {TOPOLOGY_FILTER_LABELS[id]}
            </button>
          );
        })}
      </div>
      {!queryReady ? (
        <div className={emptyStyle}>Carregando status da Query…</div>
      ) : entries.length === 0 ? (
        <div className={emptyStyle}>
          {activeFilters.size > 0
            ? 'Nenhum equipamento corresponde aos filtros selecionados.'
            : 'Nenhum host encontrado nos mapas do painel.'}
        </div>
      ) : (
        <ul className={listStyle}>
          {entries.map((entry) => (
            <li key={`${entry.mapId}:${entry.nodeId}`}>
              <button
                type="button"
                className={itemButtonStyle}
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
