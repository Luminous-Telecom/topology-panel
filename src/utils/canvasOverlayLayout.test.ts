import { describe, expect, it } from 'vitest';
import { CANVAS_EDGE_GAP, MINIMAP_HEIGHT, minimapBottomOffset } from './canvasOverlayLayout';
import { MAP_NATIVE_SCROLLBAR_PX } from './mapBounds';

describe('minimapBottomOffset', () => {
  it('sem minimapa reserva a barra nativa abaixo da lista de alertas', () => {
    expect(minimapBottomOffset(false)).toBe(CANVAS_EDGE_GAP + MAP_NATIVE_SCROLLBAR_PX);
  });

  it('com minimapa senta a lista acima do card, sem somar a barra de novo', () => {
    expect(minimapBottomOffset(true)).toBe(CANVAS_EDGE_GAP + MINIMAP_HEIGHT + CANVAS_EDGE_GAP);
  });
});
