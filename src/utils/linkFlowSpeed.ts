import { LinkRuntimeMetrics, TopologyLink } from '../types';
import {
  classifyUtilization,
  UtilizationLevel,
  UtilizationThresholds,
} from './zabbixAdapter/formatTraffic';

const BASE_FLOW_SPEED = 0.55;
const IDLE_FLOW_SPEED = 0.06;

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

/** Velocidade da animação de fluxo (px/frame) conforme tráfego e status. */
export function computeFlowSpeed(
  metrics: LinkRuntimeMetrics | undefined,
  thresholds: UtilizationThresholds
): number {
  if (!metrics) {
    return IDLE_FLOW_SPEED;
  }
  const oper = [metrics.from.operStatus, metrics.to.operStatus];
  if (oper.some((s) => s === 'down' || s === 'adminDown')) {
    return 0;
  }
  if (metrics.status === 'down') {
    return 0;
  }

  const util = maxLinkUtilization(metrics);
  const hasTraffic = [metrics.from.rxBps, metrics.from.txBps, metrics.to.rxBps, metrics.to.txBps].some(
    (v) => v !== undefined && v > 0
  );

  if (util === undefined) {
    return hasTraffic ? BASE_FLOW_SPEED * 0.35 : IDLE_FLOW_SPEED;
  }
  if (util <= 0) {
    return IDLE_FLOW_SPEED;
  }
  if (util < thresholds.attention) {
    return BASE_FLOW_SPEED * 0.35;
  }
  if (util < thresholds.high) {
    return BASE_FLOW_SPEED * 0.65;
  }
  if (util < thresholds.critical) {
    return BASE_FLOW_SPEED;
  }
  return BASE_FLOW_SPEED * 1.45;
}

export function isLinkCongested(
  metrics: LinkRuntimeMetrics | undefined,
  thresholds: UtilizationThresholds
): boolean {
  return resolveLinkUtilizationLevel(metrics, thresholds) === 'critical';
}

export function resolveFlowLaneSpeed(
  directionBps: number | undefined,
  metrics: LinkRuntimeMetrics | undefined,
  thresholds: UtilizationThresholds
): number {
  const base = computeFlowSpeed(metrics, thresholds);
  if (base <= 0) {
    return 0;
  }
  if (directionBps === undefined) {
    return base * 0.5;
  }
  if (directionBps <= 0) {
    return IDLE_FLOW_SPEED;
  }
  return base;
}

export function linkHasFlowMetrics(link: TopologyLink): boolean {
  return Boolean(link.fromInterface?.metrics || link.toInterface?.metrics);
}
