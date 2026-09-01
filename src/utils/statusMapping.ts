import { TopologyHostStatus, TopologyPanelOptions, TopologyStatusValueMapping } from '../types';

export type StatusColorOptions = Pick<
  TopologyPanelOptions,
  'colorOnline' | 'colorOffline' | 'colorAlert' | 'statusValueMappings'
>;

function mappingBound(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : undefined;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isExactMapping(entry: TopologyStatusValueMapping): boolean {
  return mappingBound(entry.value) !== undefined;
}

function mappingMatchesValue(entry: TopologyStatusValueMapping, value: number): boolean {
  const exact = mappingBound(entry.value);
  if (exact !== undefined) {
    return value === exact;
  }
  const from = mappingBound(entry.from);
  const to = mappingBound(entry.to);
  // Faixa aberta "acima de 0" não inclui Down — senão 0 pinta online e o problema vira alerta.
  if (from === 0 && to === undefined && value === 0) {
    return false;
  }
  return value >= (from ?? Number.NEGATIVE_INFINITY) && value <= (to ?? Number.POSITIVE_INFINITY);
}

function matchingMapping(
  value: number,
  mappings: TopologyStatusValueMapping[]
): TopologyStatusValueMapping | undefined {
  for (const entry of mappings) {
    if (isExactMapping(entry) && mappingMatchesValue(entry, value)) {
      return entry;
    }
  }
  for (const entry of mappings) {
    if (!isExactMapping(entry) && mappingMatchesValue(entry, value)) {
      return entry;
    }
  }
  return undefined;
}

function isMappedStatus(status: string | undefined): status is TopologyHostStatus {
  return status === 'online' || status === 'offline' || status === 'alert';
}

/** Resolve status online/offline a partir do valor da Query e dos mapeamentos do painel. */
export function resolveHostStatusFromValue(
  value: number,
  mappings: TopologyStatusValueMapping[]
): TopologyHostStatus | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const matched = matchingMapping(value, mappings);
  if (isMappedStatus(matched?.status)) {
    return matched.status;
  }
  // 0 = Down quando nenhuma regra casou (faixa online "acima de 0" não cobre o ping down).
  if (value === 0) {
    return 'offline';
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
  const matched = matchingMapping(value, mappings);
  if (matched) {
    return matched.label?.trim() || undefined;
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
