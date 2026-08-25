import React, { useMemo } from 'react';
import { css } from '@emotion/css';
import { useTheme2 } from '@grafana/ui';
import {
  LinkRuntimeMetrics,
  TopologyLink,
  TopologyMap,
  TopologyPanelOptions,
} from '../types';
import { findNodeById } from '../utils/topologyNodes';
import { formatLinkBandwidth } from '../utils/linkBandwidth';
import { linkKey } from '../utils/mapLinkEdits';
import {
  formatBitsPerSecond,
  formatEndpointTrafficPair,
  linkStatusLabel,
  operStatusLabel,
} from '../utils/zabbixAdapter/formatTraffic';
import { resolvePanelColor } from '../utils/panelColors';
import { resolveLinkUtilizationLevel } from '../utils/linkFlowSpeed';
import { linkRuntimeColor, utilizationThresholdsFromOptions } from '../utils/linkMetricsRuntime';
import { CANVAS_EDGE_GAP, MEDIA_COMPACT } from '../utils/canvasOverlayLayout';
import {
  overlayCardBodyStyle,
  overlayCardFooterStyle,
  overlayCardBarStyle,
  overlayCardStyle,
  overlayMetricLabelStyle,
  overlayMetricRowStyle,
  overlayMetricValueStyle,
  overlayMutedStyle,
} from './overlayChrome';

const drawerStyle = css`
  position: absolute;
  top: 52px;
  right: ${CANVAS_EDGE_GAP}px;
  z-index: 30;
  width: 280px;
  max-width: calc(100% - ${CANVAS_EDGE_GAP * 2}px);
  max-height: calc(100% - 60px);
  display: flex;
  flex-direction: column;

  ${MEDIA_COMPACT} {
    top: 96px;
    max-height: calc(100% - 104px);
  }
`;

const closeButtonStyle = css`
  position: absolute;
  top: 4px;
  right: 4px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 4px;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
`;

const titleBlockStyle = css`
  padding-right: 28px;
`;

const editButtonStyle = css`
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 6px;
  padding: 7px 10px;
  background: rgba(255, 255, 255, 0.08);
  color: #f2f4f7;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;

  &:hover {
    background: rgba(79, 195, 247, 0.18);
  }
`;

const sectionTitleStyle = css`
  font-weight: 600;
  font-size: 11px;
  margin: 10px 0 4px;
`;

const dividerStyle = css`
  margin: 10px 0 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
`;

interface Props {
  link: TopologyLink;
  storedMap: TopologyMap;
  options: TopologyPanelOptions;
  runtimeMetrics?: LinkRuntimeMetrics;
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

  return (
    <div>
      <div className={sectionTitleStyle}>
        {title}
        {ifaceName ? <span className={overlayMutedStyle}> · {ifaceName}</span> : null}
      </div>
      <MetricRow label={traffic.label} value={traffic.value} />
      <MetricRow label={`Util. ${util.label}`} value={util.value} />
      <MetricRow label="Status oper." value={operStatusLabel(metrics?.operStatus)} />
      <MetricRow label="Erros / Drops" value={`${errors} / ${drops}`} />
    </div>
  );
}

export function LinkDetailsDrawer({
  link,
  storedMap,
  options,
  runtimeMetrics,
  onClose,
  onEdit,
}: Props) {
  const theme = useTheme2();
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
    <div role="dialog" aria-label="Detalhes do link" className={`${overlayCardStyle} ${drawerStyle}`}>
      <div className={overlayCardBarStyle} style={{ position: 'relative' }}>
        <button type="button" aria-label="Fechar detalhes do link" onClick={onClose} className={closeButtonStyle}>
          ×
        </button>
        <div className={titleBlockStyle}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fromLabel}</div>
          <div className={overlayMutedStyle} style={{ margin: '1px 0' }}>
            ↕
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{toLabel}</div>
          <div style={{ fontSize: 10, marginTop: 4, color: statusColor }}>{linkStatusLabel(runtimeMetrics?.status)}</div>
        </div>
      </div>

      <div className={overlayCardBodyStyle} style={{ flex: 1, overflowY: 'auto' }}>
        <MetricRow label="Capacidade" value={formatLinkBandwidth(link.bandwidthMbps) ?? 'N/A'} />
        <MetricRow label="Interfaces" value={ifaceSummary} />
        <MetricRow label="Utilização máx." value={maxUtilizationPct(runtimeMetrics)} />

        {!link.fromInterface && !link.toInterface ? (
          <div className={overlayMutedStyle} style={{ marginTop: 8 }}>
            Este link ainda não possui interfaces associadas. Use &quot;Editar link&quot; para vincular.
          </div>
        ) : null}

        <div className={dividerStyle} />

        <EndpointBlock title="Origem" ifaceName={link.fromInterface?.name} metrics={runtimeMetrics?.from} role="from" />
        <EndpointBlock title="Destino" ifaceName={link.toInterface?.name} metrics={runtimeMetrics?.to} role="to" />
      </div>

      {onEdit ? (
        <div className={overlayCardFooterStyle}>
          <button type="button" onClick={onEdit} className={editButtonStyle}>
            Editar link…
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function resolveLinkDetailsMetrics(
  link: TopologyLink,
  metricsByLink: Record<string, LinkRuntimeMetrics>
): LinkRuntimeMetrics | undefined {
  return metricsByLink[linkKey(link)];
}
