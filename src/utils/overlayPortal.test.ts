import { afterEach, describe, expect, it } from 'vitest';
import { overlayPortalRoot } from './overlayPortal';

describe('overlayPortalRoot', () => {
  afterEach(() => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  });

  it('usa o body quando o documento não está em tela cheia', () => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    expect(overlayPortalRoot()).toBe(document.body);
  });

  it('usa o elemento em tela cheia para o Tools continuar visível', () => {
    const wrap = document.createElement('div');
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: wrap });
    expect(overlayPortalRoot()).toBe(wrap);
  });
});
