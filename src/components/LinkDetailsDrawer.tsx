import React, { useMemo, useState } from 'react';
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

type DetailsTab = 'overview' | 'traffic' | 'interface';

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

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, lineHeight: 1.6 }}>
      <span style={{ opacity: 0.75 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
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
  const capacity = formatLinkBandwidth(metrics?.capacityMbps);
  const rx = formatBitsPerSecond(metrics?.rxBps);
  const tx = formatBitsPerSecond(metrics?.txBps);
  const rxUtil = metrics?.rxUtilizationPct !== undefined ? `${metrics.rxUtilizationPct}%` : 'N/A';
  const txUtil = metrics?.txUtilizationPct !== undefined ? `${metrics.txUtilizationPct}%` : 'N/A';
  const errors = metrics?.errors !== undefined ? String(Math.round(metrics.errors)) : 'N/A';
  const drops = metrics?.drops !== undefined ? String(Math.round(metrics.drops)) : 'N/A';
  const updated = formatRelativeUpdate(metrics?.lastUpdateMs) ?? 'N/A';

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{title}</div>
      <MetricRow label="Interface" value={ifaceName ?? '—'} />
      <MetricRow label="Capacidade" value={capacity ?? 'N/A'} />
      <MetricRow label="RX" value={rx ?? 'N/A'} />
      <MetricRow label="TX" value={tx ?? 'N/A'} />
      <MetricRow label="Util. RX" value={rxUtil} />
      <MetricRow label="Util. TX" value={txUtil} />
      <MetricRow label="Status oper." value={operStatusLabel(metrics?.operStatus)} />
      <MetricRow label="Erros" value={errors} />
      <MetricRow label="Drops" value={drops} />
      <MetricRow label="Última atualização" value={updated} />
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
  const [tab, setTab] = useState<DetailsTab>('overview');
  const fromLabel = useMemo(() => nodeLabel(storedMap.nodes, link.from), [storedMap.nodes, link.from]);
  const toLabel = useMemo(() => nodeLabel(storedMap.nodes, link.to), [storedMap.nodes, link.to]);
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

  const tabs: Array<{ id: DetailsTab; label: string }> = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'traffic', label: 'Tráfego' },
    { id: 'interface', label: 'Interface' },
  ];

  return (
    <div
      role="dialog"
      aria-label="Detalhes do link"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 320,
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
          padding: '12px 14px',
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
        <div style={{ fontSize: 14, fontWeight: 600 }}>{fromLabel}</div>
        <div style={{ fontSize: 11, opacity: 0.7, margin: '2px 0' }}>↕</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{toLabel}</div>
        <div style={{ fontSize: 11, marginTop: 6, color: statusColor }}>
          {linkStatusLabel(runtimeMetrics?.status)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '8px 10px', borderBottom: `1px solid ${theme.colors.border.weak}` }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: 4,
              padding: '6px 4px',
              fontSize: 11,
              cursor: 'pointer',
              background: tab === t.id ? theme.colors.action.selected : 'transparent',
              color: theme.colors.text.primary,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {tab === 'overview' && (
          <>
            <MetricRow label="Capacidade" value={formatLinkBandwidth(link.bandwidthMbps) ?? 'N/A'} />
            <MetricRow
              label="Interfaces"
              value={
                link.fromInterface?.name && link.toInterface?.name
                  ? `${link.fromInterface.name} ↔ ${link.toInterface.name}`
                  : 'Não associadas'
              }
            />
            <MetricRow label="TX (origem)" value={formatBitsPerSecond(runtimeMetrics?.from.txBps) ?? 'N/A'} />
            <MetricRow label="RX (origem)" value={formatBitsPerSecond(runtimeMetrics?.from.rxBps) ?? 'N/A'} />
            <MetricRow
              label="Utilização máx."
              value={
                runtimeMetrics
                  ? `${Math.max(
                      runtimeMetrics.from.rxUtilizationPct ?? 0,
                      runtimeMetrics.from.txUtilizationPct ?? 0,
                      runtimeMetrics.to.rxUtilizationPct ?? 0,
                      runtimeMetrics.to.txUtilizationPct ?? 0
                    )}%`
                  : 'N/A'
              }
            />
          </>
        )}
        {tab === 'traffic' && (
          <>
            <EndpointBlock title="Origem" ifaceName={link.fromInterface?.name} metrics={runtimeMetrics?.from} />
            <EndpointBlock title="Destino" ifaceName={link.toInterface?.name} metrics={runtimeMetrics?.to} />
          </>
        )}
        {tab === 'interface' && (
          <>
            <EndpointBlock title="Origem" ifaceName={link.fromInterface?.name} metrics={runtimeMetrics?.from} />
            <EndpointBlock title="Destino" ifaceName={link.toInterface?.name} metrics={runtimeMetrics?.to} />
            {!link.fromInterface && !link.toInterface ? (
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Este link ainda não possui interfaces associadas. Use &quot;Editar link&quot; para vincular.
              </div>
            ) : null}
          </>
        )}
      </div>

      {onEdit ? (
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${theme.colors.border.weak}` }}>
          <button
            type="button"
            onClick={onEdit}
            style={{
              width: '100%',
              border: `1px solid ${theme.colors.border.weak}`,
              borderRadius: 4,
              padding: '8px 10px',
              background: theme.colors.action.hover,
              color: theme.colors.text.primary,
              cursor: 'pointer',
              fontSize: 12,
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
