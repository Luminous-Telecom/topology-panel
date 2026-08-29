import { isIpv4 } from '../ipv4';

export interface ZabbixHost {
  hostid?: string;
  host: string;
  name: string;
  description?: string;
  interfaces?: Array<{ ip: string; main?: string; type?: string }>;
  groups?: Array<{ name?: string }>;
  tags?: Array<{ tag?: string; value?: string }>;
}

/** Campos de identidade + descrição do host — usado no snapshot e no metadata. */
export const ZABBIX_HOST_OUTPUT = ['hostid', 'host', 'name', 'description'];

/** Zabbix host.status — 0 monitorado, 1 desativado. */
export const ZABBIX_HOST_MONITORED = 0;

export function normalizeZabbixHostDescription(raw?: string): string | undefined {
  const text = raw?.replace(/\s+/g, ' ').trim();
  return text || undefined;
}

export function pickMainInterfaceIp(
  interfaces?: Array<{ ip: string; main?: string; type?: string }>
): string | undefined {
  if (!interfaces?.length) {
    return undefined;
  }
  const main = interfaces.find((iface) => iface.main === '1');
  if (main?.ip && isIpv4(main.ip)) {
    return main.ip.trim();
  }
  const agent = interfaces.find((iface) => iface.type === '1');
  if (agent?.ip && isIpv4(agent.ip)) {
    return agent.ip.trim();
  }
  for (const iface of interfaces) {
    const ip = iface.ip?.trim();
    if (ip && isIpv4(ip)) {
      return ip;
    }
  }
  return undefined;
}
