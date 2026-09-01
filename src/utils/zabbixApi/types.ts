import type { HostProblemsMap } from '../noc/types';

export interface ZabbixInterfaceItem {
  itemid: string;
  key_: string;
  name?: string;
  lastvalue?: string;
  lastclock?: string;
  hostid?: string;
  value_type?: string | number;
  tags?: Array<{ tag: string; value: string }>;
}

export interface ZabbixHostInterfaceItems {
  hostKey: string;
  hostid: string;
  items: ZabbixInterfaceItem[];
}

export interface ZabbixInterfaceHostRef {
  hostKey: string;
  hostid?: string;
}

export interface ZabbixItemLastValue {
  itemid: string;
  lastvalue?: string;
  lastclock?: string;
  value_type?: string | number;
}

/** Host do Zabbix no modo direto — já com IP, grupos e tags resolvidos. */
export interface ZabbixDirectHost {
  hostid: string;
  /** Nome técnico (`host`). */
  host: string;
  /** Nome visível (`name`). */
  name: string;
  ip?: string;
  /** Campo Descrição do host no Zabbix. */
  description?: string;
  /** Grupos do host, restritos aos configurados no painel. */
  groups: string[];
  tags?: Array<{ tag: string; value: string }>;
}

/** Identidade dos hosts dos grupos — buscada por configuração, não a cada ciclo de status. */
export interface ZabbixDirectMetadata {
  hosts: ZabbixDirectHost[];
  /** Grupos configurados que existem de fato no Zabbix — vazio indica configuração errada. */
  resolvedGroups: string[];
  /** groupids resolvidos, reaproveitados pela descoberta única dos itemids de status. */
  groupIds: string[];
}

/** Grupos já resolvidos num ciclo anterior — dispensa repetir o `hostgroup.get`. */
export type ZabbixResolvedGroups = Pick<ZabbixDirectMetadata, 'resolvedGroups' | 'groupIds'>;

/** Lastvalue desta consulta Zabbix — usado no poll em regime (itemids já conhecidos). */
export interface ZabbixLiveSnapshot {
  savedAt: number;
  metadata: ZabbixDirectMetadata;
  knownStatusItems: ZabbixInterfaceItem[];
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
  problems: HostProblemsMap;
}
