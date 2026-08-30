import { describe, expect, it } from 'vitest';
import { formatLinkRowLabel } from './LinksSection';
import { TopologyLink } from '../../types';

describe('formatLinkRowLabel', () => {
  it('usa o rótulo do nó e o meio do cabo', () => {
    const link: TopologyLink = { from: 'a', to: 'b', medium: 'radio' };
    const labels = new Map([
      ['a', 'Host A (a)'],
      ['b', 'Host B (b)'],
    ]);
    expect(formatLinkRowLabel(link, labels)).toBe('Host A (a) → Host B (b) · Rádio');
  });

  it('sem medium trata como fibra e cai no id quando o nó não está na lista', () => {
    const link: TopologyLink = { from: 'a', to: 'missing' };
    const labels = new Map([['a', 'Host A (a)']]);
    expect(formatLinkRowLabel(link, labels)).toBe('Host A (a) → missing · Fibra');
  });
});
