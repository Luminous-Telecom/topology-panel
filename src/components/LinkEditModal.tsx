import React, { useEffect, useId, useMemo, useState } from 'react';
import { Button, Field, Select } from '@grafana/ui';
import { TopologyModal } from './TopologyModal';
import { modalErrorStyle } from './overlayChrome';
import {
  HostMetadataMap,
  TopologyInterfaceReference,
  TopologyLink,
  TopologyLinkMedium,
  TopologyLinkPeerHost,
  TopologyMap,
  TopologyNetworkInterface,
  TopologyNode,
} from '../types';
import { useLinkPeerInterfaces } from '../hooks/useLinkPeerInterfaces';
import { ZabbixInterfaceKeywordOptions } from '../hooks/useZabbixHostInterfaces';
import { formatLinkBandwidth } from '../utils/linkBandwidth';
import {
  interfaceToReference,
  matchDiscoveredInterface,
  resolveLinkCapacityMbps,
} from '../utils/zabbixAdapter/bindInterfaceMetrics';
import {
  innerHostLabel,
  innerHostsForSubmapNode,
  linkPeerHostFromNode,
  resolveInnerHost,
} from '../utils/submapHosts';
import { findNodeById, isHostNode } from '../utils/topologyNodes';
import { FieldReadout } from './FieldReadout';
import { interfaceOptionValue, LinkInterfaceSelectField } from './LinkInterfaceSelectField';
import { LinkPeerHostField } from './LinkPeerHostField';

interface Props {
  link: TopologyLink;
  storedMap: { nodes: TopologyNode[] };
  childMaps?: Record<string, TopologyMap | undefined>;
  hostMetadata?: HostMetadataMap;
  /** Datasource Zabbix do inventário de interfaces. */
  zabbixDatasourceUid?: string;
  interfaceKeywords?: ZabbixInterfaceKeywordOptions;
  onSave: (patch: {
    medium?: TopologyLinkMedium;
    bandwidthMbps?: number;
    fromInterface?: TopologyInterfaceReference;
    toInterface?: TopologyInterfaceReference;
    fromPeerHost?: TopologyLinkPeerHost;
    toPeerHost?: TopologyLinkPeerHost;
  }) => void;
  onClose: () => void;
}

const mediumOptions = [
  { label: 'Fibra (linha contínua)', value: 'fiber' },
  { label: 'Rádio (linha tracejada)', value: 'radio' },
];

export function LinkEditModal({
  link,
  storedMap,
  childMaps,
  hostMetadata,
  zabbixDatasourceUid,
  interfaceKeywords,
  onSave,
  onClose,
}: Props) {
  const uid = useId();
  const [medium, setMedium] = useState<TopologyLinkMedium>(link.medium === 'radio' ? 'radio' : 'fiber');
  const [fromIface, setFromIface] = useState<TopologyNetworkInterface | undefined>();
  const [toIface, setToIface] = useState<TopologyNetworkInterface | undefined>();
  const [fromTouched, setFromTouched] = useState(false);
  const [toTouched, setToTouched] = useState(false);

  const fromNode = findNodeById(storedMap.nodes, link.from);
  const toNode = findNodeById(storedMap.nodes, link.to);
  const fromInnerHosts = useMemo(
    () => (fromNode ? innerHostsForSubmapNode(fromNode, childMaps) : []),
    [childMaps, fromNode]
  );
  const toInnerHosts = useMemo(
    () => (toNode ? innerHostsForSubmapNode(toNode, childMaps) : []),
    [childMaps, toNode]
  );
  const [fromPeer, setFromPeer] = useState<TopologyNode | undefined>(() => {
    if (fromNode && isHostNode(fromNode)) {
      return fromNode;
    }
    return resolveInnerHost(fromInnerHosts, link.fromPeerHost);
  });
  const [toPeer, setToPeer] = useState<TopologyNode | undefined>(() => {
    if (toNode && isHostNode(toNode)) {
      return toNode;
    }
    return resolveInnerHost(toInnerHosts, link.toPeerHost);
  });
  const { fromInterfaces, toInterfaces, fromLoading, toLoading, loadError } = useLinkPeerInterfaces(
    fromPeer,
    toPeer,
    zabbixDatasourceUid,
    interfaceKeywords,
    hostMetadata
  );

  useEffect(() => {
    if (!link.fromInterface || !fromInterfaces.length) {
      return;
    }
    setFromIface((prev) => prev ?? matchDiscoveredInterface(link.fromInterface, fromInterfaces));
  }, [fromInterfaces, link.fromInterface]);

  useEffect(() => {
    if (!link.toInterface || !toInterfaces.length) {
      return;
    }
    setToIface((prev) => prev ?? matchDiscoveredInterface(link.toInterface, toInterfaces));
  }, [toInterfaces, link.toInterface]);

  const autoCapacityMbps = useMemo(
    () => resolveLinkCapacityMbps(fromIface, toIface),
    [fromIface, toIface]
  );
  const capacityLabel =
    fromLoading || toLoading
      ? 'Carregando interfaces…'
      : formatLinkBandwidth(autoCapacityMbps) ?? 'Selecione as interfaces monitoradas';

  const fromSelectValue = fromIface
    ? interfaceOptionValue(fromIface)
    : link.fromInterface
      ? interfaceOptionValue(link.fromInterface)
      : '';
  const toSelectValue = toIface
    ? interfaceOptionValue(toIface)
    : link.toInterface
      ? interfaceOptionValue(link.toInterface)
      : '';

  return (
    <TopologyModal title="Editar link" onClose={onClose}>
      {loadError && <div className={modalErrorStyle}>{loadError}</div>}
      {fromNode && toNode ? (
        <>
          {fromInnerHosts.length > 0 ? (
            <LinkPeerHostField
              uid={`${uid}-from-host`}
              submapLabel={fromNode.label?.trim() || fromNode.id}
              hosts={fromInnerHosts}
              selectedId={fromPeer?.id}
              onSelect={(node) => {
                setFromPeer(node);
                setFromIface(undefined);
                setFromTouched(true);
              }}
            />
          ) : null}
          <LinkInterfaceSelectField
            uid={`${uid}-from-iface`}
            label="Interface de origem"
            hostLabel={fromPeer ? innerHostLabel(fromPeer) : fromNode.label ?? fromNode.id}
            interfaces={fromInterfaces}
            loading={fromLoading}
            value={fromSelectValue}
            onChange={(iface) => {
              setFromTouched(true);
              setFromIface(iface);
            }}
          />
          {toInnerHosts.length > 0 ? (
            <LinkPeerHostField
              uid={`${uid}-to-host`}
              submapLabel={toNode.label?.trim() || toNode.id}
              hosts={toInnerHosts}
              selectedId={toPeer?.id}
              onSelect={(node) => {
                setToPeer(node);
                setToIface(undefined);
                setToTouched(true);
              }}
            />
          ) : null}
          <LinkInterfaceSelectField
            uid={`${uid}-to-iface`}
            label="Interface de destino"
            hostLabel={toPeer ? innerHostLabel(toPeer) : toNode.label ?? toNode.id}
            interfaces={toInterfaces}
            loading={toLoading}
            value={toSelectValue}
            onChange={(iface) => {
              setToTouched(true);
              setToIface(iface);
            }}
          />
        </>
      ) : (
        <FieldReadout label="Interfaces">
          <span style={{ fontSize: 12, opacity: 0.75 }}>Nós de origem e destino não encontrados.</span>
        </FieldReadout>
      )}
      <Field label="Tipo">
        <Select
          inputId={`${uid}-medium`}
          options={mediumOptions}
          value={medium}
          onChange={(v) => setMedium((v.value ?? 'fiber') as TopologyLinkMedium)}
        />
      </Field>
      <FieldReadout
        label="Capacidade"
        description="Definida automaticamente pelo item de capacidade das interfaces no Zabbix (palavra-chave configurada em Fonte de dados)."
      >
        <div style={{ fontFamily: 'monospace', fontSize: 14 }}>{capacityLabel}</div>
      </FieldReadout>
      <TopologyModal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            const patch: {
              medium: TopologyLinkMedium;
              bandwidthMbps?: number;
              fromInterface?: TopologyInterfaceReference;
              toInterface?: TopologyInterfaceReference;
              fromPeerHost?: TopologyLinkPeerHost;
              toPeerHost?: TopologyLinkPeerHost;
            } = { medium };
            const mbps = resolveLinkCapacityMbps(fromIface, toIface);
            if (mbps && mbps > 0) {
              patch.bandwidthMbps = mbps;
            }
            if (fromTouched) {
              patch.fromInterface = fromIface ? interfaceToReference(fromIface) : undefined;
            } else if (fromIface) {
              patch.fromInterface = interfaceToReference(fromIface);
            }
            if (toTouched) {
              patch.toInterface = toIface ? interfaceToReference(toIface) : undefined;
            } else if (toIface) {
              patch.toInterface = interfaceToReference(toIface);
            }
            if (fromInnerHosts.length > 0) {
              patch.fromPeerHost = fromPeer ? linkPeerHostFromNode(fromPeer) : undefined;
            }
            if (toInnerHosts.length > 0) {
              patch.toPeerHost = toPeer ? linkPeerHostFromNode(toPeer) : undefined;
            }
            onSave(patch);
            onClose();
          }}
        >
          Salvar
        </Button>
      </TopologyModal.ButtonRow>
    </TopologyModal>
  );
}
