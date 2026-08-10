import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css, cx } from '@emotion/css';
import { IconButton, Modal, ModalProps, Stack, useTheme2 } from '@grafana/ui';

/** Acima do chrome do Grafana (menu lateral do painel em modo edição). */
const MODAL_Z_BACKDROP = 10000;
const MODAL_Z_SHELL = 10001;

type Props = Omit<ModalProps, 'title'> & {
  title: string;
};

function DraggableModalComponent({
  title,
  className,
  contentClassName,
  children,
  isOpen = false,
  closeOnEscape = true,
  closeOnBackdropClick = true,
  onDismiss,
  onClickBackdrop,
}: React.PropsWithChildren<Props>) {
  const theme = useTheme2();
  const offsetRef = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const draggedRef = useRef(false);

  const applyOffset = useCallback((x: number, y: number) => {
    const next = { x, y };
    offsetRef.current = next;
    setOffset(next);
  }, []);

  useEffect(() => {
    if (!isOpen || !closeOnEscape) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss?.();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [closeOnEscape, isOpen, onDismiss]);

  /** Bloqueia handlers do Grafana só enquanto o arraste está ativo. */
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      e.stopPropagation();
      draggedRef.current = true;
      applyOffset(
        drag.originX + (e.clientX - drag.startX),
        drag.originY + (e.clientY - drag.startY)
      );
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragRef.current) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = null;
    };

    document.addEventListener('pointermove', onPointerMove, { capture: true });
    document.addEventListener('pointerup', onPointerUp, { capture: true });
    document.addEventListener('pointercancel', onPointerUp, { capture: true });
    return () => {
      document.removeEventListener('pointermove', onPointerMove, { capture: true });
      document.removeEventListener('pointerup', onPointerUp, { capture: true });
      document.removeEventListener('pointercancel', onPointerUp, { capture: true });
    };
  }, [applyOffset]);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    draggedRef.current = false;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const onBackdropPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  const onBackdropClick = useCallback(() => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (onClickBackdrop) {
      onClickBackdrop();
      return;
    }
    if (closeOnBackdropClick) {
      onDismiss?.();
    }
  }, [closeOnBackdropClick, onClickBackdrop, onDismiss]);

  if (!isOpen) {
    return null;
  }

  const backdropClass = css`
    position: fixed;
    inset: 0;
    z-index: ${MODAL_Z_BACKDROP};
    background: ${theme.components.overlay.background};
  `;

  const shellClass = css`
    position: fixed;
    left: 50%;
    top: 10%;
    z-index: ${MODAL_Z_SHELL};
    width: 750px;
    max-width: calc(100vw - 32px);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    border-radius: ${theme.shape.radius.default};
    border: 1px solid ${theme.colors.border.weak};
    background: ${theme.colors.background.primary};
    box-shadow: ${theme.shadows.z3};
    outline: none;
    transform: translate(calc(-50% + ${offset.x}px), ${offset.y}px);
  `;

  const headerClass = css`
    display: flex;
    align-items: center;
    min-height: 42px;
    margin: ${theme.spacing(1, 2, 0, 2)};
    cursor: move;
    user-select: none;
    touch-action: none;
  `;

  const titleClass = css`
    flex: 1;
    min-width: 0;
    margin: ${theme.spacing(0, 4, 0, 1)};
    font-size: ${theme.typography.size.lg};
    font-weight: ${theme.typography.fontWeightMedium};
    line-height: 1.2;
    position: relative;
    top: 2px;
  `;

  const contentClass = css`
    overflow: auto;
    padding: ${theme.spacing(3)};
    width: 100%;
  `;

  return createPortal(
    <>
      <div
        role="presentation"
        className={backdropClass}
        onPointerDown={onBackdropPointerDown}
        onClick={onBackdropClick}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(shellClass, className)}
      >
        <div
          className={headerClass}
          onPointerDown={onHeaderPointerDown}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <h2 className={titleClass}>{title}</h2>
          <Stack justifyContent="flex-end">
            <IconButton
              name="times"
              size="xl"
              onClick={onDismiss}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Fechar"
            />
          </Stack>
        </div>
        <div className={cx(contentClass, contentClassName)}>{children}</div>
      </div>
    </>,
    document.body
  );
}

export const DraggableModal = Object.assign(DraggableModalComponent, {
  ButtonRow: Modal.ButtonRow,
});
