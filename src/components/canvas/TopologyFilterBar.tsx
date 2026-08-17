import React from 'react';
import { css } from '@emotion/css';
import { TopologyMapFilterId, TOPOLOGY_FILTER_LABELS } from '../../utils/noc/types';

const barStyle = css`
  position: absolute;
  top: 44px;
  left: 8px;
  z-index: 4;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: min(720px, calc(100% - 16px));
`;

interface Props {
  activeFilters: ReadonlySet<TopologyMapFilterId>;
  onToggle: (filter: TopologyMapFilterId) => void;
}

export function TopologyFilterBar({ activeFilters, onToggle }: Props) {
  const filters = Object.keys(TOPOLOGY_FILTER_LABELS) as TopologyMapFilterId[];

  return (
    <div className={barStyle}>
      {filters.map((id) => {
        const active = activeFilters.has(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            aria-pressed={active}
            style={{
              padding: '3px 8px',
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
  );
}
