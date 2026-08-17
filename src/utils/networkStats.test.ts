import { describe, expect, it } from 'vitest';
import { buildRegionStatsMap, formatRegionStats } from './networkStats';
import { computeNodeLayout } from './nodeLayout';
import { TopologyNode } from '../types';

describe('formatRegionStats — submapa', () => {
  it('mostra parado/alerta/online quando há hosts', () => {
    const text = formatRegionStats(
      { total: 5, offline: 1, alert: 2, online: 2, unknown: 0 },
      true,
      'submap'
    );
    expect(text).toBe('1 / 2 / 2');
  });

  it('mostra Carregando enquanto hosts do submapa não foram resolvidos', () => {
    const text = formatRegionStats(
      { total: 0, offline: 0, alert: 0, online: 0, unknown: 0, loadPending: true },
      true,
      'submap'
    );
    expect(text).toBe('Carregando…');
  });
});

describe('buildRegionStatsMap — submapa', () => {
  it('marca loadPending quando a lista de hosts ainda não chegou', () => {
    const nodes: TopologyNode[] = [
      { id: 'sm1', type: 'submap', label: 'Filial', x: 0, y: 0, submapUid: 'abc' },
    ];
    const stats = buildRegionStatsMap(nodes, new Map(), {}, {});
    expect(stats.get('sm1')?.loadPending).toBe(true);
  });
});

describe('computeNodeLayout — submapa com stats', () => {
  it('expande altura fixa pequena para caber a linha de contagem', () => {
    const layout = computeNodeLayout(
      {
        id: 'sm1',
        type: 'submap',
        label: 'Filial',
        subtitle: '2 / 0 / 5',
        width: 120,
        height: 28,
      },
      { nodeFontSize: 12, showSubtitle: true }
    );
    expect(layout.h).toBeGreaterThanOrEqual(44);
    expect(layout.subY).toBeDefined();
  });
});
