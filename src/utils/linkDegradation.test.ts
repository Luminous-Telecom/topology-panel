import { describe, expect, it } from 'vitest';
import { defaultOptions } from '../types';
import { linkDegradationColor } from './linkMetricsRuntime';
import { resolveLinkUtilizationLevel } from './linkFlowSpeed';
import { DEFAULT_UTILIZATION_THRESHOLDS } from './zabbixAdapter/formatTraffic';
import { LinkRuntimeMetrics } from '../types';

const metrics = (util: number): LinkRuntimeMetrics => ({
  from: { rxUtilizationPct: util, txUtilizationPct: util, operStatus: 'up' },
  to: {},
  status: 'up',
});

describe('linkDegradationColor', () => {
  it('mapeia cada nível para a cor configurada na aba Links', () => {
    const options = defaultOptions();
    expect(linkDegradationColor(options, 'normal')).toBe(options.colorLink);
    expect(linkDegradationColor(options, 'attention')).toBe(options.colorLinkAttention);
    expect(linkDegradationColor(options, 'high')).toBe(options.colorLinkHigh);
    expect(linkDegradationColor(options, 'critical')).toBe(options.colorLinkCongestion);
  });
});

describe('resolveLinkUtilizationLevel', () => {
  it('classifica pela maior utilização RX/TX', () => {
    expect(resolveLinkUtilizationLevel(metrics(40), DEFAULT_UTILIZATION_THRESHOLDS)).toBe('normal');
    expect(resolveLinkUtilizationLevel(metrics(55), DEFAULT_UTILIZATION_THRESHOLDS)).toBe('attention');
    expect(resolveLinkUtilizationLevel(metrics(80), DEFAULT_UTILIZATION_THRESHOLDS)).toBe('high');
    expect(resolveLinkUtilizationLevel(metrics(95), DEFAULT_UTILIZATION_THRESHOLDS)).toBe('critical');
  });
});
