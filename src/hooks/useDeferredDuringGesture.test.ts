import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDeferredDuringGesture } from './useDeferredDuringGesture';

describe('useDeferredDuringGesture', () => {
  it('flush com o mesmo valor não dispara outro commit', () => {
    const gesture = { current: false };
    const { result } = renderHook(() => useDeferredDuringGesture('a', gesture));
    const first = result.current[0];
    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toBe(first);
  });
});
