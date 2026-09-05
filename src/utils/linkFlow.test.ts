import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINK_FLOW_DASH, LINK_FLOW_SPEED, startLinkFlowAnimation } from './linkFlow';

/** Faixa de fluxo como o canvas desenha: direção e ativo no DOM; velocidade é constante. */
function lane(root: HTMLElement, opts: { active: boolean }): Element {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('data-link-flow', 'download');
  el.setAttribute('data-link-flow-active', opts.active ? 'true' : 'false');
  root.appendChild(el);
  return el;
}

function offsetOf(el: Element): number {
  if (el instanceof SVGElement && el.style.strokeDashoffset) {
    return Math.abs(Number(el.style.strokeDashoffset));
  }
  return Math.abs(Number(el.getAttribute('stroke-dashoffset') ?? '0'));
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
    el.setAttribute('data-link-flow-length', '100');
    el.setAttribute('data-link-flow-phase', '50');
    el.setAttribute('data-link-flow-path', 'M 0 0 L 100 0');
    root.appendChild(el);
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(100);

    const distance = Number(el.style.getPropertyValue('offset-distance').replace('px', ''));
    expect(distance).toBeGreaterThan(50);
    expect(distance).toBeLessThan(100);
    expect(el.getAttribute('stroke-dashoffset')).toBeNull();
    controller.stop();
  });

  it('o poll não precisa regravar velocidade: o passo é fixo e o offset-path permanece', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    el.setAttribute('data-link-flow', 'download');
    el.setAttribute('data-link-flow-arrow', 'true');
    el.setAttribute('data-link-flow-length', '100');
    el.setAttribute('data-link-flow-phase', '0');
    el.setAttribute('data-link-flow-path', 'M 0 0 L 100 0');
    root.appendChild(el);
    const controller = startLinkFlowAnimation(root);
    vi.advanceTimersByTime(50);
    const before = Number(el.style.getPropertyValue('offset-distance').replace('px', ''));
    const pathBefore = el.style.getPropertyValue('offset-path');
    vi.advanceTimersByTime(50);
    const after = Number(el.style.getPropertyValue('offset-distance').replace('px', ''));
    expect(LINK_FLOW_SPEED).toBe(1);
    expect(after).toBeGreaterThan(before);
    expect(el.style.getPropertyValue('offset-path')).toBe(pathBefore);
    expect(el.getAttribute('data-link-flow-speed')).toBeNull();
    controller.stop();
  });

  it('seta sem comprimento de cabo não é animada', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('data-link-flow', 'upload');
    el.setAttribute('data-link-flow-arrow', 'true');
    el.setAttribute('data-link-flow-length', '0');
    root.appendChild(el);
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(100);

    expect(el.style.getPropertyValue('offset-distance')).toBe('');
    controller.stop();
  });

  it('avança o deslocamento das faixas ativas', () => {
    const el = lane(root, { active: true });
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(100);

    expect(offsetOf(el)).toBeGreaterThan(0);
    controller.stop();
  });

  it('respeita período e passo customizados no dash', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('data-link-flow', 'download');
    el.setAttribute('data-link-flow-period', '28');
    el.setAttribute('data-link-flow-step', '2');
    el.setAttribute('data-link-flow-active', 'true');
    root.appendChild(el);
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(100);

    expect(Math.abs(offsetOf(el))).toBeGreaterThan(10);
    controller.stop();
  });

  it('sem faixa ativa, dorme em vez de pedir um frame atrás do outro', () => {
    lane(root, { active: false });
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(1000);

    // Um frame por varredura de 250 ms, e não um a cada ~16 ms como no laço contínuo.
    expect(raf.mock.calls.length).toBeLessThanOrEqual(6);
    controller.stop();
    raf.mockRestore();
  });

  it('wake anima no frame seguinte sem esperar a varredura dormente', () => {
    const el = lane(root, { active: false });
    const controller = startLinkFlowAnimation(root);
    vi.advanceTimersByTime(20);
    el.setAttribute('data-link-flow-active', 'true');
    controller.wake();
    vi.advanceTimersByTime(50);
    expect(offsetOf(el)).toBeGreaterThan(0);
    controller.stop();
  });

  it('preserva o offset quando o path é trocado com o mesmo data-link-key', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('data-link-flow', 'upload');
    el.setAttribute('data-link-key', 'host-a->host-b');
    el.setAttribute('data-link-flow-period', '28');
    el.setAttribute('data-link-flow-step', '2');
    root.appendChild(el);
    const controller = startLinkFlowAnimation(root);
    vi.advanceTimersByTime(100);
    const before = offsetOf(el);

    const replacement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    replacement.setAttribute('data-link-flow', 'upload');
    replacement.setAttribute('data-link-key', 'host-a->host-b');
    replacement.setAttribute('data-link-flow-period', '28');
    replacement.setAttribute('data-link-flow-step', '2');
    el.remove();
    root.appendChild(replacement);
    controller.wake();
    vi.advanceTimersByTime(50);
    expect(offsetOf(replacement)).toBeGreaterThanOrEqual(before);
    controller.stop();
  });

  it('pausado não mexe mais no DOM, e retomar volta a animar', () => {
    const el = lane(root, { active: true });
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

  it('reaplica offset-path quando a escala do mapa muda', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    el.setAttribute('data-link-flow', 'download');
    el.setAttribute('data-link-flow-arrow', 'true');
    el.setAttribute('data-link-flow-length', '100');
    el.setAttribute('data-link-flow-phase', '0');
    el.setAttribute('data-link-flow-path', 'M 0 0 L 100 0');
    root.appendChild(el);
    const setProperty = vi.spyOn(el.style, 'setProperty');
    const controller = startLinkFlowAnimation(root);
    vi.advanceTimersByTime(50);
    const callsBefore = setProperty.mock.calls.filter(([name]) => name === 'offset-path').length;
    expect(callsBefore).toBeGreaterThan(0);

    controller.setViewScale(2);
    vi.advanceTimersByTime(50);
    const callsAfter = setProperty.mock.calls.filter(([name]) => name === 'offset-path').length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
    controller.stop();
    setProperty.mockRestore();
  });

  it('stop encerra o frame e o timer do modo dormente', () => {
    const el = lane(root, { active: true });
    const controller = startLinkFlowAnimation(root);

    vi.advanceTimersByTime(100);
    controller.stop();
    const parado = offsetOf(el);

    vi.advanceTimersByTime(2000);
    expect(offsetOf(el)).toBe(parado);
    expect(vi.getTimerCount()).toBe(0);
  });
});
