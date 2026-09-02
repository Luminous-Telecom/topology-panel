import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopologyMap, TopologyView } from '../types';
import { clearTopologyClipboard, copyTopologySelection } from '../utils/topologyClipboard';
import { emptyMap, hostNode } from '../utils/testMapFixtures';
import { useTopologyClipboardActions } from './useTopologyClipboardActions';

const view: TopologyView = { x: 0, y: 0, scale: 1 };

function renderClipboardHook(overrides?: {
  map?: TopologyMap;
  storedMap?: TopologyMap;
  selectedNodeIds?: string[];
}) {
  const map =
    overrides?.map ??
    emptyMap({
      nodes: [hostNode({ id: 'host-a', label: 'Host A', x: 100, y: 200 })],
    });
  const storedMap = overrides?.storedMap ?? map;
  const showToast = vi.fn();
  const persist = vi.fn();
  const setSelectedNodeIds = vi.fn();
  const setSelectedLink = vi.fn();
  const closeContextMenu = vi.fn();
  const snapCoord = (n: number) => n;
  const wrapRef = createRef<HTMLDivElement>();

  const utils = renderHook(() =>
    useTopologyClipboardActions({
      map,
      storedMap,
      selectedNodeIds: overrides?.selectedNodeIds ?? ['host-a'],
      selectedLink: null,
      showToast,
      persist,
      snapCoord,
      setSelectedNodeIds,
      setSelectedLink,
      closeContextMenu,
      wrapRef,
      view,
    })
  );

  return {
    ...utils,
    map,
    storedMap,
    showToast,
    persist,
    setSelectedNodeIds,
    setSelectedLink,
    closeContextMenu,
    wrapRef,
  };
}

describe('useTopologyClipboardActions', () => {
  beforeEach(() => {
    clearTopologyClipboard();
  });

  it('clipboardReady reflete o conteúdo compartilhado', () => {
    const { result } = renderClipboardHook({ selectedNodeIds: [] });
    expect(result.current.clipboardReady).toBe(false);

    act(() => {
      copyTopologySelection(
        emptyMap({ nodes: [hostNode({ id: 'host-a' })] }),
        emptyMap({ nodes: [hostNode({ id: 'host-a' })] }),
        ['host-a'],
        null
      );
    });

    expect(result.current.clipboardReady).toBe(true);
  });

  it('copySelection avisa quando não há seleção', () => {
    const { result, showToast } = renderClipboardHook({ selectedNodeIds: [] });

    act(() => {
      result.current.copySelection();
    });

    expect(showToast).toHaveBeenCalledWith('Nada selecionado para copiar');
  });

  it('copySelection confirma quantos elementos foram copiados', () => {
    const { result, showToast } = renderClipboardHook();

    act(() => {
      result.current.copySelection();
    });

    expect(showToast).toHaveBeenCalledWith('1 elemento(s) copiado(s)');
  });

  it('pasteAt avisa quando o clipboard está vazio', () => {
    const { result, showToast, persist } = renderClipboardHook({ selectedNodeIds: [] });

    act(() => {
      result.current.pasteAt(50, 60);
    });

    expect(showToast).toHaveBeenCalledWith('Nada copiado — selecione e use Ctrl+C primeiro');
    expect(persist).not.toHaveBeenCalled();
  });

  it('pasteAt persiste o mapa e seleciona os nós colados', () => {
    const storedMap = emptyMap({
      nodes: [hostNode({ id: 'host-a', label: 'Host A', x: 100, y: 200 })],
    });
    const { result, showToast, persist, setSelectedNodeIds, setSelectedLink, closeContextMenu } =
      renderClipboardHook({ storedMap });

    act(() => {
      result.current.copySelection();
    });

    act(() => {
      result.current.pasteAt(300, 400);
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0].nodes.length).toBe(2);
    expect(setSelectedNodeIds).toHaveBeenCalledWith(expect.arrayContaining([expect.any(String)]));
    expect(setSelectedLink).toHaveBeenCalledWith(null);
    expect(closeContextMenu).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('1 elemento(s) colado(s)');
  });

  it('pasteAtViewCenter usa o centro visível do container', () => {
    const wrap = document.createElement('div');
    Object.defineProperty(wrap, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(wrap, 'clientHeight', { value: 600, configurable: true });
    document.body.appendChild(wrap);

    const storedMap = emptyMap({
      nodes: [hostNode({ id: 'host-a', x: 10, y: 10 })],
    });
    const showToast = vi.fn();
    const persist = vi.fn();
    const wrapRef = { current: wrap };

    const { result } = renderHook(() =>
      useTopologyClipboardActions({
        map: storedMap,
        storedMap,
        selectedNodeIds: ['host-a'],
        selectedLink: null,
        showToast,
        persist,
        snapCoord: (n) => n,
        setSelectedNodeIds: vi.fn(),
        setSelectedLink: vi.fn(),
        closeContextMenu: vi.fn(),
        wrapRef,
        view,
      })
    );

    act(() => {
      result.current.copySelection();
    });

    act(() => {
      result.current.pasteAtViewCenter();
    });

    expect(persist).toHaveBeenCalledTimes(1);
    wrap.remove();
  });
});
