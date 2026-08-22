import React from 'react';
import { Field, Select, Spinner } from '@grafana/ui';
import { TopologyNetworkInterface } from '../types';
import { formatLinkBandwidth } from '../utils/linkBandwidth';

export function interfaceOptionValue(iface: Pick<TopologyNetworkInterface, 'name' | 'snmpIndex'>): string {
  return `${iface.name}\u0000${iface.snmpIndex ?? ''}`;
}

interface Props {
  uid: string;
  label: string;
  hostLabel: string;
  interfaces: TopologyNetworkInterface[];
  loading: boolean;
  value?: string;
  onChange: (iface: TopologyNetworkInterface | undefined) => void;
}

/** Select de interface monitorada — mesmo controle em Novo link e Editar link. */
export function LinkInterfaceSelectField({
  uid,
  label,
  hostLabel,
  interfaces,
  loading,
  value,
  onChange,
}: Props) {
  const options = interfaces.map((iface) => ({
    label: `${iface.name}${iface.speedMbps ? ` (${formatLinkBandwidth(iface.speedMbps)})` : ''}`,
    value: interfaceOptionValue(iface),
  }));
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <Field label={label} description={hostLabel}>
      {loading ? (
        <Spinner inline />
      ) : (
        <Select
          inputId={uid}
          options={options}
          value={selected}
          onChange={(v) => {
            const raw = v?.value ?? '';
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
          placeholder="— Nenhuma —"
          noOptionsMessage="Nenhuma interface encontrada"
          isClearable
        />
      )}
    </Field>
  );
}
