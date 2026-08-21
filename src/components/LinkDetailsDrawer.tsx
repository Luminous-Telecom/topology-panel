import React, { useEffect, useMemo, useState } from 'react';
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
  formatRelativeUpdate,
  linkStatusLabel,
  operStatusLabel,
} from '../utils/zabbixAdapter/formatTraffic';
import { resolvePanelColor } from '../utils/panelColors';

interface Props {
  link: TopologyLink;
  storedMap: TopologyMap;
  options: TopologyPanelOptions;
  runtimeMetrics?: LinkRuntimeMetrics;
  /** Última busca boa de tráfego — o lastclock do item pode ficar parado no Zabbix. */
  fetchedAtMs?: number;
  onClose: () => void;
  onEdit?: () => void;
}

function nodeLabel(nodes: TopologyMap['nodes'], id: string): string {
  const node = findNodeById(nodes, id);
  return node?.label?.trim() || node?.id || id;
}

function RelativeUpdate({ ms }: { ms: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <>{formatRelativeUpdate(ms) ?? 'N/A'}</>;
}

function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, lineHeight: 1.5 }}>
      <span style={{ opacity: 0.75 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
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
}: {
  title: string;
  ifaceName?: string;
  metrics?: LinkRuntimeMetrics['from'];
}) {
  const rx = formatBitsPerSecond(metrics?.rxBps);
  const tx = formatBitsPerSecond(metrics?.txBps);
  const rxUtil = metrics?.rxUtilizationPct !== undefined ? `${metrics.rxUtilizationPct}%` : 'N/A';
  const txUtil = metrics?.txUtilizationPct !== undefined ? `${metrics.txUtilizationPct}%` : 'N/A';
  const errors = metrics?.errors !== undefined ? String(Math.round(metrics.errors)) : 'N/A';
  const drops = metrics?.drops !== undefined ? String(Math.round(metrics.drops)) : 'N/A';

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4 }}>
        {title}
        {ifaceName ? <span style={{ fontWeight: 400, opacity: 0.75 }}> · {ifaceName}</span> : null}
      </div>
      <MetricRow label="RX / TX" value={`${rx ?? 'N/A'} / ${tx ?? 'N/A'}`} />
      <MetricRow label="Util. RX / TX" value={`${rxUtil} / ${txUtil}`} />
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
  fetchedAtMs,
  onClose,
  onEdit,
}: Props) {
  const theme = useTheme2();
  const fromLabel = useMemo(() => nodeLabel(storedMap.nodes, link.from), [storedMap.nodes, link.from]);
  const toLabel = useMemo(() => nodeLabel(storedMap.nodes, link.to), [storedMap.nodes, link.to]);
  const ifaceSummary =
    link.fromInterface?.name && link.toInterface?.name
      ? `${link.fromInterface.name} ↔ ${link.toInterface.name}`
      : 'Não associadas';
  const statusColor = resolvePanelColor(
    theme,
    runtimeMetrics?.status === 'down'
      ? options.colorOffline
      : runtimeMetrics?.status === 'highUtilization'
        ? options.colorLinkCongestion
        : runtimeMetrics?.status === 'degraded'
          ? options.colorAlert
          : options.colorOnline
  );

  return (
    <div
      role="dialog"
      aria-label="Detalhes do link"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 272,
        maxWidth: '92vw',
        background: theme.colors.background.primary,
        borderLeft: `1px solid ${theme.colors.border.weak}`,
        boxShadow: theme.shadows.z3,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          paddingRight: 76,
          borderBottom: `1px solid ${theme.colors.border.weak}`,
          position: 'relative',
        }}
      >
        <button
          type="button"
          aria-label="Fechar detalhes do link"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 4,
            right: 48,
            border: 'none',
            background: 'transparent',
            color: theme.colors.text.secondary,
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '4px 6px',
            borderRadius: 4,
            zIndex: 1,
          }}
        >
          ×
        </button>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{fromLabel}</div>
        <div style={{ fontSize: 10, opacity: 0.7, margin: '1px 0' }}>↕</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{toLabel}</div>
        <div style={{ fontSize: 10, marginTop: 4, color: statusColor }}>
          {linkStatusLabel(runtimeMetrics?.status)}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        <MetricRow label="Capacidade" value={formatLinkBandwidth(link.bandwidthMbps) ?? 'N/A'} />
        <MetricRow label="Interfaces" value={ifaceSummary} />
        <MetricRow label="Utilização máx." value={maxUtilizationPct(runtimeMetrics)} />

        {!link.fromInterface && !link.toInterface ? (
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 8 }}>
            Este link ainda não possui interfaces associadas. Use &quot;Editar link&quot; para vincular.
          </div>
        ) : null}

        <div
          style={{
            margin: '10px 0 8px',
            borderTop: `1px solid ${theme.colors.border.weak}`,
          }}
        />

        <EndpointBlock title="Origem" ifaceName={link.fromInterface?.name} metrics={runtimeMetrics?.from} />
        <EndpointBlock title="Destino" ifaceName={link.toInterface?.name} metrics={runtimeMetrics?.to} />

        {fetchedAtMs !== undefined ? (
          <MetricRow label="Atualizado" value={<RelativeUpdate ms={fetchedAtMs} />} />
        ) : null}
      </div>

      {onEdit ? (
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${theme.colors.border.weak}` }}>
          <button
            type="button"
            onClick={onEdit}
            style={{
              width: '100%',
              border: `1px solid ${theme.colors.border.weak}`,
              borderRadius: 4,
              padding: '7px 10px',
              background: theme.colors.action.hover,
              color: theme.colors.text.primary,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
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
