import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleHide } from './useIdleHide';

function makeWrap(withChrome = true) {
  const wrap = document.createElement('div');
  const chrome = document.createElement('button');
  chrome.setAttribute('data-topology-chrome', '');
  if (withChrome) {
    wrap.appendChild(chrome);
  }
  document.body.appendChild(wrap);
  return { wrap, chrome, wrapRef: { current: wrap } };
}

describe('useIdleHide', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('desligado permanece visível depois do tempo ocioso', () => {
    const { wrapRef } = makeWrap();
    const { result } = renderHook(() => useIdleHide({ enabled: false, wrapRef, idleMs: 1000 }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);
  });

  it('em tela cheia esconde o chrome após o tempo sem movimento do mouse', () => {
    const { wrapRef } = makeWrap();
    const { result } = renderHook(() => useIdleHide({ enabled: true, wrapRef, idleMs: 1000 }));
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('pointermove no mapa mostra o chrome de novo e reinicia o timer', () => {
    const { wrap, wrapRef } = makeWrap();
    const { result } = renderHook(() => useIdleHide({ enabled: true, wrapRef, idleMs: 1000 }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(true);
    act(() => {
      wrap.dispatchEvent(new Event('pointermove', { bubbles: true }));
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('pointermove sobre o chrome cancela o hide enquanto o mouse está nos botões', () => {
    const { chrome, wrapRef } = makeWrap();
    const { result } = renderHook(() => useIdleHide({ enabled: true, wrapRef, idleMs: 1000 }));
    act(() => {
      chrome.dispatchEvent(new Event('pointermove', { bubbles: true }));
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(false);
  });

  it('paused (busca aberta) não esconde o chrome', () => {
    const { wrapRef } = makeWrap();
    const { result, rerender } = renderHook(
      ({ paused }: { paused: boolean }) => useIdleHide({ enabled: true, wrapRef, idleMs: 1000, paused }),
      { initialProps: { paused: true } }
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(false);
    act(() => {
      rerender({ paused: false });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(true);
  });

  it('ao sair da tela cheia o chrome volta visível', () => {
    const { wrapRef } = makeWrap();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useIdleHide({ enabled, wrapRef, idleMs: 1000 }),
      { initialProps: { enabled: true } }
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(true);
    act(() => {
      rerender({ enabled: false });
    });
    expect(result.current).toBe(false);
  });
});
