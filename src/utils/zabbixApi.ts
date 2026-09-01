/**
 * Tipos e helpers puros do lastvalue Zabbix. A consulta JSON-RPC vive em
 * `services/zabbixCall.ts`. Editor e ping usam o mesmo caminho.
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
