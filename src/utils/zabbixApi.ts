/**
 * Tipos e helpers puros do lastvalue Zabbix. A consulta JSON-RPC vive em
 * `services/zabbixCall.ts`. Com `zabbixPollViaBackend`, o merge equivalente roda no Go
 * (`POST /zabbix-status`); editor e ping continuam no browser.
 */
export {
  isNumericZabbixItemId,
  itemIdByKeyFromLastValues,
  mergeItemIdByKey,
  zabbixHostItemKey,
} from './zabbixApi/itemIds';
export type {
  ZabbixDirectHost,
  ZabbixDirectMetadata,
  ZabbixHostInterfaceItems,
  ZabbixInterfaceHostRef,
  ZabbixInterfaceItem,
  ZabbixItemLastValue,
  ZabbixLiveSnapshot,
  ZabbixResolvedGroups,
} from './zabbixApi/types';
