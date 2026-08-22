import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useNodePropertiesModals } from './useNodePropertiesModals';
import { emptyMap, hostNode } from '../utils/testMapFixtures';

describe('useNodePropertiesModals', () => {
  const host = hostNode({ id: 'host-a', label: 'host-a', zabbixHost: '10.0.0.1' });
  const map = emptyMap({ nodes: [host] });

  it('duplo toque no host fora do editor abre a ficha só leitura', () => {
    const { result } = renderHook(() =>
      useNodePropertiesModals({ storedMap: map, editable: false, linkFromId: null })
    );
    act(() => {
      expect(result.current.tryDoubleTapOpenProperties(host)).toBe(false);
    });
    act(() => {
      expect(result.current.tryDoubleTapOpenProperties(host)).toBe(true);
    });
    expect(result.current.viewHost?.id).toBe('host-a');
    expect(result.current.editNode).toBeNull();
  });

  it('duplo toque no host no editor abre propriedades', () => {
    const { result } = renderHook(() =>
      useNodePropertiesModals({ storedMap: map, editable: true, linkFromId: null })
    );
    act(() => {
      expect(result.current.tryDoubleTapOpenProperties(host)).toBe(false);
    });
    act(() => {
      expect(result.current.tryDoubleTapOpenProperties(host)).toBe(true);
    });
    expect(result.current.editNode?.id).toBe('host-a');
    expect(result.current.viewHost).toBeNull();
  });
});
