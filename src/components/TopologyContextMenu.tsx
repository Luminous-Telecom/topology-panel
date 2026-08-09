import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { Icon, useTheme2 } from '@grafana/ui';
import { FaArrowPointer, FaCopy, FaHand, FaListUl, FaMap, FaPaste } from 'react-icons/fa6';
import { TopologyNode, TopologyNodeType } from '../types';
import { resolvePanelColor } from '../utils/panelColors';

export type CanvasTool = 'select' | 'pan';

function nodeTypeLabel(type?: TopologyNodeType): string {
  switch (type) {
    case 'submap':
      return 'Submapa';
    case 'network':
      return 'Rede';
    case 'static':
      return 'Texto';
    case 'dashboard_picker':
      return 'Seletor';
    default:
      return 'Host';
  }
}

function nodeSearchText(node: TopologyNode): string {
  return [node.label, node.id, node.subtitle, node.zabbixHost].filter(Boolean).join(' ').toLowerCase();
}

const searchWrapStyle = css`
  position: relative;
  display: flex;
  align-items: center;
`;

const searchPanelStyle = css`
  display: flex;
  flex-direction: column;
  gap: 0;
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  width: min(280px, 70vw);
  z-index: 5;
  background: rgba(0, 0, 0, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
`;

const searchInputStyle = css`
  width: 100%;
  box-sizing: border-box;
  border: 0;
  outline: none;
  padding: 7px 10px;
  background: transparent;
  color: #fff;
  font-size: 12px;
  &::placeholder {
    color: rgba(255, 255, 255, 0.45);
  }
`;

const searchResultsStyle = css`
  max-height: 220px;
  overflow-y: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
`;

const searchResultBtnStyle = css`
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  border: 0;
  background: transparent;
  color: #fff;
  text-align: left;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  &:hover,
  &[data-active='true'] {
    background: rgba(79, 195, 247, 0.28);
  }
`;

const searchResultMetaStyle = css`
  font-size: 10px;
  color: rgba(255, 255, 255, 0.55);
`;

const searchEmptyStyle = css`
  padding: 8px 10px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
`;

/** Painel flutuante da pesquisa (o botão fica na toolbar). */
export function TopologySearch({
  nodes,
  open,
  onOpenChange,
  onFocusNode,
}: {
  nodes: TopologyNode[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFocusNode: (nodeId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return nodes.filter((n) => nodeSearchText(n).includes(q)).slice(0, 20);
  }, [nodes, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const selectResult = useCallback(
    (nodeId: string) => {
      onFocusNode(nodeId);
      onOpenChange(false);
    },
    [onFocusNode, onOpenChange]
  );

  if (!open) {
    return null;
  }

  return (
    <div className={searchPanelStyle} onPointerDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className={searchInputStyle}
        type="search"
        value={query}
        placeholder="Nome, IP ou host…"
        aria-label="Pesquisar no mapa"
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onOpenChange(false);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (results.length === 0) {
              return;
            }
            setActiveIndex((i) => (i + 1) % results.length);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (results.length === 0) {
              return;
            }
            setActiveIndex((i) => (i - 1 + results.length) % results.length);
            return;
          }
          if (e.key === 'Enter' && results.length > 0) {
            e.preventDefault();
            const pick = results[Math.min(activeIndex, results.length - 1)];
            if (pick) {
              selectResult(pick.id);
            }
          }
        }}
      />
      {query.trim() !== '' && (
        <div className={searchResultsStyle}>
          {results.length === 0 ? (
            <div className={searchEmptyStyle}>Nenhum resultado</div>
          ) : (
            results.map((node, idx) => {
              const title = (node.label ?? node.id).trim() || node.id;
              const metaParts = [nodeTypeLabel(node.type)];
              if (node.subtitle?.trim()) {
                metaParts.push(node.subtitle.trim());
              } else if (node.zabbixHost?.trim() && node.zabbixHost !== title) {
                metaParts.push(node.zabbixHost.trim());
              }
              return (
                <button
                  key={node.id}
                  type="button"
                  className={searchResultBtnStyle}
                  data-active={idx === activeIndex ? 'true' : 'false'}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => selectResult(node.id)}
                >
                  <span>{title}</span>
                  <span className={searchResultMetaStyle}>{metaParts.join(' · ')}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export interface ContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  variant?: 'add' | 'delete' | 'tool' | 'submenu';
  children?: ContextMenuItem[];
  onClick?: () => void;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const styles = {
  backdrop: css`
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: transparent;
  `,
  menu: css`
    position: fixed;
    z-index: 10000;
    min-width: 180px;
    background: #fff;
    border: 1px solid #c7c7c7;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    padding: 4px 0;
    font-size: 13px;
    color: #222;
  `,
  item: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    user-select: none;
    position: relative;
    &:hover {
      background: #e8f4fc;
    }
  `,
  itemDisabled: css`
    opacity: 0.45;
    cursor: default;
    &:hover {
      background: transparent;
    }
  `,
  itemDelete: css`
    &:hover {
      background: #fdecea;
    }
  `,
  iconAdd: css`
    color: #e53935;
    font-weight: 700;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  `,
  iconDelete: css`
    color: #c62828;
    font-weight: 700;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  `,
  iconTool: css`
    color: #546e7a;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
    font-size: 11px;
  `,
  submenuArrow: css`
    margin-left: auto;
    color: #666;
    font-size: 10px;
  `,
  separator: css`
    height: 1px;
    margin: 4px 0;
    background: #e0e0e0;
  `,
  submenu: css`
    position: absolute;
    left: 100%;
    top: -4px;
    min-width: 140px;
    background: #fff;
    border: 1px solid #c7c7c7;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    padding: 4px 0;
    z-index: 10001;
    /* Ponte anti-gap: evita fechar o submenu ao mover o mouse para a direita */
    &::before {
      content: '';
      position: absolute;
      left: -10px;
      top: 0;
      bottom: 0;
      width: 10px;
    }
  `,
};

function itemIcon(item: ContextMenuItem): string {
  if (item.variant === 'delete') {
    return '×';
  }
  if (item.variant === 'submenu') {
    return '⚙';
  }
  if (item.variant === 'tool') {
    return '▸';
  }
  return '+';
}

function MenuItem({ item, onClose }: { item: ContextMenuItem; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const hasChildren = Boolean(item.children?.length);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const handleClick = useCallback(() => {
    if (item.disabled) {
      return;
    }
    if (hasChildren) {
      setOpen((v) => !v);
      return;
    }
    item.onClick?.();
    onClose();
  }, [hasChildren, item, onClose]);

  return (
    <div
      className={`${styles.item} ${item.disabled ? styles.itemDisabled : ''} ${item.variant === 'delete' ? styles.itemDelete : ''}`}
      onClick={handleClick}
      onMouseEnter={() => {
        if (!hasChildren) {
          return;
        }
        clearCloseTimer();
        setOpen(true);
      }}
      onMouseLeave={() => {
        if (hasChildren) {
          scheduleClose();
        }
      }}
    >
      <span
        className={
          item.variant === 'delete'
            ? styles.iconDelete
            : item.variant === 'tool' || item.variant === 'submenu'
              ? styles.iconTool
              : styles.iconAdd
        }
      >
        {itemIcon(item)}
      </span>
      {item.label}
      {hasChildren && <span className={styles.submenuArrow}>▶</span>}
      {hasChildren && open && (
        <div
          className={styles.submenu}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        >
          {item.children?.map((child) => (
            <div
              key={child.id}
              className={`${styles.item} ${child.disabled ? styles.itemDisabled : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (child.disabled) {
                  return;
                }
                child.onClick?.();
                onClose();
              }}
            >
              <span className={styles.iconTool}>▸</span>
              {child.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopologyContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    setPosition({ x, y });
    const el = ref.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 4;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (left !== x || top !== y) {
      setPosition({ x: left, y: top });
    }
  }, [x, y, items]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const dismiss = useCallback(
    (e: React.MouseEvent | React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    },
    [onClose]
  );

  const menu = (
    <>
      <div
        className={styles.backdrop}
        aria-hidden
        onMouseDown={dismiss}
        onPointerDown={dismiss}
        onContextMenu={dismiss}
      />
      <div
        ref={ref}
        className={styles.menu}
        style={{ left: position.x, top: position.y }}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
      {items.map((item, idx) => {
        const isDelete = item.variant === 'delete';
        const showSep = isDelete && idx > 0 && items[idx - 1]?.variant !== 'delete';
        return (
          <React.Fragment key={item.id}>
            {showSep && <div className={styles.separator} />}
            <MenuItem item={item} onClose={onClose} />
          </React.Fragment>
        );
      })}
      </div>
    </>
  );

  if (typeof document === 'undefined') {
    return menu;
  }

  return createPortal(menu, document.body);
}

const hintStyle = css`
  position: absolute;
  top: 44px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  padding: 6px 12px;
  border-radius: 4px;
  background: rgba(21, 101, 192, 0.92);
  color: #fff;
  font-size: 12px;
  line-height: 1.35;
  pointer-events: none;
  text-align: center;
  white-space: normal;
  max-width: min(560px, calc(100% - 280px));
  box-sizing: border-box;
`;

export function TopologyEditHint({ children }: { children: React.ReactNode }) {
  return <div className={hintStyle}>{children}</div>;
}

const legendStyle = css`
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  min-width: 132px;
`;

const legendTitleStyle = css`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.72);
  margin-bottom: 2px;
`;

const legendItemStyle = css`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #fff;
  line-height: 1.2;
  white-space: nowrap;
`;

const legendSwatchStyle = css`
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.45);
  box-sizing: border-box;
`;

export type TopologyLegendItem = { label: string; color: string };

const legendCountdownStyle = css`
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.3;
  white-space: nowrap;
`;

export function TopologyColorLegend({
  items,
  refreshCountdown = null,
  refreshIntervalSec = null,
}: {
  items: TopologyLegendItem[];
  refreshCountdown?: number | null;
  refreshIntervalSec?: number | null;
}) {
  const theme = useTheme2();
  const visible = items
    .map((item) => ({ label: item.label, color: resolvePanelColor(theme, item.color) }))
    .filter((item) => Boolean(item.color));

  const countdownLabel =
    refreshIntervalSec == null
      ? 'Atualização: manual'
      : `Atualiza em ${refreshCountdown ?? refreshIntervalSec}s`;

  if (visible.length === 0) {
    // Ainda mostra o contador mesmo sem itens de legenda
    return (
      <div className={legendStyle} aria-label="Atualização do mapa">
        <div className={legendCountdownStyle} style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          {countdownLabel}
        </div>
      </div>
    );
  }
  return (
    <div className={legendStyle} aria-label="Legenda de cores">
      <div className={legendTitleStyle}>Legenda</div>
      {visible.map((item) => (
        <div key={item.label} className={legendItemStyle}>
          <span className={legendSwatchStyle} style={{ background: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
      <div className={legendCountdownStyle}>{countdownLabel}</div>
    </div>
  );
}

const toolbarStyle = css`
  position: absolute;
  top: 8px;
  right: 36px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 6px;
`;

export function TopologyToolbar({
  tool,
  onToolChange,
  locked,
  networksLocked,
  canUndo,
  canRedo,
  canCopy,
  canPaste,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onToggleLock,
  onToggleNetworksLock,
  flowPaused,
  onToggleFlow,
  isFullscreen,
  onToggleFullscreen,
  showMinimap = true,
  onToggleMinimap,
  showLegend = true,
  onToggleLegend,
  showEditControls = true,
  searchNodes,
  searchOpen,
  onSearchOpenChange,
  onSearchFocusNode,
}: {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  locked?: boolean;
  networksLocked?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  canCopy?: boolean;
  canPaste?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onToggleLock?: () => void;
  onToggleNetworksLock?: () => void;
  flowPaused: boolean;
  onToggleFlow: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showMinimap?: boolean;
  onToggleMinimap?: () => void;
  showLegend?: boolean;
  onToggleLegend?: () => void;
  showEditControls?: boolean;
  searchNodes: TopologyNode[];
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  onSearchFocusNode: (nodeId: string) => void;
}) {
  const btnStyle = (active: boolean, warn = false, disabled = false): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.25)',
    background: warn ? 'rgba(0,0,0,0.55)' : active ? 'rgba(46,125,50,0.85)' : 'rgba(0,0,0,0.45)',
    color: disabled ? 'rgba(255,255,255,0.35)' : warn ? '#ffb74d' : '#fff',
    fontSize: 11,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  });

  const iconBtnStyle = (disabled = false): React.CSSProperties => ({
    ...btnStyle(false, false, disabled),
    padding: '4px 8px',
    minWidth: 30,
    justifyContent: 'center',
  });

  const toolBtnStyle = (active: boolean): React.CSSProperties => ({
    ...btnStyle(active),
    padding: '4px 8px',
    minWidth: 30,
    justifyContent: 'center',
  });

  return (
    <div className={toolbarStyle}>
      {!isFullscreen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            onClick={() => onToolChange('select')}
            title="Selecionar (seta)"
            aria-label="Selecionar"
            aria-pressed={tool === 'select'}
            style={toolBtnStyle(tool === 'select')}
          >
            <FaArrowPointer size={13} />
          </button>
          <button
            type="button"
            onClick={() => onToolChange('pan')}
            title="Arrastar mapa (mão)"
            aria-label="Arrastar mapa"
            aria-pressed={tool === 'pan'}
            style={toolBtnStyle(tool === 'pan')}
          >
            <FaHand size={13} />
          </button>
        </div>
      )}
      {showEditControls && (
        <>
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
            style={iconBtnStyle(!canUndo)}
          >
            <Icon name="arrow-left" size="sm" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="Refazer (Ctrl+Shift+Z)"
            aria-label="Refazer"
            style={iconBtnStyle(!canRedo)}
          >
            <Icon name="arrow-right" size="sm" />
          </button>
          <button
            type="button"
            disabled={!canCopy}
            onClick={onCopy}
            title="Copiar seleção (Ctrl+C)"
            aria-label="Copiar seleção"
            style={iconBtnStyle(!canCopy)}
          >
            <FaCopy size={13} />
          </button>
          <button
            type="button"
            disabled={!canPaste}
            onClick={onPaste}
            title="Colar (Ctrl+V)"
            aria-label="Colar"
            style={iconBtnStyle(!canPaste)}
          >
            <FaPaste size={13} />
          </button>
          <button
            type="button"
            onClick={onToggleLock}
            title={locked ? 'Destravar edição no mapa' : 'Travar edição no mapa'}
            style={btnStyle(!locked, Boolean(locked))}
          >
            <Icon name={locked ? 'lock' : 'unlock'} size="sm" />
            {locked ? 'Mapa travado' : 'Mapa editável'}
          </button>
          <button
            type="button"
            onClick={onToggleNetworksLock}
            title={
              networksLocked
                ? 'Destravar caixas de rede para arrastar'
                : 'Travar caixas de rede (só mover o mapa)'
            }
            style={btnStyle(!networksLocked, Boolean(networksLocked))}
          >
            <Icon name={networksLocked ? 'lock' : 'unlock'} size="sm" />
            {networksLocked ? 'Redes travadas' : 'Redes livres'}
          </button>
          <button
            type="button"
            onClick={onToggleMinimap}
            title={showMinimap ? 'Ocultar mini mapa' : 'Mostrar mini mapa'}
            aria-label={showMinimap ? 'Ocultar mini mapa' : 'Mostrar mini mapa'}
            aria-pressed={showMinimap}
            style={toolBtnStyle(showMinimap)}
          >
            <FaMap size={13} />
          </button>
        </>
      )}
      {!isFullscreen && (
        <>
          <button
            type="button"
            onClick={onToggleFlow}
            title={
              flowPaused
                ? 'Retomar animação de tráfego nas linhas'
                : 'Pausar animação de tráfego nas linhas'
            }
            aria-label={flowPaused ? 'Retomar tráfego' : 'Pausar tráfego'}
            style={toolBtnStyle(!flowPaused)}
          >
            <Icon name={flowPaused ? 'play' : 'pause'} size="sm" />
          </button>
          <div className={searchWrapStyle}>
            <button
              type="button"
              onClick={() => onSearchOpenChange(!searchOpen)}
              title="Pesquisar no mapa (Ctrl+F)"
              aria-label="Pesquisar no mapa"
              aria-pressed={searchOpen}
              style={toolBtnStyle(searchOpen)}
            >
              <Icon name="search" size="sm" />
            </button>
            <TopologySearch
              nodes={searchNodes}
              open={searchOpen}
              onOpenChange={onSearchOpenChange}
              onFocusNode={onSearchFocusNode}
            />
          </div>
          <button
            type="button"
            onClick={onToggleLegend}
            title={showLegend ? 'Ocultar legenda' : 'Mostrar legenda'}
            aria-label={showLegend ? 'Ocultar legenda' : 'Mostrar legenda'}
            aria-pressed={showLegend}
            style={toolBtnStyle(showLegend)}
          >
            <FaListUl size={13} />
          </button>
          <button
            type="button"
            onClick={onToggleFullscreen}
            title="Abrir mapa em tela cheia"
            aria-label="Tela cheia"
            style={toolBtnStyle(false)}
          >
            <Icon name="expand-arrows-alt" size="sm" />
          </button>
        </>
      )}
    </div>
  );
}

const toastStyle = css`
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10050;
  padding: 8px 14px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.82);
  color: #fff;
  font-size: 12px;
  pointer-events: none;
  max-width: 90%;
  text-align: center;
`;

export function TopologyToast({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  const toast = <div className={toastStyle}>{message}</div>;
  if (typeof document === 'undefined') {
    return toast;
  }
  return createPortal(toast, document.body);
}
