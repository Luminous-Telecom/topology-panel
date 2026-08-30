import { describe, expect, it, vi } from 'vitest';
import {
  chromeContainsSelector,
  matchesAnySelector,
  mutationsAffectHtmlChrome,
  observeGrafanaChrome,
} from './grafanaChromeObserve';

function svgEl(tag: string): SVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

/** Observer agenda o callback no rAF depois do microtask da mutação. */
async function flushChromeObserver(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

describe('mutationsAffectHtmlChrome', () => {
  it('ignora mutação cujo target é SVG (canvas do mapa)', () => {
    expect(mutationsAffectHtmlChrome([{ target: svgEl('svg') }])).toBe(false);
  });

  it('detecta mutação no HTML do chrome Grafana', () => {
    expect(mutationsAffectHtmlChrome([{ target: document.createElement('nav') }])).toBe(true);
  });

  it('detecta se qualquer mutação do lote é HTML', () => {
    expect(
      mutationsAffectHtmlChrome([
        { target: svgEl('g') },
        { target: document.createElement('button') },
      ])
    ).toBe(true);
  });

  it('ignora mutação HTML dentro do canvas do mapa (toolbar ao entrar em edição)', () => {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-topology-canvas', '');
    const toolbar = document.createElement('div');
    wrap.appendChild(toolbar);
    expect(mutationsAffectHtmlChrome([{ target: toolbar }])).toBe(false);
  });
});

describe('matchesAnySelector', () => {
  it('acha o primeiro seletor num único querySelector', () => {
    const root = document.createElement('div');
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Salvar dashboard');
    root.appendChild(btn);
    expect(matchesAnySelector(root, ['button[aria-label="Save dashboard"]', 'button[aria-label="Salvar dashboard"]'])).toBe(
      true
    );
  });

  it('é falso sem match e com root vazio', () => {
    expect(matchesAnySelector(document.createElement('div'), ['button[aria-label="Salvar dashboard"]'])).toBe(false);
    expect(matchesAnySelector(null, ['button'])).toBe(false);
  });
});

describe('chromeContainsSelector', () => {
  it('devolve o match num elemento (fixtures de teste)', () => {
    const root = document.createElement('div');
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Salvar dashboard');
    root.appendChild(btn);
    expect(chromeContainsSelector(root, ['button[aria-label="Salvar dashboard"]'])).toBe(true);
  });

  it('acha Salvar/Sair fora da Nav toolbar (header do dashboard)', () => {
    const toolbar = document.createElement('div');
    toolbar.setAttribute('data-testid', 'data-testid Nav toolbar');
    const dashHeader = document.createElement('div');
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Salvar dashboard');
    dashHeader.appendChild(btn);
    document.body.appendChild(toolbar);
    document.body.appendChild(dashHeader);
    try {
      expect(chromeContainsSelector(document, ['button[aria-label="Salvar dashboard"]'])).toBe(true);
    } finally {
      toolbar.remove();
      dashHeader.remove();
    }
  });

  it('ignora um botão falso dentro do canvas do mapa', () => {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-topology-canvas', '');
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Salvar dashboard');
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    try {
      expect(chromeContainsSelector(document, ['button[aria-label="Salvar dashboard"]'])).toBe(false);
    } finally {
      wrap.remove();
    }
  });
});

describe('observeGrafanaChrome', () => {
  it('não dispara o callback quando só o SVG do mapa muda', async () => {
    const onHtml = vi.fn();
    const stop = observeGrafanaChrome(onHtml);
    const svg = svgEl('svg');
    document.body.appendChild(svg);
    await flushChromeObserver();
    onHtml.mockClear();

    svg.appendChild(svgEl('path'));
    await flushChromeObserver();
    expect(onHtml).not.toHaveBeenCalled();

    stop();
    svg.remove();
  });

  it('dispara o callback no rAF quando o chrome HTML muda', async () => {
    const onHtml = vi.fn();
    const stop = observeGrafanaChrome(onHtml);
    const nav = document.createElement('nav');
    document.body.appendChild(nav);
    await flushChromeObserver();
    expect(onHtml).toHaveBeenCalled();

    stop();
    nav.remove();
  });

  it('não dispara quando só a UI do mapa muda', async () => {
    const onHtml = vi.fn();
    const stop = observeGrafanaChrome(onHtml);
    const wrap = document.createElement('div');
    wrap.setAttribute('data-topology-canvas', '');
    document.body.appendChild(wrap);
    await flushChromeObserver();
    onHtml.mockClear();

    wrap.appendChild(document.createElement('button'));
    await flushChromeObserver();
    expect(onHtml).not.toHaveBeenCalled();

    stop();
    wrap.remove();
  });

  it('um observer notifica os dois consumidores (edição e playlist)', async () => {
    const edit = vi.fn();
    const playlist = vi.fn();
    const stopEdit = observeGrafanaChrome(edit);
    const stopPlaylist = observeGrafanaChrome(playlist);
    const nav = document.createElement('nav');
    document.body.appendChild(nav);
    await flushChromeObserver();
    expect(edit).toHaveBeenCalledTimes(1);
    expect(playlist).toHaveBeenCalledTimes(1);

    stopEdit();
    stopPlaylist();
    nav.remove();
  });
});
