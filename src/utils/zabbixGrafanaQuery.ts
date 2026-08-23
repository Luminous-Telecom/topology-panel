import { DataQuery } from '@grafana/schema';
import { directRefId } from '../services/zabbixDirectIndex';

/** Tipo do datasource Zabbix (Alexander Zobnin) no Grafana. */
export const ZABBIX_DATASOURCE_TYPE = 'alexanderzobnin-zabbix-datasource';

/** Schema de query usado pelo plugin Zabbix nas versões recentes. */
export const ZABBIX_QUERY_SCHEMA = 12;

/** Query type "Metrics" no plugin Zabbix. */
export const ZABBIX_QUERY_TYPE_METRICS = '0';

export interface ZabbixMetricsQuery extends DataQuery {
  schema?: number;
  queryType?: string;
  group?: { filter?: string };
  host?: { filter?: string };
  application?: { filter?: string };
  itemTag?: { filter?: string };
  item?: { filter?: string };
  macro?: { filter?: string };
  resultFormat?: string;
  options?: {
    showDisabledItems?: boolean;
    skipEmptyValues?: boolean;
    disableDataAlignment?: boolean;
    useZabbixValueMapping?: boolean;
  };
}

/**
 * Filtro regex de item: chave exata ou parametrizada (`icmpping[...]`), sem sufixos
 * derivados (`icmppingloss`, `icmppingsec`).
 */
export function zabbixStatusItemFilter(statusItemKey: string): string {
  const key = statusItemKey.trim();
  if (!key) {
    return '';
  }
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `/^${escaped}($|\\[)/`;
}

/**
 * Monta uma query Metrics por grupo de host — mesmo refId virtual usado pelo índice direto.
 */
export function buildZabbixGrafanaQuery(
  datasourceUid: string,
  groupName: string,
  statusItemKey: string
): ZabbixMetricsQuery {
  const group = groupName.trim();
  const itemFilter = zabbixStatusItemFilter(statusItemKey);
  return {
    refId: directRefId(group),
    datasource: { type: ZABBIX_DATASOURCE_TYPE, uid: datasourceUid },
    schema: ZABBIX_QUERY_SCHEMA,
    queryType: ZABBIX_QUERY_TYPE_METRICS,
    group: { filter: group },
    host: { filter: '/./' },
    application: { filter: '' },
    itemTag: { filter: '' },
    item: { filter: itemFilter },
    macro: { filter: '' },
    resultFormat: 'time_series',
    options: {
      showDisabledItems: false,
      skipEmptyValues: false,
      disableDataAlignment: false,
      useZabbixValueMapping: false,
    },
  };
}

/** Uma query Grafana por grupo configurado no painel. */
export function buildZabbixGrafanaQueries(
  datasourceUid: string,
  groupNames: string[],
  statusItemKey: string
): ZabbixMetricsQuery[] {
  const itemFilter = zabbixStatusItemFilter(statusItemKey);
  if (!datasourceUid?.trim() || !itemFilter) {
    return [];
  }
  const seen = new Set<string>();
  const queries: ZabbixMetricsQuery[] = [];
  for (const groupName of groupNames) {
    const trimmed = groupName.trim();
    if (!trimmed) {
      continue;
    }
    const refId = directRefId(trimmed);
    if (seen.has(refId)) {
      continue;
    }
    seen.add(refId);
    queries.push(buildZabbixGrafanaQuery(datasourceUid, trimmed, statusItemKey));
  }
  return queries;
}
