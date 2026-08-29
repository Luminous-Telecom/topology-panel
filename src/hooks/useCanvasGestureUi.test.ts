import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createCanvasGestureStore } from '../utils/canvasGestureStore';
import { useCanvasGestureUi } from './useCanvasGestureUi';

describe('useCanvasGestureUi', () => {
  it('re-renderiza o assinante quando o preview muda e não quando reset já vazio', () => {
    const store = createCanvasGestureStore();
    const { result } = renderHook(() => useCanvasGestureUi(store));

    expect(result.current.dragPreview).toBeNull();

    act(() => {
      store.set({ dragPreview: { positions: { a: { x: 4, y: 8 } } } });
    });
    expect(result.current.dragPreview?.positions?.a).toEqual({ x: 4, y: 8 });

    act(() => {
      store.reset();
    });
    expect(result.current.dragPreview).toBeNull();
  });
});
