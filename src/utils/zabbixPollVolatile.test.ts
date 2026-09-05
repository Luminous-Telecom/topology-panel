import { describe, expect, it } from 'vitest';
import {
  isProblemsOnlyPanelDelta,
  panelStateNeedsRerender,
  pollVolatileFeedChanged,
  snapshotOnlyProblemsChanged,
} from './zabbixPollVolatile';
import { buildQueryIndex } from '../services/queryIndex';
import { ZabbixLiveSnapshot } from './zabbixApi';

const trafficIds = new Set(['rx-1', 'tx-1']);
const trafficKeys = new Set<string>();

function slice(overrides: Partial<Parameters<typeof panelStateNeedsRerender>[0]> = {}) {
  return {
    index: buildQueryIndex(undefined),
    lastValues: {},
    interfaceItems: [],
    problems: {},
    ready: true,
    loading: false,
    error: undefined,
    ...overrides,
  };
}

describe('panelStateNeedsRerender', () => {
  it('não re-renderiza quando só lastvalue de tráfego mudou', () => {
    const prev = slice({
      lastValues: { 'rx-1': { itemid: 'rx-1', lastvalue: '1000' } },
    });
    const next = slice({
      lastValues: { 'rx-1': { itemid: 'rx-1', lastvalue: '9000' } },
    });
    expect(panelStateNeedsRerender(prev, next, trafficIds, trafficKeys)).toBe(false);
  });

  it('re-renderiza quando lastvalue de status mudou', () => {
    const prev = slice({
      lastValues: { '10001': { itemid: '10001', lastvalue: '1' } },
    });
    const next = slice({
      lastValues: { '10001': { itemid: '10001', lastvalue: '0' } },
    });
    expect(panelStateNeedsRerender(prev, next, trafficIds, trafficKeys)).toBe(true);
  });

  it('não re-renderiza quando só interfaceItem de tráfego mudou', () => {
    const prev = slice({
      interfaceItems: [{ itemid: 'rx-1', lastvalue: '1000', key_: 'if.rx' }],
    });
    const next = slice({
      interfaceItems: [{ itemid: 'rx-1', lastvalue: '9000', key_: 'if.rx' }],
    });
    expect(panelStateNeedsRerender(prev, next, trafficIds, trafficKeys)).toBe(false);
  });

  it('não re-renderiza quando interfaceItem de tráfego mudou só de identidade', () => {
    const row = { itemid: 'rx-1', lastvalue: '1000', key_: 'if.rx' };
    const prev = slice({
      interfaceItems: [row],
    });
    const next = slice({
      interfaceItems: [{ ...row }],
    });
    expect(panelStateNeedsRerender(prev, next, trafficIds, trafficKeys)).toBe(false);
  });

  it('re-renderiza quando interfaceItem de status mudou', () => {
    const prev = slice({
      interfaceItems: [{ itemid: '10001', lastvalue: '1', key_: 'icmp' }],
    });
    const next = slice({
      interfaceItems: [{ itemid: '10001', lastvalue: '0', key_: 'icmp' }],
    });
    expect(panelStateNeedsRerender(prev, next, trafficIds, trafficKeys)).toBe(true);
  });

  it('re-renderiza quando o índice mudou', () => {
    const sharedIndex = buildQueryIndex(undefined);
    const prev = slice({ index: sharedIndex });
    const next = slice({ index: { ...sharedIndex, byRefId: new Map(sharedIndex.byRefId) } });
    expect(panelStateNeedsRerender(prev, next, trafficIds, trafficKeys)).toBe(true);
  });
});

describe('isProblemsOnlyPanelDelta', () => {
  it('detecta quando só problemas mudaram', () => {
    const prev = slice({ problems: {} });
    const next = slice({ problems: { h1: { count: 1, maxSeverity: 4, names: ['ICMP'] } } });
    expect(isProblemsOnlyPanelDelta(prev, next, trafficIds, trafficKeys)).toBe(true);
  });

  it('não marca quando status também mudou', () => {
    const prev = slice({
      problems: {},
      lastValues: { '10001': { itemid: '10001', lastvalue: '1' } },
    });
    const next = slice({
      problems: { h1: { count: 1, maxSeverity: 4 } },
      lastValues: { '10001': { itemid: '10001', lastvalue: '0' } },
    });
    expect(isProblemsOnlyPanelDelta(prev, next, trafficIds, trafficKeys)).toBe(false);
  });
});

describe('pollVolatileFeedChanged', () => {
  it('não muda quando só problemas mudaram', () => {
    const lastValues = {};
    const interfaceItems: never[] = [];
    const prev = slice({ problems: {}, lastValues, interfaceItems });
    const next = slice({
      problems: { h1: { count: 1, maxSeverity: 2 } },
      lastValues,
      interfaceItems,
    });
    expect(pollVolatileFeedChanged(prev, next, trafficIds, trafficKeys)).toBe(false);
  });

  it('muda quando lastvalue de tráfego mudou', () => {
    const prev = slice({ lastValues: { 'rx-1': { itemid: 'rx-1', lastvalue: '1' } } });
    const next = slice({ lastValues: { 'rx-1': { itemid: 'rx-1', lastvalue: '2' } } });
    expect(pollVolatileFeedChanged(prev, next, trafficIds, trafficKeys)).toBe(true);
  });

  it('não muda quando lastvalue de tráfego mudou só de identidade do objeto', () => {
    const prev = slice({ lastValues: { 'rx-1': { itemid: 'rx-1', lastvalue: '1000' } } });
    const next = slice({
      lastValues: { 'rx-1': { itemid: 'rx-1', lastvalue: '1000' } },
    });
    expect(pollVolatileFeedChanged(prev, next, trafficIds, trafficKeys)).toBe(false);
  });
});

describe('snapshotOnlyProblemsChanged', () => {
  const base: ZabbixLiveSnapshot = {
    savedAt: 1,
    metadata: { hosts: [], resolvedGroups: ['g1'], groupIds: ['10'] },
    knownStatusItems: [],
    lastValues: {},
    interfaceItems: [],
    problems: {},
  };

  it('detecta quando só problemas mudaram no snapshot bruto', () => {
    const prev = { ...base, problems: {} };
    const next = { ...base, problems: { h1: { count: 1, maxSeverity: 3 } } };
    expect(snapshotOnlyProblemsChanged(prev, next, trafficIds, trafficKeys)).toBe(true);
  });

  it('detecta com lastValues de identidade diferente mas mesmo conteúdo', () => {
    const prev = {
      ...base,
      lastValues: { '10001': { itemid: '10001', lastvalue: '1' } },
      problems: {},
    };
    const next = {
      ...base,
      lastValues: { '10001': { itemid: '10001', lastvalue: '1' } },
      problems: { h1: { count: 1, maxSeverity: 3 } },
    };
    expect(snapshotOnlyProblemsChanged(prev, next, trafficIds, trafficKeys)).toBe(true);
  });

  it('ignora quando lastValues de status mudou', () => {
    const prev = { ...base, lastValues: { '10001': { itemid: '10001', lastvalue: '1' } } };
    const next = {
      ...base,
      lastValues: { '10001': { itemid: '10001', lastvalue: '0' } },
      problems: { h1: { count: 1, maxSeverity: 3 } },
    };
    expect(snapshotOnlyProblemsChanged(prev, next, trafficIds, trafficKeys)).toBe(false);
  });
});
