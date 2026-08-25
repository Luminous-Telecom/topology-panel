import {
  LinkEndpointRuntimeMetrics,
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
    rxPower: pick('rxPower'),
    txPower: pick('txPower'),
  };
}

/** Token de porta genérico (`eth0/1`, `0/0/3`) extraído de nome/alias. */
export function portTokenFromLabel(value?: string): string | undefined {
  const text = value?.trim().toLowerCase();
  if (!text) {
    return undefined;
  }
  const match = text.match(/[a-z0-9._-]*\d+\/\d+(?:\/\d+)?(?:\.\d+)?/);
  return match?.[0];
}

function labelsOf(iface: { name?: string; alias?: string }): string[] {
  return [iface.name, iface.alias].map((value) => value?.trim().toLowerCase()).filter((value): value is string => Boolean(value));
}

/** Mesma porta física — nome, alias ou token de porta; não usa SNMP index (óptica usa outro). */
export function interfacesShareIdentity(
  a: { name?: string; alias?: string },
  b: { name?: string; alias?: string }
): boolean {
  const labelsA = labelsOf(a);
  const labelsB = labelsOf(b);
  for (const left of labelsA) {
    for (const right of labelsB) {
      if (left === right) {
        return true;
      }
      if (left.length >= 4 && right.includes(left)) {
        return true;
      }
      if (right.length >= 4 && left.includes(right)) {
        return true;
      }
    }
  }
  const tokensA = [portTokenFromLabel(a.name), portTokenFromLabel(a.alias)].filter(
    (value): value is string => Boolean(value)
  );
  const tokensB = [portTokenFromLabel(b.name), portTokenFromLabel(b.alias)].filter(
    (value): value is string => Boolean(value)
  );
  return tokensA.some((token) => tokensB.includes(token));
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
  const byName = discovered.find((i) => i.name.trim().toLowerCase() === nameLower);
  if (byName) {
    return byName;
  }
  return discovered.find((i) => interfacesShareIdentity(ref, i));
}

/** Completa refs de sinal no cabo a partir dos itens do mesmo `item.get` do tráfego. */
export function attachSignalRefsToInterface(
  saved: TopologyInterfaceReference | undefined,
  discovered: TopologyNetworkInterface[]
): TopologyInterfaceReference | undefined {
  if (!saved) {
    return undefined;
  }
  const match = matchDiscoveredInterface(saved, discovered);
  if (!match?.metrics.rxPower && !match?.metrics.txPower) {
    return saved;
  }
  return {
    ...saved,
    metrics: mergeInterfaceMetrics(saved.metrics, match.metrics),
  };
}

/** Completa sinal óptico/rádio a partir do inventário quando o cabo ainda não gravou os itens. */
export function overlayEndpointSignal(
  runtime: LinkEndpointRuntimeMetrics | undefined,
  ref: TopologyInterfaceReference | undefined,
  discovered: TopologyNetworkInterface[]
): LinkEndpointRuntimeMetrics {
  const base = runtime ?? {};
  if (base.rxPowerDbm !== undefined && base.txPowerDbm !== undefined) {
    return base;
  }
  const matched = matchDiscoveredInterface(ref, discovered);
  const hasSignal = (iface?: TopologyNetworkInterface) =>
    iface?.rxPowerDbm !== undefined || iface?.txPowerDbm !== undefined;
  const signalSource = hasSignal(matched)
    ? matched
    : discovered.find((iface) => hasSignal(iface) && interfacesShareIdentity(ref ?? {}, iface));
  return {
    ...base,
    rxPowerDbm: base.rxPowerDbm ?? signalSource?.rxPowerDbm,
    txPowerDbm: base.txPowerDbm ?? signalSource?.txPowerDbm,
  };
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
