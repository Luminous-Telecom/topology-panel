import {
  TopologyInterfaceMetrics,
  TopologyInterfaceReference,
  TopologyNetworkInterface,
} from '../../types';

/** Converte interface descoberta em referência persistível no link. */
export function interfaceToReference(iface: TopologyNetworkInterface): TopologyInterfaceReference {
  return {
    name: iface.name,
    snmpIndex: iface.snmpIndex,
    alias: iface.alias,
    metrics: { ...iface.metrics },
  };
}

/** Mescla métricas salvas com descoberta atual (itemId salvo tem prioridade). */
export function mergeInterfaceMetrics(
  saved: TopologyInterfaceMetrics | undefined,
  discovered: TopologyInterfaceMetrics
): TopologyInterfaceMetrics {
  const pick = <K extends keyof TopologyInterfaceMetrics>(key: K): TopologyInterfaceMetrics[K] => {
    const savedRef = saved?.[key];
    if (savedRef?.itemId) {
      return savedRef;
    }
    return discovered[key];
  };

  return {
    rx: pick('rx'),
    tx: pick('tx'),
    operStatus: pick('operStatus'),
    adminStatus: pick('adminStatus'),
    speed: pick('speed'),
    errors: pick('errors'),
    drops: pick('drops'),
  };
}

/** Encontra interface descoberta compatível com referência salva. */
export function matchDiscoveredInterface(
  ref: TopologyInterfaceReference | undefined,
  discovered: TopologyNetworkInterface[]
): TopologyNetworkInterface | undefined {
  if (!ref?.name && !ref?.snmpIndex) {
    return undefined;
  }
  if (ref.snmpIndex) {
    const byIndex = discovered.find((i) => i.snmpIndex === ref.snmpIndex);
    if (byIndex) {
      return byIndex;
    }
  }
  const nameLower = ref.name.trim().toLowerCase();
  return discovered.find((i) => i.name.trim().toLowerCase() === nameLower);
}

/** Capacidade em Mbps a partir da interface ou referência. */
export function resolveInterfaceCapacityMbps(iface?: TopologyNetworkInterface): number | undefined {
  if (!iface?.speedMbps || iface.speedMbps <= 0) {
    return undefined;
  }
  return iface.speedMbps;
}
