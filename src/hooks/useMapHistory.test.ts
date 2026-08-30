import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TopologyMap } from '../types';
import { useMapHistory } from './useMapHistory';

function map(overrides?: Partial<TopologyMap>): TopologyMap {
  return { width: 800, height: 600, nodes: [], links: [], ...overrides };
}

function renderMapHistory(initialMap: TopologyMap) {
  const applyMap = vi.fn();
  const utils = renderHook(
    ({ currentMap }: { currentMap: TopologyMap }) => useMapHistory(currentMap, applyMap),
    { initialProps: { currentMap: initialMap } }
  );
  return { ...utils, applyMap };
}

describe('useMapHistory', () => {
  it('sem histórico, canUndo/canRedo começam falsos', () => {
    const { result } = renderMapHistory(map());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('commitChange empilha o estado anterior e habilita undo', () => {
    const { result, applyMap } = renderMapHistory(map());
    act(() => {
      result.current.commitChange(map({ nodes: [{ id: 'a', type: 'host', x: 1, y: 1 }] }));
    });
    expect(result.current.canUndo).toBe(true);
    expect(applyMap).toHaveBeenCalledTimes(1);
  });

  it('undo restaura o mapa anterior e habilita redo', () => {
    const initial = map();
    const { result, applyMap } = renderMapHistory(initial);
    const changed = map({ nodes: [{ id: 'a', type: 'host', x: 1, y: 1 }] });
    act(() => {
      result.current.commitChange(changed);
    });
    act(() => {
      result.current.undo();
    });
    expect(applyMap).toHaveBeenLastCalledWith(initial);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('redo reaplica o mapa desfeito e volta a habilitar undo', () => {
    const { result, applyMap } = renderMapHistory(map());
    const changed = map({ nodes: [{ id: 'a', type: 'host', x: 1, y: 1 }] });
    act(() => {
      result.current.commitChange(changed);
    });
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.redo();
    });
    expect(applyMap).toHaveBeenLastCalledWith(changed);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('commitChange sem alteração real (mesmo JSON) não empilha histórico', () => {
    const initial = map();
    const { result } = renderMapHistory(initial);
    act(() => {
      result.current.commitChange(map());
    });
    expect(result.current.canUndo).toBe(false);
  });

  it('novo commit após undo descarta o "futuro" (redo) anterior', () => {
    const { result } = renderMapHistory(map());
    act(() => {
      result.current.commitChange(map({ nodes: [{ id: 'a', type: 'host', x: 1, y: 1 }] }));
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);
    act(() => {
      result.current.commitChange(map({ nodes: [{ id: 'b', type: 'host', x: 2, y: 2 }] }));
    });
    expect(result.current.canRedo).toBe(false);
  });

  it('limita o histórico a 50 entradas (undo antigo demais é descartado)', () => {
    const { result } = renderMapHistory(map());
    for (let i = 0; i < 60; i += 1) {
      act(() => {
        result.current.commitChange(map({ nodes: [{ id: `n-${i}`, type: 'host', x: i, y: i }] }));
      });
    }
    let undoCount = 0;
    while (result.current.canUndo && undoCount < 100) {
      act(() => {
        result.current.undo();
      });
      undoCount += 1;
    }
    expect(undoCount).toBe(50);
  });

  it('reset do histórico quando o mapa muda externamente (dashboard recarregado)', () => {
    const initial = map();
    const applyMap = vi.fn();
    const { result, rerender } = renderHook(
      ({ currentMap }: { currentMap: TopologyMap }) => useMapHistory(currentMap, applyMap),
      { initialProps: { currentMap: initial } }
    );
    act(() => {
      result.current.commitChange(map({ nodes: [{ id: 'a', type: 'host', x: 1, y: 1 }] }));
    });
    expect(result.current.canUndo).toBe(true);

    const reloaded = map({ nodes: [{ id: 'reloaded', type: 'host', x: 9, y: 9 }] });
    rerender({ currentMap: reloaded });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('com persistRemote, o pointerup não aplica mapa nem grava no Grafana', async () => {
    const applyMap = vi.fn();
    const persistRemote = vi.fn();
    const { result } = renderHook(() => useMapHistory(map(), applyMap, persistRemote));
    const changed = map({ nodes: [{ id: 'a', type: 'host', x: 1, y: 1 }] });
    act(() => {
      result.current.commitChange(changed);
    });
    expect(applyMap).not.toHaveBeenCalled();
    expect(persistRemote).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => resolve(), 0);
          });
        });
      });
    });
    expect(applyMap).not.toHaveBeenCalled();
    expect(persistRemote).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 150);
      });
    });
    expect(applyMap).toHaveBeenCalledTimes(1);
    expect(persistRemote).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 450);
      });
    });
    expect(persistRemote).toHaveBeenCalledTimes(1);
    expect(persistRemote).toHaveBeenCalledWith(changed);
  });

  it('eco do mesmo objeto de mapa não zera o histórico', () => {
    const initial = map();
    const applyMap = vi.fn();
    const { result, rerender } = renderHook(
      ({ currentMap }: { currentMap: TopologyMap }) => useMapHistory(currentMap, applyMap),
      { initialProps: { currentMap: initial } }
    );
    const changed = map({ nodes: [{ id: 'a', type: 'host', x: 1, y: 1 }] });
    act(() => {
      result.current.commitChange(changed);
    });
    rerender({ currentMap: changed });
    expect(result.current.canUndo).toBe(true);
  });

  it('eco do Grafana (clone JSON, mesma geometria) não zera o histórico', () => {
    const initial = map();
    const applyMap = vi.fn();
    const { result, rerender } = renderHook(
      ({ currentMap }: { currentMap: TopologyMap }) => useMapHistory(currentMap, applyMap),
      { initialProps: { currentMap: initial } }
    );
    const changed = map({
      nodes: [{ id: 'a', type: 'host', x: 1, y: 1 }],
      links: [{ from: 'a', to: 'a', medium: 'fiber' }],
    });
    act(() => {
      result.current.commitChange(changed);
    });
    const cloned = JSON.parse(JSON.stringify(changed)) as TopologyMap;
    rerender({ currentMap: cloned });
    expect(result.current.canUndo).toBe(true);
  });

  it('o histórico guarda um clone: mutar o mapa anterior não altera o undo', () => {
    const initial = map({ nodes: [{ id: 'a', type: 'host', x: 0, y: 0 }] });
    const { result, applyMap } = renderMapHistory(initial);
    act(() => {
      result.current.commitChange(map({ nodes: [{ id: 'a', type: 'host', x: 1, y: 1 }] }));
    });
    initial.nodes[0].x = 50;
    act(() => {
      result.current.undo();
    });
    const restored = applyMap.mock.calls[applyMap.mock.calls.length - 1][0] as TopologyMap;
    expect(restored.nodes[0].x).toBe(0);
  });
});
