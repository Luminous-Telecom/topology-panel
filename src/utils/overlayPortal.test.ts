import { afterEach, describe, expect, it } from 'vitest';
import {
  fitOverlayBesideAnchor,
  overlayClipBox,
  overlayLocalPosition,
  overlayPortalParent,
  overlayPortalRoot,
  clampFixedOverlayPosition,
} from './overlayPortal';

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

describe('fitOverlayBesideAnchor', () => {
  const clip = { left: 0, top: 0, width: 400, height: 300 };

  it('coloca o overlay acima e à direita quando cabe no recorte', () => {
    expect(
      fitOverlayBesideAnchor(
        { left: 20, top: 200, width: 100, height: 28 },
        { width: 200, height: 80 },
        clip
      )
    ).toEqual({ left: 128, top: 112 });
  });

  it('vira para a esquerda quando não cabe à direita', () => {
    expect(
      fitOverlayBesideAnchor(
        { left: 280, top: 200, width: 100, height: 28 },
        { width: 200, height: 80 },
        clip
      )
    ).toEqual({ left: 72, top: 112 });
  });

  it('desce quando não cabe acima', () => {
    expect(
      fitOverlayBesideAnchor(
        { left: 20, top: 10, width: 100, height: 28 },
        { width: 200, height: 80 },
        clip
      )
    ).toEqual({ left: 128, top: 46 });
  });

  it('prende o overlay dentro do recorte do painel', () => {
    expect(
      fitOverlayBesideAnchor(
        { left: 20, top: 270, width: 100, height: 28 },
        { width: 200, height: 80 },
        clip
      )
    ).toEqual({ left: 128, top: 182 });
    expect(
      fitOverlayBesideAnchor(
        { left: 20, top: 250, width: 100, height: 28 },
        { width: 380, height: 280 },
        clip
      )
    ).toEqual({ left: 8, top: 12 });
  });
});

describe('overlayClipBox', () => {
  it('usa o canvas ancestral quando ele tem tamanho', () => {
    const canvas = document.createElement('div');
    canvas.setAttribute('data-topology-canvas', '');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 10, top: 20, width: 800, height: 400 }),
    });
    const child = document.createElement('button');
    canvas.appendChild(child);
    document.body.appendChild(canvas);
    expect(overlayClipBox(child)).toEqual({ left: 10, top: 20, width: 800, height: 400 });
    canvas.remove();
  });
});

describe('overlayPortalParent', () => {
  it('usa o canvas ancestral quando existe', () => {
    const canvas = document.createElement('div');
    canvas.setAttribute('data-topology-canvas', '');
    const child = document.createElement('button');
    canvas.appendChild(child);
    document.body.appendChild(canvas);
    expect(overlayPortalParent(child)).toBe(canvas);
    canvas.remove();
  });
});

describe('overlayLocalPosition', () => {
  it('converte coordenada de tela para o ancestral', () => {
    expect(overlayLocalPosition({ left: 128, top: 182 }, { left: 10, top: 20, width: 400, height: 300 })).toEqual({
      left: 118,
      top: 162,
    });
  });
});

describe('clampFixedOverlayPosition', () => {
  const viewport = { width: 800, height: 600 };

  it('fica à direita e abaixo do ponteiro quando cabe', () => {
    expect(clampFixedOverlayPosition(100, 80, { width: 240, height: 120 }, viewport)).toEqual({
      left: 112,
      top: 92,
    });
  });

  it('vira para a esquerda e para cima perto da borda', () => {
    expect(clampFixedOverlayPosition(760, 560, { width: 240, height: 120 }, viewport)).toEqual({
      left: 508,
      top: 428,
    });
  });
});
