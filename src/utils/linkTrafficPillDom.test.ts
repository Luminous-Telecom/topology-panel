import { describe, expect, it } from 'vitest';
import { TopologyLink } from '../types';
import { syncTrafficPillGroup, trafficPillLabels } from './linkTrafficPillDom';

function pillGroup(): SVGGElement {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('data-link-pill', 'a->b');
  g.innerHTML = `
    <rect x="-40" y="-12" width="80" height="24" rx="8"></rect>
    <text data-link-pill-tx y="0">
      <tspan fill="#ff0">↑</tspan>
      <tspan data-link-pill-tx-value fill="#fff"> 1 Mbps</tspan>
    </text>
    <text data-link-pill-rx y="0" style="display:none">
      <tspan fill="#0ff">↓</tspan>
      <tspan data-link-pill-rx-value fill="#fff"> 2 Mbps</tspan>
    </text>
  `;
  return g;
}

describe('linkTrafficPillDom', () => {
  const link: TopologyLink = {
    from: 'a',
    to: 'b',
    fromInterface: { name: 'eth0', metrics: { rx: { itemId: '10' }, tx: { itemId: '11' } } },
  };

  it('formata labels a partir das métricas', () => {
    const labels = trafficPillLabels(link, {
      status: 'up',
      from: {
        rxBps: 2_000_000,
        txBps: 1_000_000,
        rxUtilizationPct: 1,
        txUtilizationPct: 1,
        operStatus: 'up',
        capacityMbps: 1000,
      },
      to: {
        rxBps: 2_000_000,
        txBps: 1_000_000,
        rxUtilizationPct: 1,
        txUtilizationPct: 1,
        operStatus: 'up',
        capacityMbps: 1000,
      },
    });
    expect(labels.txLabel).toBe('1 Mbps');
    expect(labels.rxLabel).toBe('2 Mbps');
  });

  it('syncTrafficPillGroup ignora valor igual', () => {
    const g = pillGroup();
    g.setAttribute('data-sync-tx', '1 Mbps');
    g.setAttribute('data-sync-rx', '');
    expect(syncTrafficPillGroup(g, '1 Mbps', undefined)).toBe(false);
  });

  it('pílula montada vazia recebe o lastvalue no sync (troca de submapa)', () => {
    const g = pillGroup();
    g.style.display = 'none';
    g.querySelector('[data-link-pill-tx-value]')!.textContent = '';
    expect(syncTrafficPillGroup(g, '1 Mbps', '2 Mbps')).toBe(true);
    expect(g.style.display).not.toBe('none');
    expect(g.querySelector('[data-link-pill-tx-value]')?.textContent?.trim()).toBe('1 Mbps');
    expect(g.querySelector('[data-link-pill-rx-value]')?.textContent?.trim()).toBe('2 Mbps');
  });

  it('syncTrafficPillGroup troca o texto sem remontar o grupo', () => {
    const g = pillGroup();
    expect(syncTrafficPillGroup(g, '4.5 Mbps', '900 Kbps')).toBe(true);
    const txValue = g.querySelector('[data-link-pill-tx-value]');
    expect(txValue?.textContent?.trim()).toBe('4.5 Mbps');
    const rxText = g.querySelector('[data-link-pill-rx]') as SVGTextElement | null;
    expect(rxText?.style.display).not.toBe('none');
  });
});
