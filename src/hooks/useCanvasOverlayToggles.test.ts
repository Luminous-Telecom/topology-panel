import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasOverlayToggles } from './useCanvasOverlayToggles';

describe('useCanvasOverlayToggles', () => {
  it('oculta o mini mapa na sessão mesmo sem persistir a opção', () => {
    const { result } = renderHook(() =>
      useCanvasOverlayToggles({ showMinimap: true })
    );

    expect(result.current.showMinimap).toBe(true);
    act(() => {
      result.current.handleToggleShowMinimap();
    });
    expect(result.current.showMinimap).toBe(false);
  });

  it('volta ao valor da opção quando a propriedade muda', () => {
    const { result, rerender } = renderHook(
      ({ showMinimap }) => useCanvasOverlayToggles({ showMinimap }),
      { initialProps: { showMinimap: true } }
    );

    act(() => {
      result.current.handleToggleShowMinimap();
    });
    expect(result.current.showMinimap).toBe(false);

    rerender({ showMinimap: false });
    expect(result.current.showMinimap).toBe(false);
    rerender({ showMinimap: true });
    expect(result.current.showMinimap).toBe(true);
  });

  it('tenta persistir quando há callback', () => {
    const onShowMinimapChange = vi.fn();
    const { result } = renderHook(() =>
      useCanvasOverlayToggles({ showMinimap: true, onShowMinimapChange })
    );

    act(() => {
      result.current.handleToggleShowMinimap();
    });
    expect(onShowMinimapChange).toHaveBeenCalledWith(false);
  });
});
