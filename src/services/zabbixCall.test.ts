import { describe, expect, it } from 'vitest';
import { unwrapZabbixResult } from './zabbixCall';

describe('unwrapZabbixResult', () => {
  it('devolve o array cru do grafana-zabbix', () => {
    expect(unwrapZabbixResult([{ name: 'Backbone' }])).toEqual([{ name: 'Backbone' }]);
  });

  it('abre o envelope result', () => {
    expect(unwrapZabbixResult({ result: ['a'] })).toEqual(['a']);
  });

  it('propaga a mensagem de erro do envelope', () => {
    expect(() => unwrapZabbixResult({ error: { message: 'Session expired' } })).toThrow(
      'Session expired'
    );
  });
});
