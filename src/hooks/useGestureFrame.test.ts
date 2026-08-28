import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGestureFrame } from './useGestureFrame';

/** Um frame de 60 fps — o suficiente para o rAF falso disparar. */
const FRAME_MS = 16;

describe('useGestureFrame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('agrupa vários schedule do mesmo frame num commit só, com o último valor', () => {
    const { result } = renderHook(() => useGestureFrame());
    const commits: number[] = [];

    act(() => {
      result.current.schedule(() => commits.push(1));
      result.current.schedule(() => commits.push(2));
      result.current.schedule(() => commits.push(3));
    });
    expect(commits).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(FRAME_MS);
    });
    expect(commits).toEqual([3]);
  });

  it('volta a agendar depois que o frame roda', () => {
    const { result } = renderHook(() => useGestureFrame());
    const commits: string[] = [];

    act(() => {
      result.current.schedule(() => commits.push('primeiro'));
      vi.advanceTimersByTime(FRAME_MS);
      result.current.schedule(() => commits.push('segundo'));
      vi.advanceTimersByTime(FRAME_MS);
    });

    expect(commits).toEqual(['primeiro', 'segundo']);
  });

  it('cancel descarta o commit pendente — o preview não ressuscita depois do gesto fechar', () => {
    const { result } = renderHook(() => useGestureFrame());
    const commit = vi.fn();

    act(() => {
      result.current.schedule(commit);
      result.current.cancel();
      vi.advanceTimersByTime(FRAME_MS);
    });

    expect(commit).not.toHaveBeenCalled();
  });

  it('cancel sem nada pendente não quebra e não impede o próximo schedule', () => {
    const { result } = renderHook(() => useGestureFrame());
    const commit = vi.fn();

    act(() => {
      result.current.cancel();
      result.current.schedule(commit);
      vi.advanceTimersByTime(FRAME_MS);
    });

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('desmontar cancela o frame pendente — nada de setState em componente já removido', () => {
    const { result, unmount } = renderHook(() => useGestureFrame());
    const commit = vi.fn();

    act(() => {
      result.current.schedule(commit);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(FRAME_MS);
    });

    expect(commit).not.toHaveBeenCalled();
  });

  it('mantém a identidade estável entre renders para não remontar quem depende dele', () => {
    const { result, rerender } = renderHook(() => useGestureFrame());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
