export const LINK_ANIMATION_SPEED_DEFAULT = 0.5;
export const LINK_ANIMATION_SPEED_MIN = 0.25;
export const LINK_ANIMATION_SPEED_MAX = 4;

export function normalizeLinkAnimationSpeed(speed: number | undefined): number {
  if (speed === undefined || !Number.isFinite(speed)) {
    return LINK_ANIMATION_SPEED_DEFAULT;
  }
  return Math.min(LINK_ANIMATION_SPEED_MAX, Math.max(LINK_ANIMATION_SPEED_MIN, speed));
}

/** Quantos cabos animam de uma vez — o restante fica só com a linha base. */
export function linkFlowAnimationBudget(linkCount: number): number {
  if (linkCount <= 24) {
    return linkCount;
  }
  if (linkCount <= 60) {
    return 32;
  }
  if (linkCount <= 120) {
    return 20;
  }
  return 12;
}

export function flowDashPeriod(dasharray: string): number {
  const parts = dasharray.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!parts.length) {
    return 18;
  }
  return parts.reduce((sum, n) => sum + n, 0);
}

/** Passo por frame do tráfego amarelo no cabo (~24 px/s com speed 1). */
export function trafficFlowStep(speed: number): number {
  return normalizeLinkAnimationSpeed(speed) * 0.4;
}
