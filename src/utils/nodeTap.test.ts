import { describe, expect, it } from 'vitest';
import { NODE_DOUBLE_TAP_MS, resolveHostDoubleClickAction, resolveHostTouchTap } from './nodeTap';
import { hostNode } from './testMapFixtures';

describe('resolveHostTouchTap', () => {
  it('primeiro toque no host é peek (ICMP / falhas)', () => {
    expect(resolveHostTouchTap(null, 'host-a', 1000)).toEqual({
      kind: 'peek',
      next: { nodeId: 'host-a', time: 1000 },
    });
  });

  it('segundo toque no mesmo host dentro da janela abre Tools', () => {
    const last = { nodeId: 'host-a', time: 1000 };
    expect(resolveHostTouchTap(last, 'host-a', 1000 + NODE_DOUBLE_TAP_MS)).toEqual({
      kind: 'tools',
      next: null,
    });
  });

  it('toque atrasado ou em outro host volta a ser peek', () => {
    const last = { nodeId: 'host-a', time: 1000 };
    expect(resolveHostTouchTap(last, 'host-a', 1000 + NODE_DOUBLE_TAP_MS + 1).kind).toBe('peek');
    expect(resolveHostTouchTap(last, 'host-b', 1100).kind).toBe('peek');
  });
});

describe('resolveHostDoubleClickAction', () => {
  it('abre a ficha só leitura fora do modo editar', () => {
    expect(resolveHostDoubleClickAction(hostNode(), false)).toBe('info');
  });

  it('abre propriedades no modo editar', () => {
    expect(resolveHostDoubleClickAction(hostNode(), true)).toBe('properties');
  });

  it('ignora submapa, rede e texto', () => {
    expect(resolveHostDoubleClickAction({ id: 's1', type: 'submap', x: 0, y: 0 }, false)).toBeUndefined();
    expect(resolveHostDoubleClickAction({ id: 'n1', type: 'network', x: 0, y: 0 }, true)).toBeUndefined();
  });
});
