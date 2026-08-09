import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { Icon } from '@grafana/ui';
import { TopologyDashboardChoice } from '../types';
import { openDashboardUrl } from './DashboardPickerModal';

interface Props {
  label?: string;
  choices: TopologyDashboardChoice[];
}

const barStyle = css`
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
`;

const menuStyle = css`
  position: fixed;
  z-index: 10020;
  min-width: 220px;
  max-width: min(360px, 90vw);
  max-height: min(50vh, 360px);
  overflow-y: auto;
  background: #fff;
  border: 1px solid #c7c7c7;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
  padding: 4px 0;
  font-size: 13px;
  color: #222;
`;

const itemStyle = css`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  &:hover {
    background: #e8f4fc;
  }
`;

const itemTitle = css`
  font-weight: 600;
`;

const itemUid = css`
  font-size: 11px;
  color: #666;
`;

const emptyStyle = css`
  padding: 10px 12px;
  color: #666;
  font-size: 12px;
`;

export function DashboardNavButton({ label = 'Dashboards', choices }: Props) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const valid = choices.filter((c) => c.uid?.trim());

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, open]);

  if (valid.length === 0) {
    return null;
  }

  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.25)',
    background: open ? 'rgba(21,101,192,0.9)' : 'rgba(0,0,0,0.45)',
    color: '#fff',
    fontSize: 11,
    cursor: 'pointer',
  };

  const menu = open ? (
    <>
      <div
        aria-hidden
        style={{ position: 'fixed', inset: 0, zIndex: 10019 }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          close();
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          close();
        }}
      />
      <div
        className={menuStyle}
        style={{ left: menuPos.x, top: menuPos.y }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {valid.map((choice) => {
          const title = choice.title?.trim() || choice.uid;
          return (
            <button
              key={choice.uid}
              type="button"
              className={itemStyle}
              onClick={() => {
                close();
                openDashboardUrl(choice.uid, choice.slug);
              }}
            >
              <span className={itemTitle}>{title}</span>
              {choice.title?.trim() && choice.title.trim() !== choice.uid ? (
                <span className={itemUid}>{choice.uid}</span>
              ) : null}
            </button>
          );
        })}
        {valid.length === 0 && (
          <div className={emptyStyle}>Nenhum dashboard configurado nas opções do painel.</div>
        )}
      </div>
    </>
  ) : null;

  return (
    <div
      className={barStyle}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        type="button"
        style={btnStyle}
        title="Abrir outro dashboard"
        onClick={(e) => {
          e.stopPropagation();
          if (open) {
            close();
            return;
          }
          const rect = btnRef.current?.getBoundingClientRect();
          setMenuPos({
            x: rect ? rect.left : e.clientX,
            y: rect ? rect.bottom + 4 : e.clientY,
          });
          setOpen(true);
        }}
      >
        <Icon name="apps" size="sm" />
        {label}
        <span aria-hidden style={{ opacity: 0.85, fontSize: 10 }}>
          ▾
        </span>
      </button>
      {menu && typeof document !== 'undefined' ? createPortal(menu, document.body) : menu}
    </div>
  );
}
