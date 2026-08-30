import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCanvasSession } from './useCanvasSession';

describe('useCanvasSession', () => {
  it('ao travar o mapa, troca para a mão; ao destravar não força a seta', () => {
    const { result, rerender } = renderHook(
      ({ canEdit }: { canEdit: boolean }) => useCanvasSession(canEdit),
      { initialProps: { canEdit: true } }
    );
    expect(result.current.tool).toBe('select');

    act(() => {
      rerender({ canEdit: false });
    });
    expect(result.current.tool).toBe('pan');

    act(() => {
      rerender({ canEdit: true });
    });
    expect(result.current.tool).toBe('pan');
  });
});
