import { describe, expect, it } from 'vitest';
import {
  flowDashPeriod,
  linkFlowAnimationBudget,
  linkFlowPulseCount,
  linkFlowSpeedFromUpload,
  normalizeLinkAnimationEffect,
  normalizeLinkAnimationSpeed,
  trafficFlowStep,
} from './linkAnimationStyle';

describe('linkAnimationStyle', () => {
  it('anima todos os cabos visíveis', () => {
    expect(linkFlowAnimationBudget(10)).toBe(10);
    expect(linkFlowAnimationBudget(50)).toBe(50);
    expect(linkFlowAnimationBudget(100)).toBe(100);
  });

  it('define quantos pulsos cabem no cabo', () => {
    expect(linkFlowPulseCount(0)).toBe(0);
    expect(linkFlowPulseCount(20)).toBe(1);
    expect(linkFlowPulseCount(50)).toBe(2);
    expect(linkFlowPulseCount(120)).toBe(3);
  });

  it('normaliza o efeito do cabo e rejeita valor desconhecido', () => {
    expect(normalizeLinkAnimationEffect('arrows')).toBe('arrows');
    expect(normalizeLinkAnimationEffect('dash')).toBe('dash');
    expect(normalizeLinkAnimationEffect(undefined)).toBe('pulses');
    expect(normalizeLinkAnimationEffect('desconhecido')).toBe('pulses');
  });

  it('limita velocidade entre 0,25 e 4', () => {
    expect(normalizeLinkAnimationSpeed(undefined)).toBe(0.5);
    expect(normalizeLinkAnimationSpeed(0.1)).toBe(0.25);
    expect(normalizeLinkAnimationSpeed(10)).toBe(4);
  });

  it('calcula período do dasharray', () => {
    expect(flowDashPeriod('10 16')).toBe(26);
  });

  it('acelera passo do rAF com speed maior', () => {
    expect(trafficFlowStep(2)).toBeGreaterThan(trafficFlowStep(1));
  });

  it('acelera o traço com mais upload e desacelera com pouca banda', () => {
    const idle = linkFlowSpeedFromUpload({ txUtilizationPct: 0, baseSpeed: 1 });
    const mid = linkFlowSpeedFromUpload({ txUtilizationPct: 40, baseSpeed: 1 });
    const busy = linkFlowSpeedFromUpload({ txUtilizationPct: 90, baseSpeed: 1 });
    const unknown = linkFlowSpeedFromUpload({ baseSpeed: 1 });
    expect(busy).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(idle);
    expect(idle).toBe(unknown);
  });

  it('usa o bps absoluto: 1 Gbps fica mais rápido que 10 Mbps na mesma utilização', () => {
    const low = linkFlowSpeedFromUpload({
      txBps: 10_000_000,
      txUtilizationPct: 1,
      capacityMbps: 1000,
      baseSpeed: 1,
    });
    const high = linkFlowSpeedFromUpload({
      txBps: 1_000_000_000,
      txUtilizationPct: 1,
      capacityMbps: 100_000,
      baseSpeed: 1,
    });
    expect(high).toBeGreaterThan(low * 1.8);
  });
});
