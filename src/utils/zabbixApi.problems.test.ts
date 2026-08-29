import { describe, expect, it } from 'vitest';
import { parseZabbixProblems, sameHostProblems } from './zabbixApi/problems';

describe('parseZabbixProblems', () => {
  it('agrega Warning+ por hostid e ignora severidade menor', () => {
    const summary = parseZabbixProblems(
      [
        { severity: 4, name: 'Interface down', hosts: [{ hostid: '1001' }] },
        { severity: 2, name: 'ICMP timeout', hosts: [{ hostid: '1001' }] },
        { severity: 1, name: 'Info only', hosts: [{ hostid: '1001' }] },
      ],
      ['1001']
    );
    expect(summary['1001']?.count).toBe(2);
    expect(summary['1001']?.maxSeverity).toBe(4);
    expect(summary['1001']?.names).toEqual(['Interface down', 'ICMP timeout']);
  });

  it('aceita hostid no próprio problema', () => {
    const summary = parseZabbixProblems(
      [{ severity: 3, name: 'CPU high', hostid: '1002' }],
      ['1002']
    );
    expect(summary['1002']?.names).toEqual(['CPU high']);
  });

  it('ignora host que não está no índice', () => {
    const summary = parseZabbixProblems(
      [{ severity: 4, name: 'Link down', hosts: [{ hostid: '9999' }] }],
      ['1001']
    );
    expect(summary).toEqual({});
  });

  it('ignora problema suprimido', () => {
    const summary = parseZabbixProblems(
      [{ severity: 4, name: 'Interface down', suppressed: true, hosts: [{ hostid: '1001' }] }],
      ['1001']
    );
    expect(summary).toEqual({});
  });
});

describe('sameHostProblems', () => {
  it('ignora ordem das chaves e detecta recover', () => {
    const open = { '1001': { count: 1, maxSeverity: 4, names: ['Interface down'] } };
    expect(sameHostProblems(open, { '1001': { count: 1, maxSeverity: 4, names: ['Interface down'] } })).toBe(
      true
    );
    expect(sameHostProblems(open, {})).toBe(false);
  });
});
