import { describe, expect, it } from 'vitest';
import { defaultOptions } from '../types';
import { linkDegradationColor, linkRuntimeColor, isLinkVisuallyDown } from './linkMetricsRuntime';
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

describe('linkRuntimeColor', () => {
  it('interface down usa colorOffline, mesmo com utilização alta', () => {
    const options = defaultOptions();
    const down: LinkRuntimeMetrics = {
      from: { rxUtilizationPct: 95, operStatus: 'down' },
      to: {},
      status: 'down',
    };
    expect(linkRuntimeColor(options, down, 'critical')).toBe(options.colorOffline);
  });

  it('cabo no ar segue a degradação de tráfego', () => {
    const options = defaultOptions();
    expect(linkRuntimeColor(options, metrics(80), 'high')).toBe(options.colorLinkHigh);
  });

  it('host de uma ponta offline usa colorOffline', () => {
    const options = defaultOptions();
    expect(linkRuntimeColor(options, metrics(10), 'normal', true)).toBe(options.colorOffline);
  });
});

describe('isLinkVisuallyDown', () => {
  it('é true quando a origem ou o destino está offline', () => {
    expect(isLinkVisuallyDown(metrics(10), true, false)).toBe(true);
    expect(isLinkVisuallyDown(metrics(10), false, true)).toBe(true);
    expect(isLinkVisuallyDown(metrics(10), false, false)).toBe(false);
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
