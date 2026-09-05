import { describe, expect, it } from 'vitest';
import { TopologyLink } from '../types';
import { syncLinkFlowStepsInRoot, syncTrafficPillGroup, trafficPillLabels } from './linkTrafficPillDom';

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

  it('syncLinkFlowStepsInRoot grava passo maior quando o upload sobe', () => {
    const root = document.createElement('div');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('data-link-flow', 'upload');
    path.setAttribute('data-link-key', 'a->b');
    path.setAttribute('data-link-flow-step', '0.1');
    root.appendChild(path);
    const links = new Map([
      [
        'a->b',
        {
          link,
          metrics: {
            status: 'up' as const,
            from: { txBps: 800_000_000, txUtilizationPct: 80, capacityMbps: 1000 },
            to: {},
          },
        },
      ],
    ]);
    expect(syncLinkFlowStepsInRoot(root, links, 1)).toBe(1);
    const busy = Number(path.getAttribute('data-link-flow-step'));
    expect(syncLinkFlowStepsInRoot(root, links, 1)).toBe(0);
    links.set('a->b', {
      link,
      metrics: {
        status: 'up',
        from: { txBps: 10_000_000, txUtilizationPct: 1, capacityMbps: 1000 },
        to: {},
      },
    });
    expect(syncLinkFlowStepsInRoot(root, links, 1)).toBe(1);
    expect(Number(path.getAttribute('data-link-flow-step'))).toBeLessThan(busy);
  });

  it('passo de download usa o RX da interface', () => {
    const root = document.createElement('div');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('data-link-flow', 'download');
    path.setAttribute('data-link-key', 'a->b');
    root.appendChild(path);
    const links = new Map([
      [
        'a->b',
        {
          link,
          metrics: {
            status: 'up' as const,
            from: {
              txBps: 10_000_000,
              rxBps: 800_000_000,
              txUtilizationPct: 1,
              rxUtilizationPct: 80,
              capacityMbps: 1000,
            },
            to: {},
          },
        },
      ],
    ]);
    expect(syncLinkFlowStepsInRoot(root, links, 1)).toBe(1);
    const downloadStep = Number(path.getAttribute('data-link-flow-step'));
    path.setAttribute('data-link-flow', 'upload');
    expect(syncLinkFlowStepsInRoot(root, links, 1)).toBe(1);
    expect(downloadStep).toBeGreaterThan(Number(path.getAttribute('data-link-flow-step')));
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
