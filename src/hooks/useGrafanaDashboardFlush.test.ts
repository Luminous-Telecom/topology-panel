import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGrafanaDashboardFlush } from './useGrafanaDashboardFlush';

describe('useGrafanaDashboardFlush', () => {
  it('grava ao clicar em Salvar dashboard', () => {
    const onFlush = vi.fn();
    renderHook(() => useGrafanaDashboardFlush(onFlush));
    const save = document.createElement('button');
    save.setAttribute('aria-label', 'Salvar dashboard');
    document.body.appendChild(save);
    act(() => {
      save.click();
    });
    expect(onFlush).toHaveBeenCalledTimes(1);
    save.remove();
  });
});
