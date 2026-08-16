import { describe, expect, it } from 'vitest';
import { isDarkBackground, textOnBackground } from './colorContrast';

describe('textOnBackground', () => {
  it('verde claro usa texto escuro', () => {
    expect(isDarkBackground('#1DFD00')).toBe(false);
    expect(textOnBackground('#1DFD00')).toBe('#1a1a1a');
  });

  it('vermelho escuro usa texto claro', () => {
    expect(isDarkBackground('#64181c')).toBe(true);
    expect(textOnBackground('#64181c')).toBe('#ffffff');
  });
});
