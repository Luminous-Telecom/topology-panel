import { describe, expect, it } from 'vitest';
import { canStartPolledFetch } from './pollingGate';

describe('canStartPolledFetch', () => {
  it('permite a primeira busca', () => {
    expect(canStartPolledFetch(1_000, 0, false, 2_000, 25_000)).toBe(true);
  });

  it('respeita o intervalo mínimo quando não há busca em voo', () => {
    expect(canStartPolledFetch(3_000, 2_000, false, 2_000, 25_000)).toBe(false);
    expect(canStartPolledFetch(4_000, 2_000, false, 2_000, 25_000)).toBe(true);
  });

  it('bloqueia sobreposição até o watchdog quando a busca anterior não voltou', () => {
    expect(canStartPolledFetch(10_000, 0, true, 2_000, 25_000)).toBe(false);
    expect(canStartPolledFetch(24_999, 0, true, 2_000, 25_000)).toBe(false);
    expect(canStartPolledFetch(25_000, 0, true, 2_000, 25_000)).toBe(true);
  });
});
