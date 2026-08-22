import { describe, expect, it } from 'vitest';
import { computeFlowSpeed, isLinkCongested, maxLinkUtilization, resolveLinkUtilizationLevel } from './linkFlowSpeed';
import { DEFAULT_UTILIZATION_THRESHOLDS } from './zabbixAdapter/formatTraffic';
import { LinkRuntimeMetrics } from '../types';

const metrics = (util: number, oper: 'up' | 'down' = 'up'): LinkRuntimeMetrics => ({
  from: { rxBps: 1, txBps: 1, rxUtilizationPct: util, txUtilizationPct: util, operStatus: oper },
  to: { operStatus: oper },
  status: oper === 'down' ? 'down' : 'up',
});

describe('linkFlowSpeed', () => {
  it('retorna 0 quando interface down', () => {
    expect(computeFlowSpeed(metrics(10, 'down'), DEFAULT_UTILIZATION_THRESHOLDS)).toBe(0);
  });

  it('aumenta velocidade com utilização', () => {
    const low = computeFlowSpeed(metrics(20), DEFAULT_UTILIZATION_THRESHOLDS);
    const high = computeFlowSpeed(metrics(80), DEFAULT_UTILIZATION_THRESHOLDS);
    const critical = computeFlowSpeed(metrics(95), DEFAULT_UTILIZATION_THRESHOLDS);
    expect(low).toBeLessThan(high);
    expect(high).toBeLessThan(critical);
  });

  it('detecta congestionamento acima do threshold crítico', () => {
    expect(isLinkCongested(metrics(91), DEFAULT_UTILIZATION_THRESHOLDS)).toBe(true);
    expect(isLinkCongested(metrics(80), DEFAULT_UTILIZATION_THRESHOLDS)).toBe(false);
  });

  it('classifica níveis de degradação', () => {
    expect(resolveLinkUtilizationLevel(metrics(55), DEFAULT_UTILIZATION_THRESHOLDS)).toBe('attention');
    expect(resolveLinkUtilizationLevel(metrics(80), DEFAULT_UTILIZATION_THRESHOLDS)).toBe('high');
  });

  it('maxLinkUtilization pega o maior valor', () => {
    const m: LinkRuntimeMetrics = {
      from: { rxUtilizationPct: 30, txUtilizationPct: 85 },
      to: {},
      status: 'degraded',
    };
    expect(maxLinkUtilization(m)).toBe(85);
  });
});
