import { TopologyHostStatus, TopologyPanelOptions, TopologyStatusValueMapping } from '../types';

export type StatusColorOptions = Pick<
  TopologyPanelOptions,
  'colorOnline' | 'colorOffline' | 'colorAlert' | 'statusValueMappings'
>;

function isExactMapping(entry: TopologyStatusValueMapping): boolean {
  return entry.value != null;
}

function mappingMatchesValue(entry: TopologyStatusValueMapping, value: number): boolean {
  if (isExactMapping(entry)) {
    return value === entry.value;
  }
  const from = entry.from ?? Number.NEGATIVE_INFINITY;
  const to = entry.to ?? Number.POSITIVE_INFINITY;
  return value >= from && value <= to;
}

/** Resolve status online/offline a partir do valor da Query e dos mapeamentos do painel. */
export function resolveHostStatusFromValue(
  value: number,
  mappings: TopologyStatusValueMapping[]
): TopologyHostStatus | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  for (const entry of mappings) {
    if (mappingMatchesValue(entry, value)) {
      return entry.status;
    }
  }
  return undefined;
}

export function resolveStatusColor(
  status: TopologyHostStatus,
  options: StatusColorOptions
): string {
  if (status === 'online') {
    return options.colorOnline;
  }
  if (status === 'alert') {
    return options.colorAlert;
  }
  return options.colorOffline;
}

export function resolveMappingLabel(
  value: number,
  mappings: TopologyStatusValueMapping[]
): string | undefined {
  for (const entry of mappings) {
    if (mappingMatchesValue(entry, value)) {
      return entry.label?.trim() || undefined;
    }
  }
  return undefined;
}

interface ResolvedHostStatusDisplay {
  value: number;
  status: TopologyHostStatus;
  color: string;
  text?: string;
}

/** Valor da Query → cor/texto via mapeamentos do painel (sem Field config Grafana). */
export function resolveHostStatusDisplay(
  value: number,
  options: StatusColorOptions
): ResolvedHostStatusDisplay | undefined {
  const status = resolveHostStatusFromValue(value, options.statusValueMappings);
  if (!status) {
    return undefined;
  }
  return {
    value,
    status,
    color: resolveStatusColor(status, options),
    text: resolveMappingLabel(value, options.statusValueMappings),
  };
}
