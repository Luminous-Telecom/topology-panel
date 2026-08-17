import { describe, expect, it } from 'vitest';
import { DataFrame, Field, FieldType, LoadingState, PanelData, getDefaultTimeRange } from '@grafana/data';
import {
  buildQueryIndex,
  hostDisplayByRefIdFromIndex,
  numericHostsForRefIds,
  queryHostsByRefIdFromIndex,
} from './queryIndex';
import { StatusColorOptions } from '../utils/statusMapping';

function numberField(host: string, values: number[], extraLabels?: Record<string, string>): Field {
  return {
    name: 'value',
    type: FieldType.number,
    config: {},
    values,
    labels: { host, ...extraLabels },
  };
}

function timeField(values: number[]): Field {
  return { name: 'time', type: FieldType.time, config: {}, values };
}

function frame(refId: string, fields: Field[]): DataFrame {
  return { refId, fields, length: fields[0]?.values.length ?? 0 };
}

function panelData(series: DataFrame[], targets?: Array<{ refId: string }>): PanelData {
  const request = targets
    ? ({ targets } as unknown as PanelData['request'])
    : undefined;
  return { state: LoadingState.Done, series, timeRange: getDefaultTimeRange(), request };
}

const STATUS_OPTIONS: StatusColorOptions = {
  colorOnline: '#2E7D32',
  colorOffline: '#C62828',
  colorAlert: '#F9A825',
  statusValueMappings: [],
};

describe('buildQueryIndex', () => {
  it('lê hosts, último valor e refIds numa única passagem', () => {
    const index = buildQueryIndex(
      panelData([
        frame('A', [timeField([1, 2]), numberField('host-b', [0.1, 0.2])]),
        frame('B', [timeField([1, 2]), numberField('host-a', [1, 0])]),
      ])
    );

    expect(index.hosts).toEqual(['host-a', 'host-b']);
    expect(index.refIds).toEqual(['A', 'B']);
    expect(index.byRefId.get('A')?.lastValues.get('host-b')).toBe(0.2);
    expect(index.byRefId.get('B')?.lastValues.get('host-a')).toBe(0);
  });

  it('ignora null/undefined ao resolver o último valor numérico', () => {
    const index = buildQueryIndex(
      panelData([frame('A', [numberField('host-a', [5, null as unknown as number, undefined as unknown as number])])])
    );
    expect(index.byRefId.get('A')?.lastValues.get('host-a')).toBe(5);
  });

  it('o primeiro campo com valor vence dentro do mesmo refId', () => {
    const index = buildQueryIndex(
      panelData([
        frame('A', [numberField('host-a', [1]), numberField('host-a', [99])]),
      ])
    );
    expect(index.byRefId.get('A')?.lastValues.get('host-a')).toBe(1);
  });

  it('hosts por refId incluem séries sem valor numérico', () => {
    const stringField: Field = {
      name: 'text',
      type: FieldType.string,
      config: {},
      values: ['ok'],
      labels: { host: 'host-sem-numero' },
    };
    const index = buildQueryIndex(panelData([frame('A', [stringField])]));

    expect(queryHostsByRefIdFromIndex(index)).toEqual({ A: ['host-sem-numero'] });
    expect(numericHostsForRefIds(index, ['A']).size).toBe(0);
  });

  it('usa o refId do único target quando a série não traz refId', () => {
    const noRefIdFrame: DataFrame = { fields: [numberField('host-a', [1])], length: 1 };
    const index = buildQueryIndex(panelData([noRefIdFrame], [{ refId: 'c' }]));
    expect([...index.byRefId.keys()]).toEqual(['C']);
  });

  it('monta metadata por nome visível, IP e hostid', () => {
    const index = buildQueryIndex(
      panelData([
        frame('A', [
          numberField('10.0.0.7', [1], {
            __zbx_host_visible_name: 'Switch Core',
            hostid: '10500',
          }),
        ]),
      ])
    );

    expect(index.metadata['10.0.0.7']).toMatchObject({
      name: 'Switch Core',
      ip: '10.0.0.7',
      hostid: '10500',
    });
    expect(index.metadata['Switch Core']).toBe(index.metadata['10.0.0.7']);
    expect(index.metadata['10500']).toBe(index.metadata['10.0.0.7']);
  });

  it('resolve o uid do datasource pelo target da Query', () => {
    const data = panelData([], [{ refId: 'A' }]);
    const targets = data.request?.targets as Array<Record<string, unknown>> | undefined;
    if (targets) {
      targets[0].datasource = { uid: 'zabbix-prod' };
    }
    expect(buildQueryIndex(data).datasourceUid).toBe('zabbix-prod');
  });

  it('reaproveita o índice para o mesmo PanelData (uma varredura por refresh)', () => {
    const data = panelData([frame('A', [numberField('host-a', [1])])]);
    expect(buildQueryIndex(data)).toBe(buildQueryIndex(data));
  });

  it('data ausente devolve índice vazio sem quebrar', () => {
    const index = buildQueryIndex(undefined);
    expect(index.hosts).toEqual([]);
    expect(index.refIds).toEqual([]);
    expect(index.datasourceUid).toBeUndefined();
  });
});

describe('hostDisplayByRefIdFromIndex', () => {
  it('aplica cor de status sobre o valor já indexado', () => {
    const index = buildQueryIndex(panelData([frame('A', [numberField('host-a', [1])])]));
    const display = hostDisplayByRefIdFromIndex(index, STATUS_OPTIONS);
    expect(display.A['host-a'].value).toBe(1);
  });

  it('trocar as cores do painel não exige reler as séries', () => {
    const data = panelData([frame('A', [numberField('host-a', [1])])]);
    const index = buildQueryIndex(data);
    hostDisplayByRefIdFromIndex(index, STATUS_OPTIONS);
    hostDisplayByRefIdFromIndex(index, { ...STATUS_OPTIONS, colorOnline: '#00FF00' });
    expect(buildQueryIndex(data)).toBe(index);
  });
});
