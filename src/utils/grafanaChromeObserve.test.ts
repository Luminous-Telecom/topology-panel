import { describe, expect, it, vi } from 'vitest';
import { mutationsAffectHtmlChrome, observeGrafanaChrome } from './grafanaChromeObserve';

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
});
