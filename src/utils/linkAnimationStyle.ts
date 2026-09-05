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

/** Passo por frame em px do mapa (~24 px/s com speed 1). Igual em todo cabo. */
export function trafficFlowStep(speed: number): number {
  return normalizeLinkAnimationSpeed(speed) * 0.4;
}

/** Três casas — evita regravar o atributo por ruído de float no poll. */
export function formatLinkFlowStep(step: number): string {
  return String(Math.round(step * 1000) / 1000);
}
