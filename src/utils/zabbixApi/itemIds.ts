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
