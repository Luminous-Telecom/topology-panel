import { createLinkMetricsLiveStore } from './linkMetricsLiveStore';
import { syncTrafficPillsInRoot } from '../utils/linkTrafficPillDom';
import { describe, expect, it, vi } from 'vitest';

describe('linkMetricsLiveStore', () => {
  it('publish agenda sync DOM sem bloquear o layout', () => {
    vi.useFakeTimers();
    const store = createLinkMetricsLiveStore();
    const root = document.createElement('div');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-link-pill', 'a->b');
    group.innerHTML = `
      <rect></rect>
      <text data-link-pill-tx><tspan>↑</tspan><tspan data-link-pill-tx-value> 1 Mbps</tspan></text>
      <text data-link-pill-rx style="display:none"><tspan>↓</tspan><tspan data-link-pill-rx-value></tspan></text>
    `;
    root.appendChild(group);

    let runs = 0;
    store.subscribeDom(() => {
      runs += 1;
      syncTrafficPillsInRoot(root, new Map([
        [
          'a->b',
          {
            link: {
              from: 'a',
              to: 'b',
              fromInterface: { name: 'eth0', metrics: { rx: { itemId: '10' }, tx: { itemId: '11' } } },
            },
            metrics: {
              status: 'up',
              from: {
                rxBps: 4_000_000,
                txBps: 2_000_000,
                rxUtilizationPct: 1,
                txUtilizationPct: 1,
                operStatus: 'up',
                capacityMbps: 1000,
              },
              to: {
                rxBps: 4_000_000,
                txBps: 2_000_000,
                rxUtilizationPct: 1,
                txUtilizationPct: 1,
                operStatus: 'up',
                capacityMbps: 1000,
              },
            },
          },
        ],
      ]));
    });

    store.publish({}, {});
    expect(runs).toBe(0);
    vi.runAllTimers();
    expect(runs).toBe(1);
    const txValue = group.querySelector('[data-link-pill-tx-value]');
    expect(txValue?.textContent?.trim()).toBe('2 Mbps');
    vi.useRealTimers();
  });
});
