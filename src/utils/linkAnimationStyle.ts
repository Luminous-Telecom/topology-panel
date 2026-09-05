export const LINK_ANIMATION_SPEED_DEFAULT = 0.5;
export const LINK_ANIMATION_SPEED_MIN = 0.25;
export const LINK_ANIMATION_SPEED_MAX = 4;

export const LINK_ANIMATION_EFFECTS = ['dash', 'dualDash', 'capsules', 'pulses', 'arrows', 'comet'] as const;
export type LinkAnimationEffect = (typeof LINK_ANIMATION_EFFECTS)[number];

export const LINK_ANIMATION_EFFECT_DEFAULT: LinkAnimationEffect = 'pulses';

export const LINK_ANIMATION_EFFECT_OPTIONS: Array<{ value: LinkAnimationEffect; label: string }> = [
  { value: 'dash', label: 'Traço' },
  { value: 'dualDash', label: 'Traço nos dois sentidos' },
  { value: 'capsules', label: 'Cápsulas' },
  { value: 'pulses', label: 'Pulsos' },
  { value: 'arrows', label: 'Setas' },
  { value: 'comet', label: 'Cometa' },
];

export function isLinkAnimationEffect(value: string): value is LinkAnimationEffect {
  return (LINK_ANIMATION_EFFECTS as readonly string[]).includes(value);
}

export function normalizeLinkAnimationEffect(value: string | undefined): LinkAnimationEffect {
  if (value && isLinkAnimationEffect(value)) {
    return value;
  }
  return LINK_ANIMATION_EFFECT_DEFAULT;
}

export function normalizeLinkAnimationSpeed(speed: number | undefined): number {
  if (speed === undefined || !Number.isFinite(speed)) {
    return LINK_ANIMATION_SPEED_DEFAULT;
  }
  return Math.min(LINK_ANIMATION_SPEED_MAX, Math.max(LINK_ANIMATION_SPEED_MIN, speed));
}

/**
 * Cabos visíveis (já recortados pelo viewport) animam todos — o teto antigo deixava
 * linhas do meio do mapa sem o traço amarelo só porque vinham depois no array.
 */
export function linkFlowAnimationBudget(linkCount: number): number {
  return Math.max(0, linkCount);
}

/** Quantos pulsos cabem no cabo sem empilhar. */
export function linkFlowPulseCount(length: number): number {
  if (!Number.isFinite(length) || length <= 0) {
    return 0;
  }
  if (length < 40) {
    return 1;
  }
  if (length < 90) {
    return 2;
  }
  return 3;
}

export function flowDashPeriod(dasharray: string): number {
  const parts = dasharray.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!parts.length) {
    return 18;
  }
  return parts.reduce((sum, n) => sum + n, 0);
}

/** Passo por frame do tráfego amarelo no cabo (~9 px/s com speed 1). */
export function trafficFlowStep(speed: number): number {
  return normalizeLinkAnimationSpeed(speed) * 0.15;
}

/** Sem upload (ou idle): o pulso continua visível, só mais lento. */
export const LINK_FLOW_UPLOAD_MIN_FACTOR = 0.15;
/** Muita banda absoluta: o pulso corre no teto. */
export const LINK_FLOW_UPLOAD_MAX_FACTOR = 2.5;
/** Abaixo disto (Mbps) o passo fica no mínimo. */
export const LINK_FLOW_TX_MBPS_MIN = 0.1;
/** Acima disto (Mbps) o passo fica no máximo. */
export const LINK_FLOW_TX_MBPS_MAX = 10_000;

/** Utilização de upload 0–100 a partir do lastvalue (TX) ou da capacidade. */
export function resolveUploadUtilizationPct(args: {
  txBps?: number;
  txUtilizationPct?: number;
  capacityMbps?: number;
}): number | undefined {
  if (args.txUtilizationPct != null && Number.isFinite(args.txUtilizationPct)) {
    return args.txUtilizationPct;
  }
  if (
    args.txBps != null &&
    Number.isFinite(args.txBps) &&
    args.capacityMbps != null &&
    Number.isFinite(args.capacityMbps) &&
    args.capacityMbps > 0
  ) {
    return (args.txBps / (args.capacityMbps * 1_000_000)) * 100;
  }
  return undefined;
}

/** 0–1 pelo bps absoluto (log); senão pela utilização. */
export function resolveUploadFlowT(args: {
  txBps?: number;
  txUtilizationPct?: number;
  capacityMbps?: number;
}): number {
  if (args.txBps != null && Number.isFinite(args.txBps) && args.txBps > 0) {
    const mbps = args.txBps / 1_000_000;
    const lo = Math.log10(LINK_FLOW_TX_MBPS_MIN);
    const hi = Math.log10(LINK_FLOW_TX_MBPS_MAX);
    return Math.min(1, Math.max(0, (Math.log10(mbps) - lo) / (hi - lo)));
  }
  const util = resolveUploadUtilizationPct(args);
  if (util === undefined) {
    return 0;
  }
  return Math.min(1, Math.max(0, util / 100));
}

/**
 * Passo do traço amarelo conforme o upload da interface (bps absoluto, escala log).
 * 10 Mbps fica bem mais lento que 1 Gbps, mesmo com a mesma % da capacidade.
 * Gravado em `data-link-flow-step` via DOM — o React não grava este atributo.
 */
export function linkFlowSpeedFromUpload(args: {
  txBps?: number;
  txUtilizationPct?: number;
  capacityMbps?: number;
  baseSpeed: number;
}): number {
  const base = trafficFlowStep(args.baseSpeed);
  const t = resolveUploadFlowT(args);
  return (
    base *
    (LINK_FLOW_UPLOAD_MIN_FACTOR + t * (LINK_FLOW_UPLOAD_MAX_FACTOR - LINK_FLOW_UPLOAD_MIN_FACTOR))
  );
}

/** Três casas — evita regravar o atributo por ruído de float no poll. */
export function formatLinkFlowStep(step: number): string {
  return String(Math.round(step * 1000) / 1000);
}
