import { RefObject, useEffect } from 'react';
import { TopologyLink } from '../types';
import { hasTopologyClipboard } from '../utils/topologyClipboard';

export interface CanvasKeyboardShortcutsParams {
  /** Container do canvas — só reagimos a atalhos quando ele está sob o mouse ou com foco. */
  wrapRef: RefObject<HTMLDivElement | null>;
  canPersist: boolean;
  canEditCanvas: boolean;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  selectedNodeIds: string[];
  selectedLink: TopologyLink | null;
  onUndo?: () => void;
  onRedo?: () => void;
  copySelection: () => void;
  pasteAtViewCenter: () => void;
  deleteSelectedNodes: () => void;
  deleteSelectedLink: () => void;
  /** Esc fora da busca: sai do modo link, fecha menu e limpa seleção/marquee/guias. */
  cancelInteractions: () => void;
}

/**
 * Atalhos do mapa: Ctrl+F, Esc, desfazer/refazer, copiar/colar e apagar.
 *
 * O listener é no `document` porque o SVG não recebe foco de teclado, então filtramos por campo de
 * texto ativo e por painel sob o mouse — senão um dashboard com dois mapas responderia duas vezes.
 */
export function useCanvasKeyboardShortcuts({
  wrapRef,
  canPersist,
  canEditCanvas,
  searchOpen,
  setSearchOpen,
  selectedNodeIds,
  selectedLink,
  onUndo,
  onRedo,
  copySelection,
  pasteAtViewCenter,
  deleteSelectedNodes,
  deleteSelectedLink,
  cancelInteractions,
}: CanvasKeyboardShortcutsParams) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const el = wrapRef.current;
        if (el && (searchOpen || el.matches(':hover') || el.contains(document.activeElement))) {
          e.preventDefault();
          setSearchOpen(true);
        }
        return;
      }

      if (e.key === 'Escape' && searchOpen) {
        e.preventDefault();
        setSearchOpen(false);
        return;
      }

      if (canPersist && !inField && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo?.();
        return;
      }
      if (
        canPersist &&
        !inField &&
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        onRedo?.();
        return;
      }

      const el = wrapRef.current;
      const panelActive = Boolean(el && (el.matches(':hover') || el.contains(document.activeElement)));

      if (canEditCanvas && !inField && panelActive) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
          if (selectedNodeIds.length > 0 || selectedLink) {
            e.preventDefault();
            copySelection();
          }
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
          if (hasTopologyClipboard()) {
            e.preventDefault();
            pasteAtViewCenter();
          }
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedNodeIds.length > 0) {
            e.preventDefault();
            deleteSelectedNodes();
            return;
          }
          if (selectedLink) {
            e.preventDefault();
            deleteSelectedLink();
            return;
          }
        }
      }

      if (!canEditCanvas) {
        return;
      }

      if (e.key === 'Escape') {
        cancelInteractions();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    cancelInteractions,
    canEditCanvas,
    canPersist,
    copySelection,
    deleteSelectedLink,
    deleteSelectedNodes,
    onRedo,
    onUndo,
    pasteAtViewCenter,
    searchOpen,
    selectedLink,
    selectedNodeIds,
    setSearchOpen,
    wrapRef,
  ]);
}
