import { LinkRuntimeMetrics, TopologyLink } from '../types';
import {
  classifyUtilization,
  UtilizationLevel,
  UtilizationThresholds,
} from './zabbixAdapter/formatTraffic';

/**
 * Velocidade em px/frame (~60 fps): a seta de fluxo atravessa o cabo, então a escala é contínua —
 * 0,22 px/frame ≈ 13 px/s no cabo quase vazio, 2,4 px/frame ≈ 145 px/s no cabo saturado.
 */
const IDLE_FLOW_SPEED = 0.08;
const MIN_ACTIVE_FLOW_SPEED = 0.22;
const MAX_FLOW_SPEED = 2.4;
/** Referência de carga quando o link não tem capacidade configurada: 10 Gbps. */
const THROUGHPUT_REFERENCE_MBPS = 10_000;
/**
 * Expoente da curva de carga. Abaixo de 1 para o cabo pouco carregado já andar de forma visível,
 * mas alto o bastante para a diferença entre os sentidos aparecer: 6x de tráfego ≈ 2,4x de
 * velocidade. Escala log deixava esses mesmos 6x em 1,2x, indistinguível a olho.
 */
const LOAD_CURVE_EXPONENT = 0.6;

/** Carga do sentido (0 a 1) → velocidade. */
function speedFromLoad(load: number): number {
  const ratio = Math.min(1, Math.max(0, load)) ** LOAD_CURVE_EXPONENT;
  return MIN_ACTIVE_FLOW_SPEED + (MAX_FLOW_SPEED - MIN_ACTIVE_FLOW_SPEED) * ratio;
}

/** Utilização (%) → velocidade. */
function speedFromUtilization(utilizationPct: number): number {
  return speedFromLoad(utilizationPct / 100);
}

/** Sem capacidade configurada, a carga sai da vazão absoluta contra a referência de 10 Gbps. */
function speedFromThroughput(bps: number): number {
  const mbps = bps / 1_000_000;
  if (mbps <= 0) {
    return IDLE_FLOW_SPEED;
  }
  return speedFromLoad(mbps / THROUGHPUT_REFERENCE_MBPS);
}

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
    return hasTraffic ? MIN_ACTIVE_FLOW_SPEED : IDLE_FLOW_SPEED;
  }
  if (util <= 0) {
    return IDLE_FLOW_SPEED;
  }
  if (util >= thresholds.critical) {
    return MAX_FLOW_SPEED;
  }
  return speedFromUtilization(util);
}

export function isLinkCongested(
  metrics: LinkRuntimeMetrics | undefined,
  thresholds: UtilizationThresholds
): boolean {
  return resolveLinkUtilizationLevel(metrics, thresholds) === 'critical';
}

/**
 * Velocidade de **um** sentido do cabo. Usa a utilização daquele sentido — não a maior do link —
 * para TX e RX andarem diferente quando o tráfego é assimétrico.
 */
export function resolveFlowLaneSpeed(
  directionBps: number | undefined,
  directionUtilizationPct: number | undefined,
  metrics: LinkRuntimeMetrics | undefined,
  thresholds: UtilizationThresholds
): number {
  if (computeFlowSpeed(metrics, thresholds) <= 0) {
    return 0;
  }
  if (directionBps !== undefined && directionBps <= 0) {
    return IDLE_FLOW_SPEED;
  }
  if (directionUtilizationPct !== undefined && Number.isFinite(directionUtilizationPct)) {
    if (directionUtilizationPct <= 0) {
      return IDLE_FLOW_SPEED;
    }
    if (directionUtilizationPct >= thresholds.critical) {
      return MAX_FLOW_SPEED;
    }
    return speedFromUtilization(directionUtilizationPct);
  }
  if (directionBps !== undefined) {
    return speedFromThroughput(directionBps);
  }
  return computeFlowSpeed(metrics, thresholds) * 0.6;
}

export function linkHasFlowMetrics(link: TopologyLink): boolean {
  return Boolean(link.fromInterface?.metrics || link.toInterface?.metrics);
}
