import React, { useId, useMemo, useState } from 'react';
import { Button } from '@grafana/ui';
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
import {
  innerHostLabel,
  innerHostsForSubmapNode,
  linkPeerHostFromNode,
  resolveInnerHost,
} from '../utils/submapHosts';
import { isHostNode } from '../utils/topologyNodes';
import { LinkPeerHostField } from './LinkPeerHostField';
import { interfaceOptionValue, LinkInterfaceSelectField } from './LinkInterfaceSelectField';

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

  const { fromInterfaces, toInterfaces, fromLoading, toLoading, loadError } = useLinkPeerInterfaces(
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

  const commitLink = () => {
    const fromPeerHost =
      fromInnerHosts.length > 0 && fromPeer ? linkPeerHostFromNode(fromPeer) : undefined;
    const toPeerHost = toInnerHosts.length > 0 && toPeer ? linkPeerHostFromNode(toPeer) : undefined;
    onSave(
      fromIface ? interfaceToReference(fromIface) : undefined,
      toIface ? interfaceToReference(toIface) : undefined,
      resolveLinkCapacityMbps(fromIface, toIface),
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
          ? 'Em submapa, escolha o host interno e a interface. Ligando a outro submapa, o cabo é criado também na raiz e no mapa de destino. Sem interface, o cabo aparece no mapa mas não monitora tráfego.'
          : 'Interfaces opcionais. Sem seleção, o link aparece no mapa mas não monitora tráfego RX/TX.'}
      </p>

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
      <LinkInterfaceSelectField
        uid={`${uid}-from`}
        label="Interface de origem"
        hostLabel={sideEndpointLabel(pending.fromNode, fromInnerHosts.length > 0 ? fromPeer : undefined)}
        interfaces={fromInterfaces}
        loading={fromLoading}
        value={fromIface ? interfaceOptionValue(fromIface) : ''}
        onChange={setFromIface}
      />
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
      <LinkInterfaceSelectField
        uid={`${uid}-to`}
        label="Interface de destino"
        hostLabel={sideEndpointLabel(pending.toNode, toInnerHosts.length > 0 ? toPeer : undefined)}
        interfaces={toInterfaces}
        loading={toLoading}
        value={toIface ? interfaceOptionValue(toIface) : ''}
        onChange={setToIface}
      />

      <TopologyModal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={commitLink}>Criar link</Button>
      </TopologyModal.ButtonRow>
    </TopologyModal>
  );
}
