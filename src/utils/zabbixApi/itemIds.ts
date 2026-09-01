/** Itemid do Zabbix é sempre dígitos; chave de item (`algo.if.in[iface]`) não serve em `itemids`. */
export function isNumericZabbixItemId(value: string | undefined): value is string {
  return Boolean(value && /^\d+$/.test(value.trim()));
}

/** A `key_` se repete entre hosts — lastvalue e itemid precisam do par host+chave. */
export function zabbixHostItemKey(hostid: string, itemKey: string): string {
  return `${hostid}:${itemKey}`;
}

/** Só entradas `hostid:key` — o itemid sozinho não diz qual cabo resolver. */
export function itemIdByKeyFromLastValues(
  lastValues: Record<string, { itemid?: string }> | undefined
): Map<string, string> {
  const next = new Map<string, string>();
  if (!lastValues) {
    return next;
  }
  for (const [scoped, row] of Object.entries(lastValues)) {
    const id = row.itemid?.trim();
    if (!id || !scoped.includes(':') || !isNumericZabbixItemId(id)) {
      continue;
    }
    next.set(scoped, id);
  }
  return next;
}

/** Acrescenta `hostid:key` → itemid a partir dos itens devolvidos pelo `item.get`. */
export function mergeItemIdByKey(
  into: Map<string, string>,
  items: Array<{ itemid?: string; hostid?: string; key_?: string }>
): void {
  for (const item of items) {
    const id = item.itemid?.trim();
    const hostid = item.hostid?.trim();
    const key = item.key_?.trim();
    if (!id || !hostid || !key || !isNumericZabbixItemId(id) || !isNumericZabbixItemId(hostid)) {
      continue;
    }
    into.set(zabbixHostItemKey(hostid, key), id);
  }
}
