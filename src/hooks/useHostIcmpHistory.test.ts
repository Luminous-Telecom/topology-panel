import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHostIcmpHistory } from './useHostIcmpHistory';
import { fetchHostIcmpHistory } from '../services/zabbixIcmpHistory';

vi.mock('../services/zabbixIcmpHistory', () => ({
  fetchHostIcmpHistory: vi.fn(),
}));

const fetchHistory = vi.mocked(fetchHostIcmpHistory);

describe('useHostIcmpHistory', () => {
  afterEach(() => {
    fetchHistory.mockReset();
  });

  it('carrega o histórico no intervalo informado', async () => {
    fetchHistory.mockResolvedValue({
      status: { reachable: true, rttMs: 8, lossPct: 0 },
      rttMs: [{ clock: 10, value: 8 }],
      lossPct: [{ clock: 10, value: 0 }],
    });

    const { result } = renderHook(() =>
      useHostIcmpHistory({
        enabled: true,
        datasourceUid: 'ds-a',
        hostid: '1001',
        fromSec: 100,
        toSec: 200,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.history?.status.rttMs).toBe(8);
    expect(fetchHistory).toHaveBeenCalledWith('ds-a', '1001', 100, 200);
  });

  it('intervalo invertido não consulta a API', () => {
    const { result } = renderHook(() =>
      useHostIcmpHistory({
        enabled: true,
        datasourceUid: 'ds-a',
        hostid: '1001',
        fromSec: 200,
        toSec: 100,
      })
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.history).toBeUndefined();
    expect(fetchHistory).not.toHaveBeenCalled();
  });
});
