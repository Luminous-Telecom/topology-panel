/**
 * Superfície pública do JSON-RPC Zabbix (poll, catálogo do editor e problemas).
 *
 * Ping/ICMP vive em `zabbixApi/ping.ts` e **não** é reexportado aqui — o chunk principal
 * (`useZabbixDirectIndex`) não pode puxar `script.execute` no first load.
 */
export { isBenignZabbixFetchError } from './zabbixApi/client';
export {
  isNumericZabbixItemId,
  itemIdByKeyFromLastValues,
  mergeItemIdByKey,
  sameLastValuesForPaint,
  sameStatusItemsLastValue,
  zabbixHostItemKey,
} from './zabbixApi/itemIds';
export type {
  ZabbixDirectHost,
  ZabbixDirectMetadata,
  ZabbixHostInterfaceItems,
  ZabbixInterfaceItem,
  ZabbixItemLastValue,
  ZabbixResolvedGroups,
} from './zabbixApi/types';
export {
  fetchZabbixDirectMetadata,
  fetchZabbixHostGroupNames,
  fetchZabbixResolvedGroups,
  fetchZabbixSignalInventory,
  fetchZabbixStatusLastValues,
  fetchZabbixTrafficLastValues,
  resolveZabbixItemIdsByKeys,
  statusItemSearch,
} from './zabbixApi/poll';
export { fetchZabbixHostInterfaceItems, fetchZabbixItemNames } from './zabbixApi/catalog';
export type { ZabbixInterfaceHostRef } from './zabbixApi/catalog';
export { fetchZabbixProblems, parseZabbixProblems } from './zabbixApi/problems';
export type { ZabbixProblemRow } from './zabbixApi/problems';
