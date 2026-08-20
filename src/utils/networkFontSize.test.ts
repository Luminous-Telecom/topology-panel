import { describe, expect, it } from 'vitest';
import { defaultOptions } from '../types';
import { resolveNetworkFontSize } from './networkFontSize';

describe('resolveNetworkFontSize', () => {
  it('usa networkFontSize quando definido', () => {
    expect(resolveNetworkFontSize({ ...defaultOptions(), networkFontSize: 16, nodeFontSize: 11 })).toBe(16);
  });

  it('cai em nodeFontSize quando networkFontSize não está definido', () => {
    expect(resolveNetworkFontSize({ nodeFontSize: 14 })).toBe(14);
  });
});
