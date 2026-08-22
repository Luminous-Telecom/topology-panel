import { describe, expect, it } from 'vitest';
import { dateTime, LoadingState, TimeRange, getDefaultTimeRange } from '@grafana/data';
import {
  buildHostHoverSeriesFromZabbixHistory,
  compactHoverPoints,
  hostHoverPeriodLabel,
  hoverMetricFromItemKey,
  panelDataWithDashboardTimeRange,
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

  it('conta as falhas na série completa mesmo depois de compactar o sparkline', () => {
    const raw = [];
    for (let i = 0; i < 800; i += 1) {
      raw.push({ clockSec: 1_700_000_000 + i * 30, value: i === 600 ? 0 : 0.0005 });
    }
    const series = buildHostHoverSeriesFromZabbixHistory(raw, 'icmppingsec', 'Tempo de Resposta', statusOptions);
    expect(series?.failureCount).toBe(1);
    expect(series?.points.length).toBeLessThan(raw.length);
    expect(series?.points.some((point) => point.status === 'offline')).toBe(true);
  });
});

describe('compactHoverPoints', () => {
  it('não altera série menor que o teto', () => {
    const points = [
      { t: 1, value: 1, status: 'online' as const },
      { t: 2, value: 1, status: 'online' as const },
    ];
    expect(compactHoverPoints(points, 10)).toBe(points);
  });

  it('mantém ponto offline que cairia fora se cortasse só o começo da janela', () => {
    const points = [];
    for (let i = 0; i < 100; i += 1) {
      points.push({
        t: i * 1000,
        value: i === 90 ? 0 : 1,
        status: i === 90 ? ('offline' as const) : ('online' as const),
      });
    }
    const compacted = compactHoverPoints(points, 10);
    expect(compacted.some((point) => point.status === 'offline')).toBe(true);
    expect(compacted[compacted.length - 1].t).toBe(points[points.length - 1].t);
  });
});

describe('panelDataWithDashboardTimeRange', () => {
  it('troca o default now-6h pelo timeRange do seletor do dashboard', () => {
    const data = { state: LoadingState.Done, series: [], timeRange: getDefaultTimeRange() };
    const to = dateTime();
    const from = dateTime(to.valueOf() - 30 * 60 * 1000);
    const dashboard: TimeRange = { from, to, raw: { from: 'now-30m', to: 'now' } };
    const next = panelDataWithDashboardTimeRange(data, dashboard);
    expect(next.timeRange.raw.from).toBe('now-30m');
    expect(next).not.toBe(data);
  });

  it('reusa o PanelData quando o timeRange já é o mesmo objeto', () => {
    const data = { state: LoadingState.Done, series: [], timeRange: getDefaultTimeRange() };
    expect(panelDataWithDashboardTimeRange(data, data.timeRange)).toBe(data);
  });
});

describe('hostHoverPeriodLabel', () => {
  it('mostra now-6h quando o timeRange é o default do Grafana', () => {
    expect(hostHoverPeriodLabel(undefined, getDefaultTimeRange())).toMatch(/^now-6h → now/);
  });

  it('mostra now-30m quando o relógio do dashboard é 30 minutos', () => {
    const to = dateTime();
    const from = dateTime(to.valueOf() - 30 * 60 * 1000);
    const range: TimeRange = { from, to, raw: { from: 'now-30m', to: 'now' } };
    expect(hostHoverPeriodLabel(undefined, range)).toMatch(/^now-30m → now/);
  });
});
