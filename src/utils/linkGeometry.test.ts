import { describe, expect, it } from 'vitest';
import { parallelLinkBundleOffset, polylineLength } from './linkGeometry';
import { TopologyLink } from '../types';

describe('polylineLength', () => {
  it('soma os segmentos de uma polilinha com cotovelo', () => {
    expect(polylineLength([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }])).toBe(70);
  });

  it('ponto único não tem comprimento', () => {
    expect(polylineLength([{ x: 5, y: 5 }])).toBe(0);
  });
});

describe('parallelLinkBundleOffset', () => {
  it('um cabo sozinho fica na linha original', () => {
    const link: TopologyLink = { from: 'a', to: 'b' };
    expect(parallelLinkBundleOffset(link, [link])).toBe(0);
  });

  it('dois cabos entre o mesmo par saem simétricos', () => {
    const first: TopologyLink = { from: 'a', to: 'b', fromInterface: { name: 'eth-a' } };
    const second: TopologyLink = { from: 'a', to: 'b', fromInterface: { name: 'eth-c' } };
    const links = [first, second];
    const a = parallelLinkBundleOffset(first, links);
    const b = parallelLinkBundleOffset(second, links);
    expect(a).toBe(-b);
    expect(Math.abs(a)).toBe(6);
  });
});
