import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startLinkFlowAnimation } from './linkFlow';

/** Faixa de fluxo como o canvas desenha: direção, estado e velocidade em data-attributes. */
function lane(root: HTMLElement, opts: { active: boolean; speed: number }): Element {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('data-link-flow', 'download');
  el.setAttribute('data-link-flow-active', opts.active ? 'true' : 'false');
  el.setAttribute('data-link-flow-speed', String(opts.speed));
  root.appendChild(el);
  return el;
}

function offsetOf(el: Element): number {
  return Number(el.getAttribute('stroke-dashoffset') ?? '0');
}

describe('startLinkFlowAnimation', () => {
  let root: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    vi.useRealTimers();
    root.remove();
  });

  it('avança o deslocamento das faixas com tráfego', () => {
    const el = lane(root, { active: true, speed: 2 });
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(100);

    expect(offsetOf(el)).toBeGreaterThan(0);
    controller.stop();
  });

  it('sem faixa ativa, dorme em vez de pedir um frame atrás do outro', () => {
    lane(root, { active: false, speed: 2 });
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(1000);

    // Um frame por varredura de 250 ms, e não um a cada ~16 ms como no laço contínuo.
    expect(raf.mock.calls.length).toBeLessThanOrEqual(6);
    controller.stop();
    raf.mockRestore();
  });

  it('faixa com velocidade zero não conta como tráfego', () => {
    const el = lane(root, { active: true, speed: 0 });
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(1000);

    expect(el.getAttribute('stroke-dashoffset')).toBeNull();
    controller.stop();
  });

  it('pausado não mexe mais no DOM, e retomar volta a animar', () => {
    const el = lane(root, { active: true, speed: 2 });
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(100);
    controller.setPaused(true);
    const parado = offsetOf(el);
    vi.advanceTimersByTime(1000);
    expect(offsetOf(el)).toBe(parado);

    controller.setPaused(false);
    vi.advanceTimersByTime(100);
    expect(offsetOf(el)).not.toBe(parado);
    controller.stop();
  });

  it('stop encerra o frame e o timer do modo dormente', () => {
    const el = lane(root, { active: true, speed: 2 });
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(100);
    controller.stop();
    const parado = offsetOf(el);

    vi.advanceTimersByTime(2000);
    expect(offsetOf(el)).toBe(parado);
    expect(vi.getTimerCount()).toBe(0);
  });
});
