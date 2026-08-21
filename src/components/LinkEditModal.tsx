import React, { useEffect, useId, useMemo, useState } from 'react';
import { Button, Field, Modal, Select, Spinner } from '@grafana/ui';
import {
  HostMetadataMap,
  TopologyInterfaceReference,
  TopologyLink,
  TopologyLinkMedium,
  TopologyNetworkInterface,
  TopologyNode,
} from '../types';
import { useZabbixHostInterfaces } from '../hooks/useZabbixHostInterfaces';
import { formatLinkBandwidth } from '../utils/linkBandwidth';
import {
  interfaceToReference,
  matchDiscoveredInterface,
  resolveLinkCapacityMbps,
} from '../utils/zabbixAdapter/bindInterfaceMetrics';
import { resolveHostLookupKey } from '../utils/hostLookup';
import { findNodeById } from '../utils/topologyNodes';
import { FieldReadout } from './FieldReadout';

interface Props {
  link: TopologyLink;
  storedMap: { nodes: TopologyNode[] };
  hostMetadata?: HostMetadataMap;
  /** Datasource Zabbix do inventário de interfaces. */
  zabbixDatasourceUid?: string;
  zabbixRxItemKeyword?: string;
  zabbixTxItemKeyword?: string;
  onSave: (patch: {
    medium?: TopologyLinkMedium;
    bandwidthMbps?: number;
    fromInterface?: TopologyInterfaceReference;
    toInterface?: TopologyInterfaceReference;
  }) => void;
  onClose: () => void;
}

const mediumOptions = [
  { label: 'Fibra (linha contínua)', value: 'fiber' },
  { label: 'Rádio (linha tracejada)', value: 'radio' },
];

function InterfaceSelectField({
  uid,
  label,
  hostLabel,
  interfaces,
  loading,
  value,
  onChange,
}: {
  uid: string;
  label: string;
  hostLabel: string;
  interfaces: TopologyNetworkInterface[];
  loading: boolean;
  value?: string;
  onChange: (iface: TopologyNetworkInterface | undefined) => void;
}) {
  const options = interfaces.map((iface) => ({
    label: `${iface.name}${iface.speedMbps ? ` (${formatLinkBandwidth(iface.speedMbps)})` : ''}`,
    value: `${iface.name}\u0000${iface.snmpIndex ?? ''}`,
  }));

  return (
    <FieldReadout label={label} description={hostLabel}>
      {loading ? (
        <Spinner inline />
      ) : (
        <Select
          inputId={uid}
          options={[{ label: '— Nenhuma —', value: '' }, ...options]}
          value={value ?? ''}
          onChange={(v) => {
            const raw = v.value ?? '';
            if (!raw) {
              onChange(undefined);
              return;
            }
            const [name, snmpIndex] = raw.split('\u0000');
            const found = interfaces.find(
              (i) => i.name === name && (i.snmpIndex ?? '') === (snmpIndex || '')
            );
            onChange(found);
          }}
          isClearable
        />
      )}
    </FieldReadout>
  );
}

export function LinkEditModal({
  link,
  storedMap,
  hostMetadata,
  zabbixDatasourceUid,
  zabbixRxItemKeyword,
  zabbixTxItemKeyword,
  onSave,
  onClose,
}: Props) {
  const uid = useId();
  const [medium, setMedium] = useState<TopologyLinkMedium>(link.medium === 'radio' ? 'radio' : 'fiber');
  const [fromIface, setFromIface] = useState<TopologyNetworkInterface | undefined>();
  const [toIface, setToIface] = useState<TopologyNetworkInterface | undefined>();

  const fromNode = findNodeById(storedMap.nodes, link.from);
  const toNode = findNodeById(storedMap.nodes, link.to);
  const fromHostKey = fromNode ? resolveHostLookupKey(fromNode, hostMetadata) : undefined;
  const toHostKey = toNode ? resolveHostLookupKey(toNode, hostMetadata) : undefined;
  const hostKeys = useMemo(
    () => [fromHostKey, toHostKey].filter((k): k is string => Boolean(k)),
    [fromHostKey, toHostKey]
  );

  const { interfacesByHost, loading: ifacesLoading, loadError } = useZabbixHostInterfaces(
    hostKeys,
    zabbixDatasourceUid,
    {
      rxKeyword: zabbixRxItemKeyword,
      txKeyword: zabbixTxItemKeyword,
    }
  );
  const fromInterfaces = fromHostKey ? interfacesByHost[fromHostKey] ?? [] : [];
  const toInterfaces = toHostKey ? interfacesByHost[toHostKey] ?? [] : [];

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
  const capacityLabel = ifacesLoading
    ? 'Carregando interfaces…'
    : formatLinkBandwidth(autoCapacityMbps) ?? 'Selecione as interfaces monitoradas';

  const fromSelectValue = fromIface
    ? `${fromIface.name}\u0000${fromIface.snmpIndex ?? ''}`
    : link.fromInterface
      ? `${link.fromInterface.name}\u0000${link.fromInterface.snmpIndex ?? ''}`
      : '';
  const toSelectValue = toIface
    ? `${toIface.name}\u0000${toIface.snmpIndex ?? ''}`
    : link.toInterface
      ? `${link.toInterface.name}\u0000${link.toInterface.snmpIndex ?? ''}`
      : '';

  return (
    <Modal title="Editar link" isOpen onDismiss={onClose}>
      {loadError && (
        <div style={{ color: 'var(--error-text)', marginBottom: 8, fontSize: 12 }}>{loadError}</div>
      )}
      {fromNode && toNode ? (
        <>
          <InterfaceSelectField
            uid={`${uid}-from-iface`}
            label="Interface de origem"
            hostLabel={fromNode.label ?? fromNode.id}
            interfaces={fromInterfaces}
            loading={ifacesLoading}
            value={fromSelectValue}
            onChange={setFromIface}
          />
          <InterfaceSelectField
            uid={`${uid}-to-iface`}
            label="Interface de destino"
            hostLabel={toNode.label ?? toNode.id}
            interfaces={toInterfaces}
            loading={ifacesLoading}
            value={toSelectValue}
            onChange={setToIface}
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
        description="Definida automaticamente pelos itens de velocidade das interfaces no Zabbix (ex.: ifSpeed, modulação)."
      >
        <div style={{ fontFamily: 'monospace', fontSize: 14 }}>{capacityLabel}</div>
      </FieldReadout>
      <Modal.ButtonRow>
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
            } = { medium };
            const mbps = resolveLinkCapacityMbps(fromIface, toIface);
            if (mbps && mbps > 0) {
              patch.bandwidthMbps = mbps;
            }
            if (fromIface) {
              patch.fromInterface = interfaceToReference(fromIface);
            }
            if (toIface) {
              patch.toInterface = interfaceToReference(toIface);
            }
            onSave(patch);
            onClose();
          }}
        >
          Salvar
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
}
