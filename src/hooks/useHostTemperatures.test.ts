import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useHostTemperatures } from './useHostTemperatures';

vi.mock('../services/zabbixHostTemperature', () => ({
  fetchHostTemperatures: vi.fn(async () => [
    { itemId: '11', label: 'CPU', value: 44, units: '°C' },
  ]),
}));

describe('useHostTemperatures', () => {
  it('desligado não consulta o Zabbix', () => {
    const { result } = renderHook(() =>
      useHostTemperatures({ enabled: false, datasourceUid: 'ds-a', hostid: '1001' })
    );
    expect(result.current).toEqual({ loading: false, readings: [] });
  });

  it('ligado devolve as temperaturas do host', async () => {
    const { result } = renderHook(() =>
      useHostTemperatures({ enabled: true, datasourceUid: 'ds-a', hostid: '1001' })
    );
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.readings).toEqual([
      { itemId: '11', label: 'CPU', value: 44, units: '°C' },
    ]);
  });
});
