import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINK_FLOW_DASH, startLinkFlowAnimation } from './linkFlow';

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

  it('o padrão de cápsula fecha o ciclo da animação (soma 18)', () => {
    const parts = LINK_FLOW_DASH.split(' ').map(Number);
    expect(parts).toHaveLength(2);
    expect(parts.reduce((sum, n) => sum + n, 0)).toBe(18);
  });

  it('seta de tráfego anda pelo cabo em px, com a defasagem da própria seta', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('data-link-flow', 'download');
    el.setAttribute('data-link-flow-arrow', 'true');
    el.setAttribute('data-link-flow-active', 'true');
    el.setAttribute('data-link-flow-speed', '2');
    el.setAttribute('data-link-flow-length', '100');
    el.setAttribute('data-link-flow-phase', '50');
    root.appendChild(el);
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(100);

    const distance = Number(el.style.getPropertyValue('offset-distance').replace('px', ''));
    expect(distance).toBeGreaterThan(50);
    expect(distance).toBeLessThan(100);
    expect(el.getAttribute('stroke-dashoffset')).toBeNull();
    controller.stop();
  });

  it('seta sem comprimento de cabo não é animada', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('data-link-flow', 'upload');
    el.setAttribute('data-link-flow-arrow', 'true');
    el.setAttribute('data-link-flow-active', 'true');
    el.setAttribute('data-link-flow-speed', '2');
    el.setAttribute('data-link-flow-length', '0');
    root.appendChild(el);
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(100);

    expect(el.style.getPropertyValue('offset-distance')).toBe('');
    controller.stop();
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
