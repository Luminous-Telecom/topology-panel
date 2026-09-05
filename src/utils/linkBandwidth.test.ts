import { describe, expect, it } from 'vitest';
import { linkMatchesCapacityGbps } from './linkBandwidth';

describe('linkMatchesCapacityGbps', () => {
  it('casa 1 / 10 / 40 / 100 Gb e recusa faixa vizinha', () => {
    expect(linkMatchesCapacityGbps(1000, 1)).toBe(true);
    expect(linkMatchesCapacityGbps(10000, 10)).toBe(true);
    expect(linkMatchesCapacityGbps(40000, 40)).toBe(true);
    expect(linkMatchesCapacityGbps(100000, 100)).toBe(true);
    expect(linkMatchesCapacityGbps(1000, 10)).toBe(false);
    expect(linkMatchesCapacityGbps(10000, 1)).toBe(false);
    expect(linkMatchesCapacityGbps(undefined, 10)).toBe(false);
  });
});
