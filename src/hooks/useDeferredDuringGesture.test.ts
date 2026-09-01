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

  it('fora do gesto aplica o valor no mesmo render', () => {
    const gesture = { current: false };
    const { result, rerender } = renderHook(
      ({ value }) => useDeferredDuringGesture(value, gesture),
      { initialProps: { value: 'a' } }
    );
    rerender({ value: 'b' });
    expect(result.current[0]).toBe('b');
  });

  it('durante o gesto mantém o valor anterior até o flush', () => {
    const gesture = { current: false };
    const { result, rerender } = renderHook(
      ({ value }) => useDeferredDuringGesture(value, gesture),
      { initialProps: { value: 'a' } }
    );
    gesture.current = true;
    rerender({ value: 'b' });
    expect(result.current[0]).toBe('a');
    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toBe('b');
  });
});
