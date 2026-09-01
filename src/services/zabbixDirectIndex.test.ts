import { describe, expect, it } from 'vitest';
import { flattenHostDisplayByRefId } from '../utils/queryHosts';
import { defaultOptions } from '../types';
import { hostDisplayByRefIdFromIndex, queryHostsByRefIdFromIndex, STATUS_ORPHAN_REF_ID } from './queryIndex';
import { buildZabbixDirectIndex, applyStatusValuesToIndex, directRefId, directRefInfosFromGroups, resolvePanelQueryRefInfos, statusValuesByHostId } from './zabbixDirectIndex';
import { ZabbixDirectHost, ZabbixInterfaceItem } from '../utils/zabbixApi';

function item(hostid: string, key_: string, lastvalue?: string): ZabbixInterfaceItem {
  return { itemid: `${hostid}-${key_}`, key_, lastvalue, hostid };
}

function host(overrides: Partial<ZabbixDirectHost> & { hostid: string; name: string }): ZabbixDirectHost {
  return {
    host: overrides.name,
    groups: [],
    ...overrides,
  };
}

describe('statusValuesByHostId', () => {
  it('prefere a chave exata e ignora derivadas como icmppingloss', () => {
    const values = statusValuesByHostId(
      [
        item('10', 'icmppingloss', '100'),
        item('10', 'icmppingsec', '0.05'),
        item('10', 'icmpping', '1'),
      ],
      'icmpping'
    );
    expect(values.get('10')?.value).toBe(1);
  });

  it('aceita a forma parametrizada da chave', () => {
    const values = statusValuesByHostId([item('10', 'icmpping[,,,,]', '0')], 'icmpping');
    expect(values.get('10')?.value).toBe(0);
  });

  it('descarta host que só tem itens derivados', () => {
    const values = statusValuesByHostId([item('10', 'icmppingloss', '100')], 'icmpping');
    expect(values.has('10')).toBe(false);
  });

  it('descarta último valor não numérico', () => {
    const values = statusValuesByHostId([item('10', 'icmpping', 'nodata')], 'icmpping');
    expect(values.has('10')).toBe(false);
  });

  it('aceita o item quando o campo do painel é o nome, não a key_', () => {
    const values = statusValuesByHostId(
      [{ ...item('10', 'icmppingsec', '0.012'), name: 'Status item' }],
      'Status item'
    );
    expect(values.get('10')?.value).toBe(0.012);
  });

  it('com mesmo rank, prefere lastclock mais recente e depois falha (0)', () => {
    const values = statusValuesByHostId(
      [
        { ...item('10', 'icmppingsec', '0.0006'), lastclock: '100' },
        { ...item('10', 'icmppingsec', '0'), lastclock: '200' },
      ],
      'icmppingsec'
    );
    expect(values.get('10')?.value).toBe(0);
    expect(values.get('10')?.updatedAtSec).toBe(200);
  });
});

describe('buildZabbixDirectIndex', () => {
  const hosts = [
    host({ hostid: '10', name: 'RB-CORE', host: 'rb-core', ip: '10.0.0.1', groups: ['Backbone'] }),
    host({
      hostid: '11',
      name: 'RB-BORDA',
      host: 'rb-borda',
      ip: '10.0.0.2',
      description: 'Borda POP Norte',
      groups: ['Backbone', 'Borda'],
    }),
  ];
  const statusItems = [item('10', 'icmpping', '1'), item('11', 'icmpping', '0')];

  const index = buildZabbixDirectIndex({
    datasourceUid: 'zbx',
    groupNames: ['Backbone', 'Borda'],
    statusItemKey: 'icmpping',
    hosts,
    statusItems,
  });

  it('usa o grupo como refId virtual, em maiúsculas', () => {
    expect(index.refIds).toEqual(['BACKBONE', 'BORDA']);
    expect(index.refInfos[0].hint).toBe('Grupo Zabbix: Backbone');
  });

  it('agrupa hosts e últimos valores por grupo', () => {
    expect([...(index.byRefId.get('BACKBONE')?.hosts ?? [])]).toEqual(['RB-CORE', 'RB-BORDA']);
    expect(index.byRefId.get('BACKBONE')?.lastValues.get('RB-CORE')).toBe(1);
    expect(index.byRefId.get('BACKBONE')?.lastValues.get('rb-core')).toBe(1);
    expect(index.byRefId.get('BACKBONE')?.lastValues.get('10')).toBe(1);
    expect(index.byRefId.get('BACKBONE')?.lastValues.get('10.0.0.1')).toBe(1);
    expect([...(index.byRefId.get('BORDA')?.hosts ?? [])]).toEqual(['RB-BORDA']);
    expect(index.byRefId.get('BORDA')?.lastValues.get('RB-BORDA')).toBe(0);
    expect(index.byRefId.get('BORDA')?.lastValues.get('10.0.0.2')).toBe(0);
  });

  it('indexa metadata por nome visível, nome técnico, IP e hostid', () => {
    for (const key of ['RB-CORE', 'rb-core', '10.0.0.1', '10']) {
      expect(index.metadata[key]?.name).toBe('RB-CORE');
      expect(index.metadata[key]?.ip).toBe('10.0.0.1');
      expect(index.metadata[key]?.hostid).toBe('10');
    }
  });

  it('propaga a descrição do host Zabbix no metadata', () => {
    expect(index.metadata['RB-BORDA']?.description).toBe('Borda POP Norte');
    expect(index.metadata['10.0.0.2']?.description).toBe('Borda POP Norte');
    expect(index.metadata['RB-CORE']?.description).toBeUndefined();
  });

  it('expõe os grupos do host para as regras de template', () => {
    expect(index.metadata['RB-BORDA']?.hostGroups).toEqual(['Backbone', 'Borda']);
  });

  it('lista os hosts ordenados e mantém o datasource', () => {
    expect(index.hosts).toEqual(['RB-BORDA', 'RB-CORE']);
    expect(index.datasourceUid).toBe('zbx');
  });

  it('cria o bucket do grupo mesmo sem host, para não sumir do editor', () => {
    const empty = buildZabbixDirectIndex({
      datasourceUid: 'zbx',
      groupNames: ['Vazio'],
      statusItemKey: 'icmpping',
      hosts: [],
      statusItems: [],
    });
    expect(empty.byRefId.get('VAZIO')?.hosts.size).toBe(0);
    expect(empty.refIds).toEqual(['VAZIO']);
  });

  it('não aplica lastvalue de host que saiu da lista monitorada', () => {
    const scoped = buildZabbixDirectIndex({
      datasourceUid: 'zbx',
      groupNames: ['Backbone'],
      statusItemKey: 'icmpping',
      hosts: [hosts[0]],
      statusItems: [item('10', 'icmpping', '1'), item('11', 'icmpping', '0')],
    });
    expect(scoped.hosts).toEqual(['RB-CORE']);
    expect(scoped.byRefId.get('BACKBONE')?.lastValues.get('RB-CORE')).toBe(1);
    expect(scoped.byRefId.get('BACKBONE')?.lastValues.has('RB-BORDA')).toBe(false);
    expect(scoped.metadata['RB-BORDA']).toBeUndefined();
  });

  it('pinta lastvalue mesmo quando o host veio sem nome de grupo', () => {
    const orphan = buildZabbixDirectIndex({
      datasourceUid: 'zbx',
      groupNames: ['Backbone'],
      statusItemKey: 'icmpping',
      hosts: [host({ hostid: '10', name: 'RB-CORE', host: 'rb-core', ip: '10.0.0.1', groups: [] })],
      statusItems: [item('10', 'icmpping', '1')],
    });
    expect(orphan.refIds).toEqual(['BACKBONE']);
    expect(orphan.byRefId.get('BACKBONE')?.lastValues.size).toBe(0);
    expect(orphan.byRefId.get(STATUS_ORPHAN_REF_ID)?.lastValues.get('RB-CORE')).toBe(1);
    expect(orphan.byRefId.get(STATUS_ORPHAN_REF_ID)?.lastValues.get('rb-core')).toBe(1);
    expect(orphan.byRefId.get(STATUS_ORPHAN_REF_ID)?.lastValues.get('10')).toBe(1);
    expect(orphan.byRefId.get(STATUS_ORPHAN_REF_ID)?.lastValues.get('10.0.0.1')).toBe(1);
    expect(orphan.byRefId.get(STATUS_ORPHAN_REF_ID)?.hosts.size).toBe(0);
    expect(queryHostsByRefIdFromIndex(orphan)).toEqual({ BACKBONE: [] });
    const display = flattenHostDisplayByRefId(
      hostDisplayByRefIdFromIndex(orphan, {
        colorOnline: defaultOptions().colorOnline,
        colorOffline: defaultOptions().colorOffline,
        colorAlert: defaultOptions().colorAlert,
        statusValueMappings: defaultOptions().statusValueMappings,
      })
    );
    expect(display['RB-CORE']?.status).toBe('online');
    expect(display['rb-core']?.status).toBe('online');
    expect(display['10']?.status).toBe('online');
    expect(display['10.0.0.1']?.status).toBe('online');
  });

  it('ignora grupo do host que não está configurado no painel', () => {
    const scoped = buildZabbixDirectIndex({
      datasourceUid: 'zbx',
      groupNames: ['Borda'],
      statusItemKey: 'icmpping',
      hosts,
      statusItems,
    });
    expect(scoped.byRefId.has('BACKBONE')).toBe(false);
    expect([...(scoped.byRefId.get('BORDA')?.hosts ?? [])]).toEqual(['RB-BORDA']);
  });
});

describe('applyStatusValuesToIndex', () => {
  const hosts = [
    host({ hostid: '10', name: 'host-a', host: 'host-a', ip: '10.0.0.1', groups: ['Backbone'] }),
  ];

  it('reusa o índice quando o número do lastvalue é o mesmo ("1" vs "1.0")', () => {
    const first = buildZabbixDirectIndex({
      datasourceUid: 'zbx',
      groupNames: ['Backbone'],
      statusItemKey: 'icmpping',
      hosts,
      statusItems: [item('10', 'icmpping', '1')],
    });
    const next = applyStatusValuesToIndex(first, hosts, [item('10', 'icmpping', '1.0')], 'icmpping');
    expect(next.index).toBe(first);
    expect(next.changedHosts).toBe(0);
  });

  it('só troca o bucket do host que mudou e reusa metadata', () => {
    const first = buildZabbixDirectIndex({
      datasourceUid: 'zbx',
      groupNames: ['Backbone'],
      statusItemKey: 'icmpping',
      hosts,
      statusItems: [item('10', 'icmpping', '1')],
    });
    const next = applyStatusValuesToIndex(first, hosts, [item('10', 'icmpping', '0')], 'icmpping');
    expect(next.index).not.toBe(first);
    expect(next.changedHosts).toBe(1);
    expect(next.index.metadata).toBe(first.metadata);
    expect(next.index.hosts).toBe(first.hosts);
    expect(next.index.byRefId.get('BACKBONE')?.lastValues.get('host-a')).toBe(0);
    expect(first.byRefId.get('BACKBONE')?.lastValues.get('host-a')).toBe(1);
  });
});

describe('directRefId', () => {
  it('normaliza igual aos refIds da Query', () => {
    expect(directRefId('  backbone ')).toBe('BACKBONE');
  });
});

describe('directRefInfosFromGroups', () => {
  it('monta refIds virtuais com hint do grupo', () => {
    expect(directRefInfosFromGroups(['Backbone', ' borda '])).toEqual([
      { refId: 'BACKBONE', hint: 'Grupo Zabbix: Backbone' },
      { refId: 'BORDA', hint: 'Grupo Zabbix: borda' },
    ]);
  });
});

describe('buildZabbixDirectIndex com nome de item', () => {
  it('indexa lastValues quando o campo do painel é o nome, não a key_', () => {
    const index = buildZabbixDirectIndex({
      datasourceUid: 'zbx',
      groupNames: ['Backbone'],
      statusItemKey: 'Status item',
      hosts: [host({ hostid: '10', name: 'host-a', host: 'host-a', ip: '10.0.0.1', groups: ['Backbone'] })],
      statusItems: [{ ...item('10', 'icmppingsec', '0.012'), name: 'Status item' }],
    });
    expect(index.byRefId.get('BACKBONE')?.lastValues.get('host-a')).toBe(0.012);
  });
});

describe('resolvePanelQueryRefInfos', () => {
  it('prioriza refInfos sincronizados pelo painel', () => {
    const synced = [{ refId: 'A', hint: 'Query A' }];
    expect(resolvePanelQueryRefInfos({}, synced)).toBe(synced);
  });

  it('cai nos grupos dos submapas quando não há sync', () => {
    expect(resolvePanelQueryRefInfos({}, [], ['Backbone'])).toEqual([
      { refId: 'BACKBONE', hint: 'Grupo Zabbix: Backbone' },
    ]);
  });
});
