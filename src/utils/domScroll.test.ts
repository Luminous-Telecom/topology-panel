import { describe, expect, it } from 'vitest';
import { wheelTargetsScrollableDescendant } from './domScroll';

describe('wheelTargetsScrollableDescendant', () => {
  it('detecta lista rolável entre o alvo e o boundary', () => {
    const boundary = document.createElement('div');
    const list = document.createElement('ul');
    list.style.overflowY = 'auto';
    list.style.height = '40px';
    const item = document.createElement('li');
    item.textContent = 'host-a';
    list.append(item, document.createElement('li'), document.createElement('li'));
    boundary.append(list);
    document.body.append(boundary);

    list.scrollTop = 0;
    Object.defineProperty(list, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 40, configurable: true });

    const wheel = new WheelEvent('wheel', { deltaY: 120, bubbles: true });
    Object.defineProperty(wheel, 'composedPath', {
      value: () => [item, list, boundary, document.body],
    });

    expect(wheelTargetsScrollableDescendant(wheel, boundary)).toBe(true);

    boundary.remove();
  });

  it('não bloqueia zoom quando a lista já está no fim do scroll', () => {
    const boundary = document.createElement('div');
    const list = document.createElement('ul');
    list.style.overflowY = 'auto';
    list.style.height = '40px';
    const item = document.createElement('li');
    list.append(item);
    boundary.append(list);
    document.body.append(boundary);

    list.scrollTop = 160;
    Object.defineProperty(list, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 40, configurable: true });

    const wheel = new WheelEvent('wheel', { deltaY: 120, bubbles: true });
    Object.defineProperty(wheel, 'composedPath', {
      value: () => [item, list, boundary, document.body],
    });

    expect(wheelTargetsScrollableDescendant(wheel, boundary)).toBe(false);

    boundary.remove();
  });

  it('bloqueia zoom sobre overlay marcado mesmo com a lista no fim do scroll', () => {
    const boundary = document.createElement('div');
    const panel = document.createElement('div');
    panel.setAttribute('data-map-wheel-overlay', '');
    const list = document.createElement('ul');
    list.style.overflowY = 'auto';
    list.style.height = '40px';
    const item = document.createElement('li');
    list.append(item);
    panel.append(list);
    boundary.append(panel);
    document.body.append(boundary);

    list.scrollTop = 160;
    Object.defineProperty(list, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 40, configurable: true });

    const wheel = new WheelEvent('wheel', { deltaY: 120, bubbles: true });
    Object.defineProperty(wheel, 'composedPath', {
      value: () => [item, list, panel, boundary, document.body],
    });

    expect(wheelTargetsScrollableDescendant(wheel, boundary)).toBe(true);

    boundary.remove();
  });
});
