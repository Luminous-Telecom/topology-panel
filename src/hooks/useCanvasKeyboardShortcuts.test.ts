import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTopologyClipboard, copyTopologySelection } from '../utils/topologyClipboard';
import { emptyMap, hostNode } from '../utils/testMapFixtures';
import { useCanvasKeyboardShortcuts } from './useCanvasKeyboardShortcuts';

function mountWrap(): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.tabIndex = 0;
  document.body.appendChild(wrap);
  wrap.focus();
  return wrap;
}

function renderShortcuts(overrides?: Partial<Parameters<typeof useCanvasKeyboardShortcuts>[0]>) {
  const wrapRef = { current: null as HTMLDivElement | null };
  const copySelection = vi.fn();
  const pasteAtViewCenter = vi.fn();
  const deleteSelectedNodes = vi.fn();
  const deleteSelectedLink = vi.fn();
  const cancelInteractions = vi.fn();
  const onUndo = vi.fn();
  const onRedo = vi.fn();
  const setSearchOpen = vi.fn();

  renderHook(() =>
    useCanvasKeyboardShortcuts({
      wrapRef,
      canPersist: true,
      canEditCanvas: true,
      searchOpen: false,
      setSearchOpen,
      selectedNodeIds: [],
      selectedLink: null,
      onUndo,
      onRedo,
      copySelection,
      pasteAtViewCenter,
      deleteSelectedNodes,
      deleteSelectedLink,
      cancelInteractions,
      ...overrides,
    })
  );

  return {
    wrapRef,
    copySelection,
    pasteAtViewCenter,
    deleteSelectedNodes,
    deleteSelectedLink,
    cancelInteractions,
    onUndo,
    onRedo,
    setSearchOpen,
  };
}

function keyDown(init: KeyboardEventInit, target: EventTarget = document): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
}

describe('useCanvasKeyboardShortcuts', () => {
  beforeEach(() => {
    clearTopologyClipboard();
    document.body.innerHTML = '';
  });

  it('Ctrl+Z desfaz quando o painel pode persistir e o foco não está em campo de texto', () => {
    const { onUndo, wrapRef } = renderShortcuts();
    wrapRef.current = mountWrap();

    keyDown({ key: 'z', ctrlKey: true });

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+Z refaz', () => {
    const { onRedo, wrapRef } = renderShortcuts();
    wrapRef.current = mountWrap();

    keyDown({ key: 'z', ctrlKey: true, shiftKey: true });

    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+C copia quando há seleção e o painel está ativo', () => {
    const { copySelection, wrapRef } = renderShortcuts({ selectedNodeIds: ['host-a'] });
    wrapRef.current = mountWrap();

    keyDown({ key: 'c', ctrlKey: true });

    expect(copySelection).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+C não copia sem seleção', () => {
    const { copySelection, wrapRef } = renderShortcuts({ selectedNodeIds: [] });
    wrapRef.current = mountWrap();

    keyDown({ key: 'c', ctrlKey: true });

    expect(copySelection).not.toHaveBeenCalled();
  });

  it('Ctrl+V cola quando há conteúdo no clipboard compartilhado', () => {
    copyTopologySelection(
      emptyMap({ nodes: [hostNode({ id: 'host-a' })] }),
      emptyMap({ nodes: [hostNode({ id: 'host-a' })] }),
      ['host-a'],
      null
    );
    const { pasteAtViewCenter, wrapRef } = renderShortcuts();
    wrapRef.current = mountWrap();

    keyDown({ key: 'v', ctrlKey: true });

    expect(pasteAtViewCenter).toHaveBeenCalledTimes(1);
  });

  it('Delete remove nós selecionados', () => {
    const { deleteSelectedNodes, wrapRef } = renderShortcuts({ selectedNodeIds: ['host-a'] });
    wrapRef.current = mountWrap();

    keyDown({ key: 'Delete' });

    expect(deleteSelectedNodes).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+F abre a busca quando o painel está ativo', () => {
    const { setSearchOpen, wrapRef } = renderShortcuts();
    wrapRef.current = mountWrap();

    keyDown({ key: 'f', ctrlKey: true });

    expect(setSearchOpen).toHaveBeenCalledWith(true);
  });

  it('Esc cancela interações quando a busca está fechada', () => {
    const { cancelInteractions, wrapRef } = renderShortcuts();
    wrapRef.current = mountWrap();

    keyDown({ key: 'Escape' });

    expect(cancelInteractions).toHaveBeenCalledTimes(1);
  });

  it('Esc com busca aberta só fecha a busca', () => {
    const { setSearchOpen, cancelInteractions } = renderShortcuts({ searchOpen: true });

    keyDown({ key: 'Escape' });

    expect(setSearchOpen).toHaveBeenCalledWith(false);
    expect(cancelInteractions).not.toHaveBeenCalled();
  });

  it('ignora atalhos quando o alvo é um campo de texto', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const { onUndo } = renderShortcuts();

    keyDown({ key: 'z', ctrlKey: true }, input);

    expect(onUndo).not.toHaveBeenCalled();
  });
});
