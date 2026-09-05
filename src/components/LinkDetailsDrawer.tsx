import React, { useMemo } from 'react';
import { useTheme2 } from '@grafana/ui';
import { LinkRuntimeMetrics, TopologyLink, TopologyMap, TopologyPanelOptions } from '../types';
import { findNodeById } from '../utils/topologyNodes';
import { formatLinkBandwidth } from '../utils/linkBandwidth';
import {
  formatBitsPerSecond,
  formatEndpointTrafficPair,
  formatSignalDbm,
  linkStatusLabel,
  operStatusLabel,
} from '../utils/zabbixAdapter/formatTraffic';
import { resolvePanelColor } from '../utils/panelColors';
import { resolveLinkUtilizationLevel } from '../utils/linkFlowSpeed';
import { linkRuntimeColor, utilizationThresholdsFromOptions } from '../utils/linkMetricsRuntime';
import { useLinkMetricsLiveStore } from '../hooks/linkMetricsLiveStore';
import { linkKey } from '../utils/mapLinkEdits';
import { overlayCardBodyStyle,
  overlayCardFooterStyle,
  overlayCardBarStyle,
  overlayCardStyle,
  overlayMetricLabelStyle,
  overlayMetricRowStyle,
  overlayMetricValueStyle,
  overlayMutedStyle,
} from './chrome/overlayChrome';
import styles from './LinkDetailsDrawer.module.scss';

interface Props {
  link: TopologyLink;
  storedMap: TopologyMap;
  options: TopologyPanelOptions;
  onClose: () => void;
  onEdit?: () => void;
}

function nodeLabel(nodes: TopologyMap['nodes'], id: string): string {
  const node = findNodeById(nodes, id);
  return node?.label?.trim() || node?.id || id;
}

function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={overlayMetricRowStyle}>
      <span className={overlayMetricLabelStyle}>{label}</span>
      <span className={overlayMetricValueStyle}>{value}</span>
    </div>
  );
}

function maxUtilizationPct(metrics?: LinkRuntimeMetrics): string {
  if (!metrics) {
    return 'N/A';
  }
  const pct = Math.max(
    metrics.from.rxUtilizationPct ?? 0,
    metrics.from.txUtilizationPct ?? 0,
    metrics.to.rxUtilizationPct ?? 0,
    metrics.to.txUtilizationPct ?? 0
  );
  return `${pct}%`;
}

function EndpointBlock({
  title,
  ifaceName,
  metrics,
  role,
}: {
  title: string;
  ifaceName?: string;
  metrics?: LinkRuntimeMetrics['from'];
  role: 'from' | 'to';
}) {
  const rx = formatBitsPerSecond(metrics?.rxBps) ?? 'N/A';
  const tx = formatBitsPerSecond(metrics?.txBps) ?? 'N/A';
  const rxUtil = metrics?.rxUtilizationPct !== undefined ? `${metrics.rxUtilizationPct}%` : 'N/A';
  const txUtil = metrics?.txUtilizationPct !== undefined ? `${metrics.txUtilizationPct}%` : 'N/A';
  const traffic = formatEndpointTrafficPair(rx, tx, role);
  const util = formatEndpointTrafficPair(rxUtil, txUtil, role);
  const errors = metrics?.errors !== undefined ? String(Math.round(metrics.errors)) : 'N/A';
  const drops = metrics?.drops !== undefined ? String(Math.round(metrics.drops)) : 'N/A';
  const rxSignal = formatSignalDbm(metrics?.rxPowerDbm) ?? 'N/A';
  const txSignal = formatSignalDbm(metrics?.txPowerDbm) ?? 'N/A';
  const signal = formatEndpointTrafficPair(rxSignal, txSignal, role, {
    from: 'Sinal TX / RX',
    to: 'Sinal RX / TX',
  });

  return (
    <div>
      <div className={styles.sectionTitle}>
        {title}
        {ifaceName ? <span className={overlayMutedStyle}> · {ifaceName}</span> : null}
      </div>
      <MetricRow label={traffic.label} value={traffic.value} />
      <MetricRow label={`Util. ${util.label}`} value={util.value} />
      <MetricRow label="Status oper." value={operStatusLabel(metrics?.operStatus)} />
      <MetricRow label="Erros / Drops" value={`${errors} / ${drops}`} />
      <MetricRow label={signal.label} value={signal.value} />
    </div>
  );
}

export function LinkDetailsDrawer({
  link,
  storedMap,
  options,
  onClose,
  onEdit,
}: Props) {
  const theme = useTheme2();
  const linkMetricsStore = useLinkMetricsLiveStore();
  const runtimeMetrics = linkMetricsStore.getLive()[linkKey(link)];
  const fromLabel = useMemo(() => {
    const base = nodeLabel(storedMap.nodes, link.from);
    const peer = link.fromPeerHost?.label?.trim() || link.fromPeerHost?.zabbixHost?.trim();
    return peer ? `${base} · ${peer}` : base;
  }, [link.from, link.fromPeerHost, storedMap.nodes]);
  const toLabel = useMemo(() => {
    const base = nodeLabel(storedMap.nodes, link.to);
    const peer = link.toPeerHost?.label?.trim() || link.toPeerHost?.zabbixHost?.trim();
    return peer ? `${base} · ${peer}` : base;
  }, [link.to, link.toPeerHost, storedMap.nodes]);
  const ifaceSummary =
    link.fromInterface?.name && link.toInterface?.name
      ? `${link.fromInterface.name} ↔ ${link.toInterface.name}`
      : 'Não associadas';
  const statusColor = resolvePanelColor(
    theme,
    linkRuntimeColor(
      options,
      runtimeMetrics,
      resolveLinkUtilizationLevel(runtimeMetrics, utilizationThresholdsFromOptions(options))
    )
  );

  return (
    <div role="dialog" aria-label="Detalhes do link" className={`${overlayCardStyle} ${styles.drawer}`}>
      <div className={`${overlayCardBarStyle} ${styles.bar}`}>
        <button type="button" aria-label="Fechar detalhes do link" onClick={onClose} className={styles.close}>
          ×
        </button>
        <div className={styles.titleBlock}>
          <div className={styles.title}>{fromLabel}</div>
          <div className={`${overlayMutedStyle} ${styles.arrow}`}>
            ↕
          </div>
          <div className={styles.title}>{toLabel}</div>
          <div className={styles.status} style={{ color: statusColor }}>{linkStatusLabel(runtimeMetrics?.status)}</div>
        </div>
      </div>

      <div className={`${overlayCardBodyStyle} ${styles.body}`}>
        <MetricRow label="Capacidade" value={formatLinkBandwidth(link.bandwidthMbps) ?? 'N/A'} />
        <MetricRow label="Interfaces" value={ifaceSummary} />
        <MetricRow label="Utilização máx." value={maxUtilizationPct(runtimeMetrics)} />

        {!link.fromInterface && !link.toInterface ? (
          <div className={`${overlayMutedStyle} ${styles.hint}`}>
            Este link ainda não possui interfaces associadas. Use &quot;Editar link&quot; para vincular.
          </div>
        ) : null}

        <div className={styles.divider} />

        <EndpointBlock title="Origem" ifaceName={link.fromInterface?.name} metrics={runtimeMetrics?.from} role="from" />
        <EndpointBlock title="Destino" ifaceName={link.toInterface?.name} metrics={runtimeMetrics?.to} role="to" />
      </div>

      {onEdit ? (
        <div className={overlayCardFooterStyle}>
          <button type="button" onClick={onEdit} className={styles.edit}>
            Editar link…
          </button>
        </div>
      ) : null}
    </div>
  );
}
