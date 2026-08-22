import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hostNode } from '../utils/testMapFixtures';
import { useHostHoverTarget } from './useHostHoverTarget';

describe('useHostHoverTarget', () => {
  it('mouseleave não fecha o peek fixado pelo toque', () => {
    const { result } = renderHook(() => useHostHoverTarget());
    const node = hostNode({ id: 'host-a' });

    act(() => {
      result.current.beginHostHover({ node, screenX: 10, screenY: 20, pinned: true });
    });
    expect(result.current.hostHover?.pinned).toBe(true);

    act(() => {
      result.current.endHostHover(node.id);
    });
    expect(result.current.hostHover?.node.id).toBe('host-a');

    act(() => {
      result.current.clearHostHover();
    });
    expect(result.current.hostHover).toBeNull();
  });
});
