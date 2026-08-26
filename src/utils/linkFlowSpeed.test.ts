import { describe, expect, it } from 'vitest';
import {
  computeFlowSpeed,
  isLinkCongested,
  maxLinkUtilization,
  resolveFlowLaneSpeed,
  resolveLinkUtilizationLevel,
} from './linkFlowSpeed';
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

  it('a velocidade é contínua na utilização, não em degraus', () => {
    const a = computeFlowSpeed(metrics(20), DEFAULT_UTILIZATION_THRESHOLDS);
    const b = computeFlowSpeed(metrics(30), DEFAULT_UTILIZATION_THRESHOLDS);
    const c = computeFlowSpeed(metrics(40), DEFAULT_UTILIZATION_THRESHOLDS);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('cabo saturado anda mais de 3x mais rápido que o cabo quase vazio', () => {
    const idle = computeFlowSpeed(metrics(1), DEFAULT_UTILIZATION_THRESHOLDS);
    const saturated = computeFlowSpeed(metrics(100), DEFAULT_UTILIZATION_THRESHOLDS);
    expect(saturated / idle).toBeGreaterThan(3);
  });

  it('sem capacidade configurada, a vazão absoluta define a velocidade', () => {
    const noCapacity: LinkRuntimeMetrics = {
      from: { rxBps: 5_000_000, txBps: 5_000_000, operStatus: 'up' },
      to: { operStatus: 'up' },
      status: 'up',
    };
    const slow = resolveFlowLaneSpeed(5_000_000, undefined, noCapacity, DEFAULT_UTILIZATION_THRESHOLDS);
    const fast = resolveFlowLaneSpeed(5_000_000_000, undefined, noCapacity, DEFAULT_UTILIZATION_THRESHOLDS);
    expect(slow).toBeLessThan(fast);
  });

  it('sem capacidade, 6x de vazão viram velocidades claramente distintas', () => {
    // Caso real do painel: 4,33 Gbps de subida contra 655 Mbps de descida.
    const noCapacity: LinkRuntimeMetrics = {
      from: { rxBps: 655_300_000, txBps: 4_330_000_000, operStatus: 'up' },
      to: { operStatus: 'up' },
      status: 'up',
    };
    const upload = resolveFlowLaneSpeed(4_330_000_000, undefined, noCapacity, DEFAULT_UTILIZATION_THRESHOLDS);
    const download = resolveFlowLaneSpeed(655_300_000, undefined, noCapacity, DEFAULT_UTILIZATION_THRESHOLDS);
    expect(upload / download).toBeGreaterThan(2);
  });

  it('tráfego assimétrico dá velocidades diferentes para TX e RX', () => {
    // Link com 70% de saída e 5% de entrada: a maior utilização não pode ditar os dois sentidos.
    const asymmetric: LinkRuntimeMetrics = {
      from: {
        rxBps: 5_000_000,
        txBps: 700_000_000,
        rxUtilizationPct: 5,
        txUtilizationPct: 70,
        operStatus: 'up',
      },
      to: { operStatus: 'up' },
      status: 'up',
    };
    const upload = resolveFlowLaneSpeed(700_000_000, 70, asymmetric, DEFAULT_UTILIZATION_THRESHOLDS);
    const download = resolveFlowLaneSpeed(5_000_000, 5, asymmetric, DEFAULT_UTILIZATION_THRESHOLDS);
    expect(download).toBeLessThan(upload);
  });

  it('sentido sem tráfego fica parado mesmo com o outro sentido carregado', () => {
    const oneWay: LinkRuntimeMetrics = {
      from: { rxBps: 0, txBps: 900_000_000, rxUtilizationPct: 0, txUtilizationPct: 90, operStatus: 'up' },
      to: { operStatus: 'up' },
      status: 'up',
    };
    const download = resolveFlowLaneSpeed(0, 0, oneWay, DEFAULT_UTILIZATION_THRESHOLDS);
    const upload = resolveFlowLaneSpeed(900_000_000, 90, oneWay, DEFAULT_UTILIZATION_THRESHOLDS);
    expect(download).toBeLessThan(0.2);
    expect(upload).toBeGreaterThan(1);
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
