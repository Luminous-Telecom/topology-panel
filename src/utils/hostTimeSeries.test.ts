import { describe, expect, it } from 'vitest';
import {
  buildHostHoverSeriesFromZabbixHistory,
  hoverMetricFromItemKey,
} from './hostTimeSeries';

describe('hoverMetricFromItemKey', () => {
  it('detecta perda ICMP', () => {
    expect(hoverMetricFromItemKey('icmppingloss')).toBe('packet_loss');
  });

  it('trata icmppingsec como latência', () => {
    expect(hoverMetricFromItemKey('icmppingsec')).toBe('icmp_rtt');
  });
});

describe('buildHostHoverSeriesFromZabbixHistory', () => {
  const statusOptions = {
    colorOnline: '#0f0',
    colorOffline: '#f00',
    colorAlert: '#ff0',
    statusValueMappings: [
      { value: 0, status: 'offline' as const },
      { from: 0, status: 'online' as const },
    ],
  };

  it('monta sparkline a partir do history.get do Zabbix', () => {
    const series = buildHostHoverSeriesFromZabbixHistory(
      [
        { clockSec: 1_700_000_000, value: 0.0004 },
        { clockSec: 1_700_000_030, value: 0 },
        { clockSec: 1_700_000_060, value: 0.0005 },
      ],
      'icmppingsec',
      'Tempo de Resposta',
      statusOptions
    );

    expect(series?.metric).toBe('icmp_rtt');
    expect(series?.fieldLabel).toBe('Tempo de Resposta');
    expect(series?.points).toHaveLength(3);
    expect(series?.failureCount).toBe(1);
  });
});
