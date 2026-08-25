import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHostHoverSeries } from './useHostHoverSeries';

const series = {
  points: [{ t: 1, value: 1, status: 'online' as const }],
  metric: 'icmp_rtt' as const,
  fieldLabel: 'ICMP',
  failureCount: 0,
};

describe('useHostHoverSeries', () => {
  it('lê a série do poll e não consulta o Zabbix', () => {
    const { result } = renderHook(() =>
      useHostHoverSeries({
        enabled: true,
        queryReady: true,
        lookupRef: { zabbixHost: 'host-a' },
        hoverByHost: { 'host-a': series },
      })
    );

    expect(result.current.series).toBe(series);
    expect(result.current.loading).toBe(false);
  });

  it('fica em loading só enquanto o poll de status não está pronto', () => {
    const { result } = renderHook(() =>
      useHostHoverSeries({
        enabled: true,
        queryReady: false,
        lookupRef: { zabbixHost: 'host-a' },
        hoverByHost: { 'host-a': series },
      })
    );

    expect(result.current.series).toBeUndefined();
    expect(result.current.loading).toBe(true);
  });
});
