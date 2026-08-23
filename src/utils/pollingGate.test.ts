import { describe, expect, it } from 'vitest';
import { canStartPolledFetch, canStartRefreshEventFetch } from './pollingGate';

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

describe('canStartRefreshEventFetch', () => {
  it('ignora o auto-refresh do dashboard mais curto que o intervalo do painel', () => {
    expect(canStartRefreshEventFetch(35_000, 30_000, false, 60_000)).toBe(false);
    expect(canStartRefreshEventFetch(89_999, 30_000, false, 60_000)).toBe(false);
  });

  it('deixa o evento antecipar a busca quando o intervalo do painel já venceu', () => {
    expect(canStartRefreshEventFetch(90_000, 30_000, false, 60_000)).toBe(true);
  });

  it('cai no intervalo mínimo quando o painel não tem timer próprio', () => {
    expect(canStartRefreshEventFetch(31_000, 30_000, false, null)).toBe(false);
    expect(canStartRefreshEventFetch(32_000, 30_000, false, null)).toBe(true);
  });

  it('mantém a proteção contra sobreposição, liberada só pelo watchdog', () => {
    expect(canStartRefreshEventFetch(50_000, 30_000, true, 60_000)).toBe(false);
    expect(canStartRefreshEventFetch(55_000, 30_000, true, 60_000)).toBe(true);
  });
});
