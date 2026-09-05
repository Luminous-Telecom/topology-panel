import { LinkRuntimeMetrics, TopologyLink } from '../types';
import { formatLinkFlowStep, linkFlowSpeedFromUpload } from './linkAnimationStyle';
import { resolveLinkMapTrafficMetrics } from './linkMetricsRuntime';
import { formatBitsPerSecond } from './zabbixAdapter/formatTraffic';

const PILL_PAD_X = 10;
const PILL_CHAR_W = 6.45;
const PILL_LINE_H = 14;
const PILL_PAD_Y = 5;

function isPillGroup(el: Element | null): el is SVGGElement {
  return Boolean(el && el.namespaceURI === 'http://www.w3.org/2000/svg' && el.localName === 'g');
}

function pillLineWidth(value: string): number {
  return (value.length + 2) * PILL_CHAR_W + PILL_PAD_X * 2;
}

export function trafficPillLabels(
  link: TopologyLink,
  metrics?: LinkRuntimeMetrics
): { txLabel?: string; rxLabel?: string } {
  const display = resolveLinkMapTrafficMetrics(link, metrics);
  return {
    txLabel: formatBitsPerSecond(display.txBps),
    rxLabel: formatBitsPerSecond(display.rxBps),
  };
}

function layoutPillGroup(group: SVGGElement, txLabel?: string, rxLabel?: string): void {
  const rect = group.querySelector('rect');
  const txText = group.querySelector('[data-link-pill-tx]') as SVGTextElement | null;
  const rxText = group.querySelector('[data-link-pill-rx]') as SVGTextElement | null;
  const both = Boolean(txLabel && rxLabel);
  const txWidth = txLabel ? pillLineWidth(txLabel) : 0;
  const rxWidth = rxLabel ? pillLineWidth(rxLabel) : 0;
  const width = Math.max(txWidth, rxWidth);
  const rows = (txLabel ? 1 : 0) + (rxLabel ? 1 : 0);
  const height = rows * PILL_LINE_H + PILL_PAD_Y * 2;
  let txY = 0;
  let rxY = 0;
  if (both) {
    txY = -PILL_LINE_H / 2;
    rxY = PILL_LINE_H / 2;
  }
  if (rect) {
    rect.setAttribute('x', String(-width / 2));
    rect.setAttribute('y', String(-height / 2));
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
  }
  if (txText) {
    txText.setAttribute('y', String(txY));
    txText.style.display = txLabel ? '' : 'none';
  }
  if (rxText) {
    rxText.setAttribute('y', String(rxY));
    rxText.style.display = rxLabel ? '' : 'none';
  }
}

function setRowValue(textEl: SVGTextElement | null, valueSelector: string, value: string | undefined): void {
  if (!textEl) {
    return;
  }
  const node = textEl.querySelector(valueSelector);
  if (node) {
    node.textContent = value ? ` ${value}` : '';
  }
}

/** Atualiza texto e caixa da pílula sem passar pelo React. */
export function syncTrafficPillGroup(
  group: SVGGElement,
  txLabel: string | undefined,
  rxLabel: string | undefined
): boolean {
  const prevTx = group.getAttribute('data-sync-tx') ?? '';
  const prevRx = group.getAttribute('data-sync-rx') ?? '';
  const nextTx = txLabel ?? '';
  const nextRx = rxLabel ?? '';
  if (!nextTx && !nextRx) {
    group.style.display = 'none';
    group.setAttribute('data-sync-tx', '');
    group.setAttribute('data-sync-rx', '');
    return prevTx !== '' || prevRx !== '';
  }
  group.style.display = '';
  if (prevTx === nextTx && prevRx === nextRx) {
    return false;
  }
  group.setAttribute('data-sync-tx', nextTx);
  group.setAttribute('data-sync-rx', nextRx);
  const txText = group.querySelector('[data-link-pill-tx]') as SVGTextElement | null;
  const rxText = group.querySelector('[data-link-pill-rx]') as SVGTextElement | null;
  setRowValue(txText, '[data-link-pill-tx-value]', txLabel);
  setRowValue(rxText, '[data-link-pill-rx-value]', rxLabel);
  layoutPillGroup(group, txLabel, rxLabel);
  return true;
}

/**
 * Atualiza o passo do traço amarelo pelo upload, sem o React gravar speed no path
 * (isso zerava o deslocamento no Chrome).
 */
export function syncLinkFlowStepsInRoot(
  root: ParentNode,
  linksByKey: Map<string, { link: TopologyLink; metrics?: LinkRuntimeMetrics }>,
  baseSpeed: number
): number {
  let updated = 0;
  const nodes = root.querySelectorAll('[data-link-flow][data-link-key]');
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes.item(i);
    const key = el.getAttribute('data-link-key');
    if (!key) {
      continue;
    }
    const entry = linksByKey.get(key);
    if (!entry) {
      continue;
    }
    const display = resolveLinkMapTrafficMetrics(entry.link, entry.metrics);
    const next = formatLinkFlowStep(
      linkFlowSpeedFromUpload({
        txBps: display.txBps,
        txUtilizationPct: display.txUtilizationPct,
        capacityMbps: display.capacityMbps,
        baseSpeed,
      })
    );
    if (el.getAttribute('data-link-flow-step') !== next) {
      el.setAttribute('data-link-flow-step', next);
      updated += 1;
    }
  }
  return updated;
}

export function syncTrafficPillsInRoot(
  root: ParentNode,
  linksByPillId: Map<string, { link: TopologyLink; metrics?: LinkRuntimeMetrics }>
): number {
  let updated = 0;
  const nodes = root.querySelectorAll('[data-link-pill]');
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes.item(i);
    if (!isPillGroup(el)) {
      continue;
    }
    const pillId = el.getAttribute('data-link-pill');
    if (!pillId) {
      continue;
    }
    const entry = linksByPillId.get(pillId);
    if (!entry) {
      continue;
    }
    const { txLabel, rxLabel } = trafficPillLabels(entry.link, entry.metrics);
    if (syncTrafficPillGroup(el, txLabel, rxLabel)) {
      updated += 1;
    }
  }
  return updated;
}
