import React, { useId, useMemo, useState } from 'react';
import { Button, Field, Input, Spinner, Stack } from '@grafana/ui';
import { TopologyModal } from './TopologyModal';
import { modalErrorStyle, modalHintStyle } from './overlayChrome';
import {
  HostMetadataMap,
  TopologyInterfaceReference,
  TopologyLinkPeerHost,
  TopologyMap,
  TopologyNetworkInterface,
  TopologyNode,
} from '../types';
import { useLinkPeerInterfaces } from '../hooks/useLinkPeerInterfaces';
import { interfaceToReference, resolveLinkCapacityMbps } from '../utils/zabbixAdapter/bindInterfaceMetrics';
import { formatLinkBandwidth } from '../utils/linkBandwidth';
import {
  innerHostLabel,
  innerHostsForSubmapNode,
  linkPeerHostFromNode,
  resolveInnerHost,
} from '../utils/submapHosts';
import { isHostNode } from '../utils/topologyNodes';
import { FieldReadout } from './FieldReadout';
import { LinkPeerHostField } from './LinkPeerHostField';

export interface PendingLinkEndpoints {
  from: string;
  to: string;
  fromNode: TopologyNode;
  toNode: TopologyNode;
}

interface Props {
  pending: PendingLinkEndpoints;
  childMaps?: Record<string, TopologyMap | undefined>;
  hostMetadata?: HostMetadataMap;
  /** Datasource Zabbix do inventário de interfaces. */
  zabbixDatasourceUid?: string;
  zabbixRxItemKeyword?: string;
  zabbixTxItemKeyword?: string;
  zabbixOperStatusItemKeyword?: string;
  zabbixSpeedItemKeyword?: string;
  onSave: (
    fromInterface: TopologyInterfaceReference | undefined,
    toInterface: TopologyInterfaceReference | undefined,
    bandwidthMbps?: number,
    fromPeerHost?: TopologyLinkPeerHost,
    toPeerHost?: TopologyLinkPeerHost
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
          style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border-weak)', borderRadius: 4 }}
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
                  padding: '5px 8px',
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

function sideEndpointLabel(visual: TopologyNode, peer?: TopologyNode): string {
  if (peer) {
    return innerHostLabel(peer);
  }
  return visual.label?.trim() || visual.id;
}

export function LinkInterfaceSelectModal({
  pending,
  childMaps,
  hostMetadata,
  zabbixDatasourceUid,
  zabbixRxItemKeyword,
  zabbixTxItemKeyword,
  zabbixOperStatusItemKeyword,
  zabbixSpeedItemKeyword,
  onSave,
  onClose,
}: Props) {
  const uid = useId();
  const [filter, setFilter] = useState('');
  const [fromIface, setFromIface] = useState<TopologyNetworkInterface | undefined>();
  const [toIface, setToIface] = useState<TopologyNetworkInterface | undefined>();

  const fromInnerHosts = useMemo(
    () => innerHostsForSubmapNode(pending.fromNode, childMaps),
    [childMaps, pending.fromNode]
  );
  const toInnerHosts = useMemo(
    () => innerHostsForSubmapNode(pending.toNode, childMaps),
    [childMaps, pending.toNode]
  );
  const [fromPeer, setFromPeer] = useState<TopologyNode | undefined>(() =>
    isHostNode(pending.fromNode) ? pending.fromNode : resolveInnerHost(fromInnerHosts)
  );
  const [toPeer, setToPeer] = useState<TopologyNode | undefined>(() =>
    isHostNode(pending.toNode) ? pending.toNode : resolveInnerHost(toInnerHosts)
  );

  const { fromInterfaces, toInterfaces, loading, loadError } = useLinkPeerInterfaces(
    fromPeer,
    toPeer,
    zabbixDatasourceUid,
    {
      rxKeyword: zabbixRxItemKeyword,
      txKeyword: zabbixTxItemKeyword,
      operStatusKeyword: zabbixOperStatusItemKeyword,
      speedKeyword: zabbixSpeedItemKeyword,
    },
    hostMetadata
  );

  const previewCapacity = resolveLinkCapacityMbps(fromIface, toIface);
  const monitorsTraffic = Boolean(fromIface?.metrics.rx?.itemId || fromIface?.metrics.tx?.itemId
    || toIface?.metrics.rx?.itemId || toIface?.metrics.tx?.itemId);

  const commitLink = () => {
    const fromPeerHost =
      fromInnerHosts.length > 0 && fromPeer ? linkPeerHostFromNode(fromPeer) : undefined;
    const toPeerHost = toInnerHosts.length > 0 && toPeer ? linkPeerHostFromNode(toPeer) : undefined;
    onSave(
      fromIface ? interfaceToReference(fromIface) : undefined,
      toIface ? interfaceToReference(toIface) : undefined,
      previewCapacity,
      fromPeerHost,
      toPeerHost
    );
    onClose();
  };

  return (
    <TopologyModal title="Novo link" onClose={onClose}>
      {loadError && <div className={modalErrorStyle}>{loadError}</div>}
      <p className={modalHintStyle}>
        {fromInnerHosts.length > 0 || toInnerHosts.length > 0
          ? 'Em submapa, escolha o host interno e a interface. Sem interface, o cabo aparece no mapa mas não monitora tráfego.'
          : 'Interfaces opcionais. Sem seleção, o link aparece no mapa mas não monitora tráfego RX/TX.'}
      </p>
      <Field label="Buscar interface (opcional)">
        <Input
          id={`${uid}-filter`}
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
          placeholder="Nome, alias, MAC, IP…"
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Stack direction="column" gap={1}>
          {fromInnerHosts.length > 0 ? (
            <LinkPeerHostField
              uid={`${uid}-from-host`}
              submapLabel={pending.fromNode.label?.trim() || pending.fromNode.id}
              hosts={fromInnerHosts}
              selectedId={fromPeer?.id}
              onSelect={(node) => {
                setFromPeer(node);
                setFromIface(undefined);
              }}
            />
          ) : null}
          <InterfaceList
            uid={`${uid}-from`}
            title="Origem"
            hostLabel={sideEndpointLabel(pending.fromNode, fromInnerHosts.length > 0 ? fromPeer : undefined)}
            interfaces={fromInterfaces}
            selected={fromIface}
            onSelect={setFromIface}
            filter={filter}
            loading={loading}
          />
        </Stack>
        <Stack direction="column" gap={1}>
          {toInnerHosts.length > 0 ? (
            <LinkPeerHostField
              uid={`${uid}-to-host`}
              submapLabel={pending.toNode.label?.trim() || pending.toNode.id}
              hosts={toInnerHosts}
              selectedId={toPeer?.id}
              onSelect={(node) => {
                setToPeer(node);
                setToIface(undefined);
              }}
            />
          ) : null}
          <InterfaceList
            uid={`${uid}-to`}
            title="Destino"
            hostLabel={sideEndpointLabel(pending.toNode, toInnerHosts.length > 0 ? toPeer : undefined)}
            interfaces={toInterfaces}
            selected={toIface}
            onSelect={setToIface}
            filter={filter}
            loading={loading}
          />
        </Stack>
      </div>

      <div style={{ marginTop: 8 }}>
        <FieldReadout label="Pré-visualização">
          <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.45 }}>
            <div>
              {sideEndpointLabel(pending.fromNode, fromInnerHosts.length > 0 ? fromPeer : undefined)}
              <span style={{ opacity: fromIface ? 1 : 0.55 }}>
                {' · '}
                {fromIface?.name ?? 'sem interface'}
              </span>
              <span style={{ opacity: 0.6 }}> ↕ </span>
              {sideEndpointLabel(pending.toNode, toInnerHosts.length > 0 ? toPeer : undefined)}
              <span style={{ opacity: toIface ? 1 : 0.55 }}>
                {' · '}
                {toIface?.name ?? 'sem interface'}
              </span>
            </div>
            <div style={{ marginTop: 2, fontSize: 11, opacity: 0.85 }}>
              {previewCapacity ? `${formatLinkBandwidth(previewCapacity)} · ` : ''}
              {monitorsTraffic
                ? 'Monitoramento de tráfego ativo.'
                : 'Sem monitoramento de tráfego — edite depois para vincular.'}
            </div>
          </div>
        </FieldReadout>
      </div>

      <TopologyModal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={commitLink}>Criar link</Button>
      </TopologyModal.ButtonRow>
    </TopologyModal>
  );
}
