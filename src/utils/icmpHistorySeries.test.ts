import { describe, expect, it } from 'vitest';
import {
  downsampleIcmpHistory,
  formatIcmpLossPct,
  formatIcmpRangeLabel,
  formatIcmpRttMs,
} from './icmpHistorySeries';

describe('downsampleIcmpHistory', () => {
  it('devolve cópia quando já cabe no teto', () => {
    const points = [
      { clock: 1, value: 10 },
      { clock: 2, value: 20 },
    ];
    expect(downsampleIcmpHistory(points, 80)).toEqual(points);
  });

  it('mantém o primeiro e o último ponto', () => {
    const points = Array.from({ length: 11 }, (_, i) => ({ clock: i, value: i * 2 }));
    const sampled = downsampleIcmpHistory(points, 5);
    expect(sampled).toHaveLength(5);
    expect(sampled[0]).toEqual({ clock: 0, value: 0 });
    expect(sampled[sampled.length - 1]).toEqual({ clock: 10, value: 20 });
  });
});

describe('formatIcmpRttMs / formatIcmpLossPct', () => {
  it('formata RTT e perda', () => {
    expect(formatIcmpRttMs(12.34)).toBe('12.3 ms');
    expect(formatIcmpLossPct(1.5)).toBe('1.5%');
    expect(formatIcmpRttMs(null)).toBe('—');
    expect(formatIcmpLossPct(undefined)).toBe('—');
  });
});

describe('formatIcmpRangeLabel', () => {
  it('mostra data e hora do intervalo no mesmo dia', () => {
    const from = new Date(2026, 8, 5, 12, 0, 0).getTime() / 1000;
    const to = new Date(2026, 8, 5, 13, 30, 0).getTime() / 1000;
    expect(formatIcmpRangeLabel(from, to)).toMatch(/05\/09/);
    expect(formatIcmpRangeLabel(from, to)).toMatch(/–/);
  });
});
