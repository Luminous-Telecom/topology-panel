function asZabbixId(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

export { asZabbixId };

/** Itemid do Zabbix é sempre dígitos; chave de item (`algo.if.in[iface]`) não serve em `itemids`. */
export function isNumericZabbixItemId(value: string | undefined): boolean {
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

/**
 * Lastvalue (e itemid) iguais — ignora `lastclock`. Sem isso cada poll do Zabbix
 * remontava o mapa inteiro só porque o relógio do item andou.
 */
export function sameLastValuesForPaint(
  left: Record<string, { itemid?: string; lastvalue?: string; lastclock?: string }>,
  right: Record<string, { itemid?: string; lastvalue?: string; lastclock?: string }>
): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of leftKeys) {
    const a = left[key];
    const b = right[key];
    if (!b || a.itemid !== b.itemid || (a.lastvalue ?? '') !== (b.lastvalue ?? '')) {
      return false;
    }
  }
  return true;
}

/** Lastvalue dos itens de status — ignora lastclock. Tráfego novo não deve remontar o índice. */
export function sameStatusItemsLastValue(
  left: Array<{ itemid?: string; lastvalue?: string }>,
  right: Array<{ itemid?: string; lastvalue?: string }>
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const rightById = new Map<string, string>();
  for (const item of right) {
    const id = item.itemid?.trim();
    if (!id) {
      return false;
    }
    rightById.set(id, item.lastvalue ?? '');
  }
  if (rightById.size !== left.length) {
    return false;
  }
  for (const item of left) {
    const id = item.itemid?.trim();
    if (!id || rightById.get(id) !== (item.lastvalue ?? '')) {
      return false;
    }
  }
  return true;
}
