import { describe, expect, it } from 'vitest';
import {
  buildZabbixGrafanaQueries,
  buildZabbixGrafanaQuery,
  zabbixStatusItemFilter,
} from './zabbixGrafanaQuery';

describe('zabbixStatusItemFilter', () => {
  it('aceita chave exata e parametrizada, não derivadas', () => {
    expect(zabbixStatusItemFilter('icmpping')).toBe('/^icmpping($|\\[)/');
  });

  it('escapa caracteres especiais de regex', () => {
    expect(zabbixStatusItemFilter('vendor.status')).toBe('/^vendor\\.status($|\\[)/');
  });
});

describe('buildZabbixGrafanaQuery', () => {
  it('usa o grupo como refId virtual em maiúsculas', () => {
    const query = buildZabbixGrafanaQuery('zbx-uid', 'Backbone', 'icmpping');
    expect(query.refId).toBe('BACKBONE');
    expect(query.group?.filter).toBe('Backbone');
    expect(query.datasource).toEqual({ type: 'alexanderzobnin-zabbix-datasource', uid: 'zbx-uid' });
  });
});

describe('buildZabbixGrafanaQueries', () => {
  it('deduplica grupos e ignora entradas vazias', () => {
    const queries = buildZabbixGrafanaQueries('zbx', [' A ', 'A', '', 'Borda'], 'icmpping');
    expect(queries.map((q) => q.refId)).toEqual(['A', 'BORDA']);
  });

  it('retorna vazio sem datasource ou item', () => {
    expect(buildZabbixGrafanaQueries('', ['A'], 'icmpping')).toEqual([]);
    expect(buildZabbixGrafanaQueries('zbx', ['A'], '  ')).toEqual([]);
  });
});
