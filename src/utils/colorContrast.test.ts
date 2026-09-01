import { describe, expect, it } from 'vitest';
import { isDarkBackground, textOnBackground } from './colorContrast';

describe('textOnBackground', () => {
  it('verde claro usa texto escuro', () => {
    expect(isDarkBackground('#1DFD00')).toBe(false);
    expect(textOnBackground('#1DFD00')).toBe('#1a1a1a');
  });

  it('fundo transparente ou rgba fraco conta como escuro (mapa #111)', () => {
    expect(textOnBackground('transparent')).toBe('#ffffff');
    expect(textOnBackground('rgba(255, 255, 255, 0.14)')).toBe('#ffffff');
  });

  it('vermelho escuro usa texto claro', () => {
    expect(isDarkBackground('#64181c')).toBe(true);
    expect(textOnBackground('#64181c')).toBe('#ffffff');
  });
});
