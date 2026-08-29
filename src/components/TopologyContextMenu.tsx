import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { overlayPortalRoot } from '../utils/overlayPortal';
import styles from './TopologyContextMenu.module.scss';

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
