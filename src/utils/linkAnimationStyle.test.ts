import { describe, expect, it } from 'vitest';
import {
  flowDashPeriod,
  linkFlowAnimationBudget,
  normalizeLinkAnimationSpeed,
  trafficFlowStep,
} from './linkAnimationStyle';

describe('linkAnimationStyle', () => {
  it('limita orçamento de cabos animados em mapas grandes', () => {
    expect(linkFlowAnimationBudget(10)).toBe(10);
    expect(linkFlowAnimationBudget(50)).toBe(32);
    expect(linkFlowAnimationBudget(100)).toBe(20);
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
