import { describe, expect, it } from 'vitest';
import { FieldType, LoadingState, getDefaultTimeRange } from '@grafana/data';
import { buildQueryIndex } from '../services/queryIndex';

describe('useTopologyQueryIndex — integração com PanelData', () => {
  it('PanelData pronto com séries monta índice de hosts', () => {
    const index = buildQueryIndex({
      state: LoadingState.Done,
      series: [
        {
          refId: 'A',
          length: 1,
          fields: [
            {
              name: 'value',
              type: FieldType.number,
              config: {},
              values: [1],
              labels: { host: 'host-a' },
            },
          ],
        },
      ],
      timeRange: getDefaultTimeRange(),
    });
    expect(index.hosts).toEqual(['host-a']);
    expect(index.refIds).toEqual(['A']);
  });
});
