import React, { useId, useMemo, useState } from 'react';
import { Button, Field, Input, Modal, Spinner, Stack } from '@grafana/ui';
import {
  TopologyInterfaceReference,
  TopologyNetworkInterface,
  TopologyNode,
} from '../types';
import { useZabbixHostInterfaces } from '../hooks/useZabbixHostInterfaces';
import { interfaceToReference, resolveLinkCapacityMbps } from '../utils/zabbixAdapter/bindInterfaceMetrics';
import { formatLinkBandwidth } from '../utils/linkBandwidth';
import { resolveHostLookupKey } from '../utils/hostLookup';
import { HostMetadataMap } from '../types';
import { FieldReadout } from './FieldReadout';

export interface PendingLinkEndpoints {
  from: string;
  to: string;
  fromNode: TopologyNode;
  toNode: TopologyNode;
}

interface Props {
  pending: PendingLinkEndpoints;
  hostMetadata?: HostMetadataMap;
  /** Datasource Zabbix do inventário de interfaces. */
  zabbixDatasourceUid?: string;
  zabbixRxItemKeyword?: string;
  zabbixTxItemKeyword?: string;
  onSave: (
    fromInterface: TopologyInterfaceReference | undefined,
    toInterface: TopologyInterfaceReference | undefined,
    bandwidthMbps?: number
  ) => void;
  onClose: () => void;
}

function filterInterfaces(
  interfaces: TopologyNetworkInterface[],
  query: string
): TopologyNetworkInterface[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return interfaces;
  }
  return interfaces.filter((iface) => {
    const haystack = [iface.name, iface.alias, iface.description, iface.mac, iface.ip, iface.snmpIndex]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

function operStatusLabel(status?: number): string | undefined {
  if (status === 1) {
    return 'UP';
  }
  if (status === 2) {
    return 'DOWN';
  }
  if (status === 3 || status === 4) {
    return 'ADM DOWN';
  }
  return undefined;
}

interface InterfaceListProps {
  uid: string;
  title: string;
  hostLabel: string;
  interfaces: TopologyNetworkInterface[];
  selected?: TopologyNetworkInterface;
  onSelect: (iface: TopologyNetworkInterface) => void;
  filter: string;
  loading: boolean;
}

function InterfaceList({
  uid,
  title,
  hostLabel,
  interfaces,
  selected,
  onSelect,
  filter,
  loading,
}: InterfaceListProps) {
  const filtered = useMemo(() => filterInterfaces(interfaces, filter), [interfaces, filter]);

  return (
    <Stack direction="column" gap={1}>
      <FieldReadout label={title}>
        <strong>{hostLabel}</strong>
      </FieldReadout>
      {loading ? (
        <Spinner inline />
      ) : filtered.length === 0 ? (
        <span style={{ opacity: 0.75, fontSize: 12 }}>Nenhuma interface encontrada</span>
      ) : (
        <div
          role="listbox"
          aria-label={`Interfaces de ${hostLabel}`}
          style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-weak)', borderRadius: 4 }}
        >
          {filtered.map((iface) => {
            const active = selected?.name === iface.name && selected?.snmpIndex === iface.snmpIndex;
            const speed = iface.speedMbps ? formatLinkBandwidth(iface.speedMbps) : undefined;
            const oper = operStatusLabel(iface.operStatus);
            const rxOk = iface.metrics.rx?.itemId ? '✓' : '—';
            const txOk = iface.metrics.tx?.itemId ? '✓' : '—';
            return (
              <button
                key={`${iface.name}-${iface.snmpIndex ?? ''}`}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelect(iface)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  borderBottom: '1px solid var(--border-weak)',
                  background: active ? 'var(--background-secondary)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{iface.name}</div>
                <div style={{ fontSize: 11, opacity: 0.85 }}>
                  {[iface.alias, speed, oper, iface.mac, iface.ip].filter(Boolean).join(' · ')}
                </div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>
                  RX {rxOk} · TX {txOk}
                  {iface.bindingConfidence === 'ambiguous' ? ' · ambíguo' : ''}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <span id={`${uid}-hint`} style={{ fontSize: 11, opacity: 0.7 }}>
        {interfaces.length} interface(s) monitorada(s)
      </span>
    </Stack>
  );
}

export function LinkInterfaceSelectModal({
  pending,
  hostMetadata,
  zabbixDatasourceUid,
  zabbixRxItemKeyword,
  zabbixTxItemKeyword,
  onSave,
  onClose,
}: Props) {
  const uid = useId();
  const [filter, setFilter] = useState('');
  const [fromIface, setFromIface] = useState<TopologyNetworkInterface | undefined>();
  const [toIface, setToIface] = useState<TopologyNetworkInterface | undefined>();

  const fromHostKey = resolveHostLookupKey(pending.fromNode, hostMetadata);
  const toHostKey = resolveHostLookupKey(pending.toNode, hostMetadata);
  const hostKeys = useMemo(
    () => [fromHostKey, toHostKey].filter((k): k is string => Boolean(k)),
    [fromHostKey, toHostKey]
  );

  const { interfacesByHost, loading, loadError } = useZabbixHostInterfaces(
    hostKeys,
    zabbixDatasourceUid,
    {
      rxKeyword: zabbixRxItemKeyword,
      txKeyword: zabbixTxItemKeyword,
    }
  );

  const fromInterfaces = fromHostKey ? interfacesByHost[fromHostKey] ?? [] : [];
  const toInterfaces = toHostKey ? interfacesByHost[toHostKey] ?? [] : [];

  const previewCapacity = resolveLinkCapacityMbps(fromIface, toIface);
  const monitorsTraffic = Boolean(fromIface?.metrics.rx?.itemId || fromIface?.metrics.tx?.itemId
    || toIface?.metrics.rx?.itemId || toIface?.metrics.tx?.itemId);

  const commitLink = () => {
    onSave(
      fromIface ? interfaceToReference(fromIface) : undefined,
      toIface ? interfaceToReference(toIface) : undefined,
      previewCapacity
    );
    onClose();
  };

  return (
    <Modal title="Novo link" isOpen onDismiss={onClose}>
      {loadError && (
        <div style={{ color: 'var(--error-text)', marginBottom: 8, fontSize: 12 }}>{loadError}</div>
      )}
      <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.45, opacity: 0.85 }}>
        Interfaces opcionais. Sem seleção, o link aparece no mapa mas não monitora tráfego RX/TX.
      </p>
      <Field label="Buscar interface (opcional)">
        <Input
          id={`${uid}-filter`}
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
          placeholder="Nome, alias, MAC, IP…"
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <InterfaceList
          uid={`${uid}-from`}
          title="Origem"
          hostLabel={pending.fromNode.label ?? pending.fromNode.id}
          interfaces={fromInterfaces}
          selected={fromIface}
          onSelect={setFromIface}
          filter={filter}
          loading={loading}
        />
        <InterfaceList
          uid={`${uid}-to`}
          title="Destino"
          hostLabel={pending.toNode.label ?? pending.toNode.id}
          interfaces={toInterfaces}
          selected={toIface}
          onSelect={setToIface}
          filter={filter}
          loading={loading}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <FieldReadout label="Pré-visualização">
          <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}>
            <div>{pending.fromNode.label ?? pending.fromNode.id}</div>
            <div style={{ paddingLeft: 8, opacity: fromIface ? 1 : 0.55 }}>
              {fromIface?.name ?? '— sem interface —'}
            </div>
            <div style={{ textAlign: 'center', opacity: 0.6 }}>↕</div>
            <div>{pending.toNode.label ?? pending.toNode.id}</div>
            <div style={{ paddingLeft: 8, opacity: toIface ? 1 : 0.55 }}>
              {toIface?.name ?? '— sem interface —'}
            </div>
            {previewCapacity ? (
              <div style={{ marginTop: 4 }}>{formatLinkBandwidth(previewCapacity)}</div>
            ) : null}
            <div style={{ marginTop: 4, fontSize: 11, opacity: 0.85 }}>
              {monitorsTraffic
                ? 'Monitoramento de tráfego ativo nas interfaces selecionadas.'
                : 'Sem monitoramento de tráfego — edite depois para vincular interfaces.'}
            </div>
          </div>
        </FieldReadout>
      </div>

      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={commitLink}>Criar link</Button>
      </Modal.ButtonRow>
    </Modal>
  );
}
