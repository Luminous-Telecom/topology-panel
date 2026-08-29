import { beforeEach, describe, expect, it } from 'vitest';
import {
  canStartPolledFetch,
  clearPollClock,
  markPollFinished,
  markPollStarted,
  msUntilNextPoll,
  readPollClock,
} from './pollingGate';

describe('canStartPolledFetch', () => {
  it('permite a primeira busca', () => {
    expect(canStartPolledFetch(1_000, undefined, false, 2_000, 25_000)).toBe(true);
  });

  it('trata 0 como instante válido, não como primeira busca', () => {
    expect(canStartPolledFetch(1_000, 0, false, 2_000, 25_000)).toBe(false);
    expect(canStartPolledFetch(2_000, 0, false, 2_000, 25_000)).toBe(true);
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

  it('o watchdog padrão espera o teto do item.get de status', () => {
    expect(canStartPolledFetch(49_999, 0, true)).toBe(false);
    expect(canStartPolledFetch(50_000, 0, true)).toBe(true);
  });

  it('com watchdog infinito nunca inicia ciclo em cima de outro', () => {
    expect(canStartPolledFetch(80_000, 30_000, true, 60_000, Number.POSITIVE_INFINITY)).toBe(false);
    expect(canStartPolledFetch(90_000, 30_000, false, 60_000, Number.POSITIVE_INFINITY)).toBe(true);
  });
});

describe('relógio do poll fora do React', () => {
  beforeEach(() => {
    clearPollClock();
  });

  it('a primeira chave pode buscar na hora', () => {
    expect(msUntilNextPoll('ds', 60_000, 1_000)).toBe(0);
  });

  it('depois da largada espera o intervalo mesmo se o voo já terminou', () => {
    markPollStarted('ds', 10_000);
    markPollFinished('ds');
    expect(msUntilNextPoll('ds', 60_000, 20_000)).toBe(50_000);
    expect(msUntilNextPoll('ds', 60_000, 70_000)).toBe(0);
    expect(readPollClock('ds').inFlight).toBe(false);
  });

  it('clearPollClock zera o relógio', () => {
    markPollStarted('ds', 10_000);
    clearPollClock();
    expect(msUntilNextPoll('ds', 60_000, 11_000)).toBe(0);
  });
});
