/**
 * Tipos e helpers puros do lastvalue Zabbix. A consulta JSON-RPC vive no backend Go;
 * o painel só consome `services/pluginBackend.ts`.
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
  ZabbixResolvedGroups,
} from './zabbixApi/types';
