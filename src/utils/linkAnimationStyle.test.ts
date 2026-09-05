import { describe, expect, it } from 'vitest';
import {
  flowDashPeriod,
  linkFlowPulseCount,
  normalizeLinkAnimationEffect,
  normalizeLinkAnimationSpeed,
  trafficFlowStep,
} from './linkAnimationStyle';

describe('linkAnimationStyle', () => {
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
});
