import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostHoverPopover } from './HostHoverPopover';
import { useHostIcmpHistory } from '../hooks/useHostIcmpHistory';
import { useHostTemperatures } from '../hooks/useHostTemperatures';
import { defaultOptions } from '../types';
import { hostNode } from '../utils/testMapFixtures';

vi.mock('../hooks/useHostIcmpHistory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useHostIcmpHistory')>();
  return {
    ...actual,
    useHostIcmpHistory: vi.fn(() => ({ loading: false })),
  };
});

vi.mock('../hooks/useHostTemperatures', () => ({
  useHostTemperatures: vi.fn(() => ({ loading: false, readings: [] })),
}));

const icmp = vi.mocked(useHostIcmpHistory);
const temps = vi.mocked(useHostTemperatures);

describe('HostHoverPopover', () => {
  afterEach(() => {
    icmp.mockReset();
    icmp.mockReturnValue({ loading: false });
    temps.mockReset();
    temps.mockReturnValue({ loading: false, readings: [] });
  });

  it('mostra latência, perda e o intervalo do dashboard no hover', () => {
    icmp.mockReturnValue({
      loading: false,
      history: {
        status: { reachable: true, rttMs: 12.3, lossPct: 1.5, lastClock: 1_704_500_074 },
        rttMs: [
          { clock: 100, value: 10 },
          { clock: 200, value: 14 },
        ],
        lossPct: [
          { clock: 100, value: 0 },
          { clock: 200, value: 2 },
        ],
      },
    });
    const historyRangeRef = { current: { fromSec: 1_704_499_200, toSec: 1_704_502_800 } };

    const { getByText, getByRole } = render(
      <HostHoverPopover
        node={hostNode({ id: 'h1', label: 'host-a', zabbixHost: 'host-a', zabbixHostId: '1001' })}
        screenX={40}
        screenY={40}
        hostMetadata={{ 'host-a': { name: 'host-a', hostid: '1001' } }}
        hostDisplay={{
          'host-a': { value: 1, status: 'online', text: 'Online', updatedAtSec: 1_704_496_074 },
        }}
        options={defaultOptions()}
        queryReady
        datasourceUid="ds-a"
        historyRangeRef={historyRangeRef}
      />
    );

    expect(getByRole('tooltip')).toHaveTextContent('host-a');
    expect(getByText(/ICMP no intervalo do dashboard/)).toBeInTheDocument();
    expect(getByText('Latência')).toBeInTheDocument();
    expect(getByText('12.3 ms')).toBeInTheDocument();
    expect(getByText('Perda de pacote')).toBeInTheDocument();
    expect(getByText('1.5%')).toHaveStyle({ color: defaultOptions().colorOffline });
    const collected = new Date(1_704_500_074 * 1000).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    expect(getByText(`Coletado às ${collected}`)).toBeInTheDocument();
    expect(icmp).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        datasourceUid: 'ds-a',
        hostid: '1001',
        fromSec: 1_704_499_200,
        toSec: 1_704_502_800,
      })
    );
  });

  it('não lista problema Zabbix quando hostProblems vem vazio', () => {
    icmp.mockReturnValue({ loading: false });
    const { queryByText } = render(
      <HostHoverPopover
        node={hostNode({ id: 'h1', label: 'host-a', zabbixHost: 'host-a', zabbixHostId: '1001' })}
        screenX={40}
        screenY={40}
        hostMetadata={{ 'host-a': { name: 'host-a', hostid: '1001' } }}
        hostDisplay={{ 'host-a': { value: 1, status: 'online', text: 'Online' } }}
        hostProblems={{}}
        options={defaultOptions()}
        queryReady
      />
    );

    expect(queryByText('Problema ativo')).toBeNull();
    expect(queryByText('Interface down')).toBeNull();
    expect(queryByText('Temperatura')).toBeNull();
    expect(temps).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('com a opção ligada lista todas as temperaturas do host', () => {
    temps.mockReturnValue({
      loading: false,
      readings: [
        { itemId: '11', label: 'CPU', value: 48, units: '°C' },
        { itemId: '12', label: 'Placa', value: 36, units: '°C' },
      ],
    });
    const { getByText } = render(
      <HostHoverPopover
        node={hostNode({ id: 'h1', label: 'host-a', zabbixHost: 'host-a', zabbixHostId: '1001' })}
        screenX={40}
        screenY={40}
        hostMetadata={{ 'host-a': { name: 'host-a', hostid: '1001' } }}
        hostDisplay={{ 'host-a': { value: 1, status: 'online', text: 'Online' } }}
        options={{ ...defaultOptions(), showHostTemperature: true }}
        queryReady
        datasourceUid="ds-a"
      />
    );

    expect(getByText('Temperatura')).toBeInTheDocument();
    expect(getByText('CPU')).toBeInTheDocument();
    expect(getByText('48 °C')).toBeInTheDocument();
    expect(getByText('Placa')).toBeInTheDocument();
    expect(getByText('36 °C')).toBeInTheDocument();
    expect(temps).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, datasourceUid: 'ds-a', hostid: '1001' })
    );
  });
});
