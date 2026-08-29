import { formatSignalDbm, linkStatusLabel } from './zabbixAdapter/formatTraffic';

/** Recorte do cabo que o tooltip de hover mostra — sem lastclock nem payload cru. */
export interface LinkHoverTooltipModel {
  fromLabel: string;
  toLabel: string;
  interfaces?: string;
  capacity?: string;
  upload?: string;
  download?: string;
  utilTx?: string;
  utilRx?: string;
  signalTx?: string;
  signalRx?: string;
  errors?: string;
  drops?: string;
  status?: string;
}

interface BuildLinkHoverTooltipInput {
  fromLabel: string;
  toLabel: string;
  fromInterfaceName?: string;
  toInterfaceName?: string;
  capacityLabel?: string;
  uploadLabel?: string;
  downloadLabel?: string;
  txUtilizationPct?: number;
  rxUtilizationPct?: number;
  txPowerDbm?: number;
  rxPowerDbm?: number;
  errors?: number;
  drops?: number;
  status?: string;
}

function formatCount(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  return String(Math.round(value));
}

/** Monta o modelo do tooltip do cabo a partir do que já está no mapa e no lastvalue. */
export function buildLinkHoverTooltip(input: BuildLinkHoverTooltipInput): LinkHoverTooltipModel {
  const fromName = input.fromInterfaceName?.trim();
  const toName = input.toInterfaceName?.trim();
  const interfaces = fromName && toName ? `${fromName} ↔ ${toName}` : undefined;
  const utilTx =
    input.txUtilizationPct !== undefined ? `${input.txUtilizationPct}%` : undefined;
  const utilRx =
    input.rxUtilizationPct !== undefined ? `${input.rxUtilizationPct}%` : undefined;
  const signalTx = formatSignalDbm(input.txPowerDbm);
  const signalRx = formatSignalDbm(input.rxPowerDbm);
  const errors = formatCount(input.errors);
  const drops = formatCount(input.drops);
  const status = input.status ? linkStatusLabel(input.status) : undefined;

  return {
    fromLabel: input.fromLabel,
    toLabel: input.toLabel,
    ...(interfaces ? { interfaces } : {}),
    ...(input.capacityLabel ? { capacity: input.capacityLabel } : {}),
    ...(input.uploadLabel ? { upload: input.uploadLabel } : {}),
    ...(input.downloadLabel ? { download: input.downloadLabel } : {}),
    ...(utilTx ? { utilTx } : {}),
    ...(utilRx ? { utilRx } : {}),
    ...(signalTx ? { signalTx } : {}),
    ...(signalRx ? { signalRx } : {}),
    ...(errors ? { errors } : {}),
    ...(drops ? { drops } : {}),
    ...(status ? { status } : {}),
  };
}
