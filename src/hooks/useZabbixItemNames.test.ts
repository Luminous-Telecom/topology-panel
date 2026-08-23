import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.mock('../utils/zabbixDatasourceQuery', () => ({
  fetchZabbixItemNamesViaQuery: (...args: unknown[]) => fetchMock(...args),
}));

import { useZabbixItemNames } from './useZabbixItemNames';

describe('useZabbixItemNames', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('não busca sem datasource ou sem grupos', () => {
    const { result } = renderHook(() => useZabbixItemNames(undefined, ['Backbone']));
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lista os nomes devolvidos pela query e expõe erro quando a busca falha', async () => {
    fetchMock.mockResolvedValueOnce(['Status item']);
    const { result, rerender } = renderHook(
      ({ uid, groups }: { uid?: string; groups?: string[] }) => useZabbixItemNames(uid, groups),
      { initialProps: { uid: 'ds', groups: ['Backbone'] } }
    );

    await waitFor(() => {
      expect(result.current.items).toEqual(['Status item']);
    });
    expect(result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('ds', ['Backbone']);

    fetchMock.mockRejectedValueOnce(new Error('fail'));
    rerender({ uid: 'ds-b', groups: ['Borda'] });

    await waitFor(() => {
      expect(result.current.loadError).toBe('Não foi possível listar os itens deste datasource Zabbix.');
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
