import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NocHostListEntry } from '../../utils/noc/topologyFilters';
import {
  isHostTypeFilterId,
  isNocLinkFilterId,
  isNocSubmapFilterId,
  nocFilterLabel,
  NOC_STATUS_MENU_IDS,
  TopologyMapFilterId,
} from '../../utils/noc/types';
import { useEscapeKey } from '../../hooks/useEscapeKey';
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
  filterLabels?: Readonly<Record<string, string>>;
}

type NocMenuId = 'status' | 'tipo' | 'links' | 'submapa';

function menuSummary(
  optionIds: readonly TopologyMapFilterId[],
  activeFilters: ReadonlySet<TopologyMapFilterId>,
  emptyLabel: string,
  filterLabels?: Readonly<Record<string, string>>
): string {
  const selected = optionIds.filter((id) => activeFilters.has(id));
  if (selected.length === 0) {
    return emptyLabel;
  }
  if (selected.length === 1) {
    return nocFilterLabel(selected[0]!, filterLabels);
  }
  return `${emptyLabel} (${selected.length})`;
}

function NocFilterMenu({
  menuId,
  label,
  optionIds,
  activeFilters,
  openMenu,
  onOpenMenu,
  onToggleFilter,
  filterLabels,
  alignEnd = false,
}: {
  menuId: NocMenuId;
  label: string;
  optionIds: readonly TopologyMapFilterId[];
  activeFilters: ReadonlySet<TopologyMapFilterId>;
  openMenu: NocMenuId | null;
  onOpenMenu: (id: NocMenuId | null) => void;
  onToggleFilter: (filter: TopologyMapFilterId) => void;
  filterLabels?: Readonly<Record<string, string>>;
  alignEnd?: boolean;
}) {
  const open = openMenu === menuId;
  const rootRef = useRef<HTMLDivElement>(null);
  const summary = menuSummary(optionIds, activeFilters, label, filterLabels);
  const selectedCount = optionIds.filter((id) => activeFilters.has(id)).length;

  useEscapeKey(() => onOpenMenu(null), open);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onOpenMenu(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, onOpenMenu]);

  if (optionIds.length === 0) {
    return null;
  }

  return (
    <div ref={rootRef} className={`${styles.menuWrap}${alignEnd ? ` ${styles.menuAlignEnd}` : ''}`}>
      <button
        type="button"
        className={`${styles.filterChip} ${overlayFilterChipStyle}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filtro ${label}`}
        onClick={() => onOpenMenu(open ? null : menuId)}
        style={{
          padding: '4px 8px',
          background: selectedCount > 0 ? 'rgba(229,57,53,0.85)' : 'rgba(0,0,0,0.45)',
        }}
      >
        {summary}
        <span className={styles.chevron} aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <ul className={styles.menu} role="listbox" aria-label={label}>
          {optionIds.map((id) => {
            const active = activeFilters.has(id);
            return (
              <li key={id} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => onToggleFilter(id)}
                >
                  <span className={styles.check} aria-hidden="true">
                    {active ? '✓' : ''}
                  </span>
                  {nocFilterLabel(id, filterLabels)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
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
  filterLabels,
}: Props) {
  const bottomOffset = minimapBottomOffset(showMinimap);
  const [openMenu, setOpenMenu] = useState<NocMenuId | null>(null);
  const typeIds = useMemo(
    () => filterIds.filter(isHostTypeFilterId),
    [filterIds]
  );
  const linkIds = useMemo(() => filterIds.filter(isNocLinkFilterId), [filterIds]);
  const submapIds = useMemo(() => filterIds.filter(isNocSubmapFilterId), [filterIds]);

  return (
    <div
      className={`${overlayCardStyle} ${styles.panel} ${overlayPanelNocCompactWidth} ${overlayNocTopClearance}`}
      style={{ ['--overlay-bottom' as string]: `${bottomOffset}px`, overflow: 'visible' }}
      data-map-wheel-overlay
      aria-live="polite"
      onPointerDown={(e) => {
        e.stopPropagation();
        const target = e.target as Node;
        if (openMenu && !(target instanceof Element && target.closest(`.${styles.menuWrap}`))) {
          setOpenMenu(null);
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={overlayCardHeaderStyle}>Modo NOC — equipamentos ({entries.length})</div>
      <div className={styles.filters}>
        <NocFilterMenu
          menuId="status"
          label="Status"
          optionIds={NOC_STATUS_MENU_IDS}
          activeFilters={activeFilters}
          openMenu={openMenu}
          onOpenMenu={setOpenMenu}
          onToggleFilter={onToggleFilter}
          filterLabels={filterLabels}
        />
        <NocFilterMenu
          menuId="submapa"
          label="Submapa"
          optionIds={submapIds}
          activeFilters={activeFilters}
          openMenu={openMenu}
          onOpenMenu={setOpenMenu}
          onToggleFilter={onToggleFilter}
          filterLabels={filterLabels}
          alignEnd
        />
        <NocFilterMenu
          menuId="tipo"
          label="Tipo"
          optionIds={typeIds}
          activeFilters={activeFilters}
          openMenu={openMenu}
          onOpenMenu={setOpenMenu}
          onToggleFilter={onToggleFilter}
          filterLabels={filterLabels}
          alignEnd
        />
        <NocFilterMenu
          menuId="links"
          label="Links"
          optionIds={linkIds}
          activeFilters={activeFilters}
          openMenu={openMenu}
          onOpenMenu={setOpenMenu}
          onToggleFilter={onToggleFilter}
          filterLabels={filterLabels}
          alignEnd
        />
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
