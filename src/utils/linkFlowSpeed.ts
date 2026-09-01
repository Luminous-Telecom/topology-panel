import { LinkRuntimeMetrics } from '../types';
import {
  classifyUtilization,
  UtilizationLevel,
  UtilizationThresholds,
} from './zabbixAdapter/formatTraffic';

/** Maior utilização RX/TX entre os endpoints do link. */
export function maxLinkUtilization(metrics?: LinkRuntimeMetrics): number | undefined {
  if (!metrics) {
    return undefined;
  }
  const values = [
    metrics.from.rxUtilizationPct,
    metrics.from.txUtilizationPct,
    metrics.to.rxUtilizationPct,
    metrics.to.txUtilizationPct,
  ].filter((v): v is number => v !== undefined && Number.isFinite(v));
  if (!values.length) {
    return undefined;
  }
  return Math.max(...values);
}

/** Nível de degradação visual a partir da maior utilização RX/TX do link. */
export function resolveLinkUtilizationLevel(
  metrics: LinkRuntimeMetrics | undefined,
  thresholds: UtilizationThresholds
): UtilizationLevel {
  return classifyUtilization(maxLinkUtilization(metrics), thresholds) ?? 'normal';
}

export function isLinkCongested(
  metrics: LinkRuntimeMetrics | undefined,
  thresholds: UtilizationThresholds
): boolean {
  return resolveLinkUtilizationLevel(metrics, thresholds) === 'critical';
}
