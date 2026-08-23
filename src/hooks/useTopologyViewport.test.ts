import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TopologyView } from '../types';
import { useTopologyViewport } from './useTopologyViewport';

/** `wrapRef.current` não precisa estar anexado ao `document` — os efeitos só leem
 * clientWidth/clientHeight/getBoundingClientRect/addEventListener, todos disponíveis num
 * elemento jsdom solto. */
function makeWrapRef() {
  return { current: document.createElement('div') };
}

function renderViewport(overrides?: {
  savedView?: TopologyView;
  onViewChange?: (view: TopologyView) => void;
  enableZoom?: boolean;
  mapNodesLength?: number;
  onFullscreenChange?: (fs: boolean) => void;
  showToast?: (message: string | undefined) => void;
}) {
  const wrapRef = makeWrapRef();
  const onPinchStart = vi.fn();
  const showToast = overrides?.showToast ?? vi.fn();
  const utils = renderHook(() =>
    useTopologyViewport({
      wrapRef,
      savedView: overrides?.savedView,
      onViewChange: overrides?.onViewChange,
      enableZoom: overrides?.enableZoom ?? true,
      mapNodesLength: overrides?.mapNodesLength ?? 0,
      onPinchStart,
      onFullscreenChange: overrides?.onFullscreenChange,
      showToast,
    })
  );
  return { ...utils, wrapRef, onPinchStart, showToast };
}

describe('useTopologyViewport', () => {
  it('usa a view salva (savedView) como estado inicial quando válida', () => {
    const savedView: TopologyView = { x: 12, y: -4, scale: 1.5 };
    const { result } = renderViewport({ savedView });
    expect(result.current.view).toEqual(savedView);
    expect(result.current.viewRef.current).toEqual(savedView);
  });

  it('sem savedView válida, começa em {x:0,y:0,scale:1}', () => {
    const { result } = renderViewport({ savedView: undefined });
    expect(result.current.view).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('commitView com objeto atualiza view e mantém viewRef sincronizado', () => {
    const { result } = renderViewport();
    act(() => {
      result.current.commitView({ x: 10, y: 20, scale: 2 });
    });
    expect(result.current.view).toEqual({ x: 10, y: 20, scale: 2 });
    expect(result.current.viewRef.current).toEqual({ x: 10, y: 20, scale: 2 });
  });

  it('commitView com função recebe o view anterior', () => {
    const savedView: TopologyView = { x: 5, y: 5, scale: 1 };
    const { result } = renderViewport({ savedView });
    act(() => {
      result.current.commitView((prev) => ({ ...prev, x: prev.x + 100 }));
    });
    expect(result.current.view).toEqual({ x: 105, y: 5, scale: 1 });
  });

  it('viewport começa em {w:0,h:0} — sem layout real, ResizeObserver (stub) não reporta tamanho', () => {
    const { result } = renderViewport();
    expect(result.current.viewport).toEqual({ w: 0, h: 0 });
    expect(result.current.viewportRef.current).toEqual({ w: 0, h: 0 });
  });

  it('pinchActiveRef começa false (nenhum pinch em andamento)', () => {
    const { result } = renderViewport();
    expect(result.current.pinchActiveRef.current).toBe(false);
  });

  it('isFullscreen começa false quando o elemento não é o fullscreenElement do documento', () => {
    const { result } = renderViewport();
    expect(result.current.isFullscreen).toBe(false);
  });

  it('onFullscreenChange(false) é chamado na sincronização inicial (montagem)', () => {
    const onFullscreenChange = vi.fn();
    renderViewport({ onFullscreenChange });
    expect(onFullscreenChange).toHaveBeenCalledWith(false);
  });

  it('toggleFullscreen mostra toast quando o navegador (jsdom) não suporta a Fullscreen API', async () => {
    const showToast = vi.fn();
    const { result } = renderViewport({ showToast });
    await act(async () => {
      await result.current.toggleFullscreen();
    });
    expect(showToast).toHaveBeenCalledWith('Não foi possível alternar a tela cheia neste navegador');
  });

  it('onViewChange é notificado (debounced) após a view mudar, mas não antes do fit inicial', () => {
    vi.useFakeTimers();
    try {
      const onViewChange = vi.fn();
      const savedView: TopologyView = { x: 0, y: 0, scale: 1 };
      const { result } = renderViewport({ savedView, onViewChange });

      act(() => {
        result.current.commitView({ x: 1, y: 1, scale: 1 });
      });
      // Debounce de 400ms — ainda não deve ter notificado.
      expect(onViewChange).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(onViewChange).toHaveBeenCalledWith({ x: 1, y: 1, scale: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('onViewChange não dispara no mount nem após o fit automático (persist: false)', () => {
    vi.useFakeTimers();
    try {
      const onViewChange = vi.fn();
      const { result } = renderViewport({ savedView: undefined, onViewChange });

      act(() => {
        result.current.commitView({ x: 40, y: 10, scale: 0.8 }, { persist: false });
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(onViewChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('depois de um fit sem persistir, pan/zoom do usuário ainda notifica onViewChange', () => {
    vi.useFakeTimers();
    try {
      const onViewChange = vi.fn();
      const { result } = renderViewport({ onViewChange });

      act(() => {
        result.current.commitView({ x: 40, y: 10, scale: 0.8 }, { persist: false });
      });
      act(() => {
        result.current.commitView({ x: 41, y: 12, scale: 0.8 });
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(onViewChange).toHaveBeenCalledWith({ x: 41, y: 12, scale: 0.8 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('onViewChange não é chamado se a view resultante for igual à savedView', () => {
    vi.useFakeTimers();
    try {
      const onViewChange = vi.fn();
      const savedView: TopologyView = { x: 3, y: 4, scale: 1 };
      const { result } = renderViewport({ savedView, onViewChange });

      act(() => {
        result.current.commitView({ x: 3, y: 4, scale: 1 });
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(onViewChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
