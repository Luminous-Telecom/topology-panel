import { TopologyHostStatus, TopologyPanelOptions } from '../types';

export type StatusColorOptions = Pick<TopologyPanelOptions, 'colorOnline' | 'colorOffline' | 'colorAlert'>;

/** Latência ICMP: 0 = offline; acima de 0 = online. */
export function resolveHostStatusFromValue(value: number): TopologyHostStatus | undefined {
  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value === 0 ? 'offline' : 'online';
}

/**
 * Status efetivo do display: lastvalue 0 é sempre offline, mesmo se o campo `status`
 * ainda disser online (merge de alias / poll anterior). Sem isso o problema Zabbix pinta alerta.
 */
export function statusFromHostDisplay(
  info: { value?: number; status?: TopologyHostStatus } | undefined
): TopologyHostStatus | undefined {
  if (info == null) {
    return undefined;
  }
  if (info.value != null) {
    return resolveHostStatusFromValue(info.value);
  }
  return info.status;
}

export function resolveStatusColor(status: TopologyHostStatus, options: StatusColorOptions): string {
  if (status === 'online') {
    return options.colorOnline;
  }
  if (status === 'alert') {
    return options.colorAlert;
  }
  return options.colorOffline;
}

interface ResolvedHostStatusDisplay {
  value: number;
  status: TopologyHostStatus;
  color: string;
  text?: string;
}

/** Latência ICMP → cor/texto (0 = offline, acima de 0 = online). */
export function resolveHostStatusDisplay(
  value: number,
  options: StatusColorOptions
): ResolvedHostStatusDisplay | undefined {
  const status = resolveHostStatusFromValue(value);
  if (!status) {
    return undefined;
  }
  return {
    value,
    status,
    color: resolveStatusColor(status, options),
    text: status === 'offline' ? 'Offline' : 'Online',
  };
}
