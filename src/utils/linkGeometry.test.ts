import { describe, expect, it } from 'vitest';
import { parallelLinkBundleOffset } from './linkGeometry';
import { TopologyLink } from '../types';

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
