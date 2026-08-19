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

/** Infere Mbps a partir de rótulos com padrão NxGE (ex.: 100GE, 10 GE). */
function inferCapacityMbpsFromLabel(...labels: (string | undefined)[]): number | undefined {
  for (const raw of labels) {
    const text = raw?.trim();
    if (!text) {
      continue;
    }
    const match =
      text.match(/(?:^|[^0-9])(\d+(?:\.\d+)?)\s*GE(?:[^A-Za-z0-9]|$)/i) ||
      text.match(/(?:^|[^0-9])(\d+(?:\.\d+)?)GE(?=[0-9/._:-]|$)/i);
    if (!match) {
      continue;
    }
    const gbps = Number(match[1]);
    if (Number.isFinite(gbps) && gbps > 0) {
      return Math.round(gbps * 1000);
    }
  }
  return undefined;
}

/** Capacidade em Mbps a partir da interface descoberta (item speed ou rótulo). */
export function resolveInterfaceCapacityMbps(iface?: TopologyNetworkInterface): number | undefined {
  if (iface?.speedMbps && iface.speedMbps > 0) {
    return iface.speedMbps;
  }
  return inferCapacityMbpsFromLabel(iface?.name, iface?.alias, iface?.description);
}

/** Capacidade do link — menor das duas pontas quando ambas têm valor. */
export function resolveLinkCapacityMbps(
  from?: TopologyNetworkInterface,
  to?: TopologyNetworkInterface
): number | undefined {
  const fromMbps = resolveInterfaceCapacityMbps(from);
  const toMbps = resolveInterfaceCapacityMbps(to);
  if (fromMbps && toMbps) {
    return Math.min(fromMbps, toMbps);
  }
  return fromMbps ?? toMbps;
}
