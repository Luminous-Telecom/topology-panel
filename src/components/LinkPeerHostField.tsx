import React, { useMemo } from 'react';
import { Field, Select } from '@grafana/ui';
import { TopologyNode } from '../types';
import { innerHostLabel } from '../utils/submapHosts';

interface Props {
  uid: string;
  submapLabel: string;
  hosts: TopologyNode[];
  selectedId?: string;
  onSelect: (node: TopologyNode | undefined) => void;
}

/** Escolha do host interno quando o extremo visual do cabo é um submapa. */
export function LinkPeerHostField({ uid, submapLabel, hosts, selectedId, onSelect }: Props) {
  const options = useMemo(
    () => hosts.map((host) => ({ label: innerHostLabel(host), value: host.id })),
    [hosts]
  );
  const selected = options.find((option) => option.value === selectedId) ?? null;

  return (
    <Field
      label={`Host em ${submapLabel}`}
      description="O cabo chega na caixa do submapa; a interface é deste host interno."
    >
      <Select
        inputId={uid}
        options={options}
        value={selected}
        onChange={(value) => {
          const id = value?.value;
          onSelect(id ? hosts.find((host) => host.id === id) : undefined);
        }}
        placeholder="Escolha o host interno"
        noOptionsMessage="Nenhum host neste submapa"
        isClearable
      />
    </Field>
  );
}
