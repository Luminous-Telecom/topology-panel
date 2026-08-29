import { describe, expect, it, vi } from 'vitest';
import { createCanvasGestureStore, EMPTY_CANVAS_GESTURE_UI } from './canvasGestureStore';

describe('createCanvasGestureStore', () => {
  it('começa vazio e avisa os assinantes no set', () => {
    const store = createCanvasGestureStore();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.get()).toBe(EMPTY_CANVAS_GESTURE_UI);

    store.set({ dragPreview: { positions: { 'host-1': { x: 10, y: 20 } } } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get().dragPreview?.positions?.['host-1']).toEqual({ x: 10, y: 20 });
  });

  it('reset volta ao vazio e não emite de novo se já estava vazio', () => {
    const store = createCanvasGestureStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ marqueeRect: { x0: 0, y0: 0, x1: 4, y1: 4 } });
    store.reset();
    expect(store.get()).toBe(EMPTY_CANVAS_GESTURE_UI);
    expect(listener).toHaveBeenCalledTimes(2);

    store.reset();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe para de receber emit', () => {
    const store = createCanvasGestureStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set({ alignGuides: [] });
    expect(listener).not.toHaveBeenCalled();
  });
});
