import React, { useId, useMemo, useState } from 'react';
import { Button, Field, Input, Modal, Select, Spinner } from '@grafana/ui';
import {
  HostMetadataMap,
  TopologyInterfaceReference,
  TopologyLink,
  TopologyLinkMedium,
  TopologyNetworkInterface,
  TopologyNode,
} from '../types';
import { useZabbixHostInterfaces } from '../hooks/useZabbixHostInterfaces';
import { bandwidthToInput, parseBandwidthInput, LinkBandwidthUnit, formatLinkBandwidth } from '../utils/linkBandwidth';
import { interfaceToReference, resolveInterfaceCapacityMbps } from '../utils/zabbixAdapter/bindInterfaceMetrics';
import { resolveHostLookupKey } from '../utils/hostLookup';
import { findNodeById } from '../utils/topologyNodes';
import { FieldReadout } from './FieldReadout';

interface Props {
  link: TopologyLink;
  storedMap: { nodes: TopologyNode[] };
  datasourceUid?: string;
  hostMetadata?: HostMetadataMap;
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

const unitOptions = [
  { label: 'Mb', value: 'mbps' },
  { label: 'Gb', value: 'gbps' },
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

export function LinkEditModal({ link, storedMap, datasourceUid, hostMetadata, onSave, onClose }: Props) {
  const uid = useId();
  const initial = useMemo(() => bandwidthToInput(link.bandwidthMbps), [link.bandwidthMbps]);
  const [medium, setMedium] = useState<TopologyLinkMedium>(link.medium === 'radio' ? 'radio' : 'fiber');
  const [bandwidthValue, setBandwidthValue] = useState(initial.value);
  const [bandwidthUnit, setBandwidthUnit] = useState<LinkBandwidthUnit>(initial.unit);
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

  const { interfacesByHost, loading: ifacesLoading } = useZabbixHostInterfaces(datasourceUid, hostKeys);
  const fromInterfaces = fromHostKey ? interfacesByHost[fromHostKey] ?? [] : [];
  const toInterfaces = toHostKey ? interfacesByHost[toHostKey] ?? [] : [];

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
      {datasourceUid && fromNode && toNode ? (
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
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            Configure o datasource Zabbix na aba Query para associar interfaces.
          </span>
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
        description="Largura da linha aumenta conforme Gb. Deixe vazio para usar espessura padrão."
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Input
            aria-label="Capacidade — valor"
            type="number"
            min={0}
            step="any"
            value={bandwidthValue}
            onChange={(e) => setBandwidthValue(e.currentTarget.value)}
            placeholder="Ex.: 1 ou 100"
            width={16}
          />
          <Select
            aria-label="Capacidade — unidade"
            options={unitOptions}
            value={bandwidthUnit}
            onChange={(v) => setBandwidthUnit((v.value ?? 'gbps') as LinkBandwidthUnit)}
            width={12}
          />
        </div>
      </FieldReadout>
      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            const mbps =
              parseBandwidthInput(bandwidthValue, bandwidthUnit) ??
              resolveInterfaceCapacityMbps(fromIface) ??
              resolveInterfaceCapacityMbps(toIface);
            const patch: {
              medium: TopologyLinkMedium;
              bandwidthMbps?: number;
              fromInterface?: TopologyInterfaceReference;
              toInterface?: TopologyInterfaceReference;
            } = { medium };
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
