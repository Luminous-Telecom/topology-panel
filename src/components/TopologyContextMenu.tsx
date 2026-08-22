import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { overlayPortalRoot } from '../utils/overlayPortal';

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
    background: rgba(13, 17, 23, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.22);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    border-radius: 8px;
    padding: 4px 0;
    font-size: 13px;
    color: #f2f4f7;
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
      background: rgba(79, 195, 247, 0.18);
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
      background: rgba(229, 57, 53, 0.22);
    }
  `,
  iconAdd: css`
    color: #ef9a9a;
    font-weight: 700;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  `,
  iconDelete: css`
    color: #ef9a9a;
    font-weight: 700;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  `,
  iconTool: css`
    color: rgba(255, 255, 255, 0.68);
    width: 14px;
    text-align: center;
    flex-shrink: 0;
    font-size: 11px;
  `,
  submenuArrow: css`
    margin-left: auto;
    color: rgba(255, 255, 255, 0.55);
    font-size: 10px;
  `,
  separator: css`
    height: 1px;
    margin: 4px 0;
    background: rgba(255, 255, 255, 0.12);
  `,
  submenu: css`
    position: absolute;
    left: 100%;
    top: -4px;
    min-width: 140px;
    background: rgba(13, 17, 23, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.22);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    border-radius: 8px;
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

  useEscapeKey(onClose);

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

  return createPortal(menu, overlayPortalRoot());
}
