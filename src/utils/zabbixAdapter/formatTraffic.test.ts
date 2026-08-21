import { describe, expect, it } from 'vitest';
import { formatRelativeUpdate } from './formatTraffic';

describe('formatRelativeUpdate', () => {
  it('mostra segundos abaixo de um minuto', () => {
    expect(formatRelativeUpdate(1_000, 11_000)).toBe('10 segundo(s) atrás');
  });

  it('mostra minutos a partir de 60s', () => {
    expect(formatRelativeUpdate(0, 41 * 60_000)).toBe('41 minuto(s) atrás');
  });
});
