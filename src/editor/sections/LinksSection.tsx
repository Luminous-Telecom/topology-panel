import React from 'react';
import { Button, Field, Input, Select, Stack } from '@grafana/ui';
import { TopologyLink } from '../../types';
import { FieldReadout } from '../../components/FieldReadout';
import { bandwidthToInput } from '../../utils/linkBandwidth';

/** Campo do link editável por Select — `bandwidthMbps` chega como "valor:unidade". */
export type LinkEditField = 'from' | 'to' | 'medium' | 'bandwidthMbps';

interface LinksSectionProps {
  uid: string;
  locked: boolean;
  links: TopologyLink[];
  nodeCount: number;
  nodeOptions: Array<{ label: string; value: string }>;
  onUpdate: (index: number, field: LinkEditField, value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

const mediumOptions = [
  { label: 'Fibra (linha contínua)', value: 'fiber' },
  { label: 'Rádio (linha tracejada)', value: 'radio' },
];

const bandwidthUnitOptions = [
  { label: 'Mb', value: 'mbps' },
  { label: 'Gb', value: 'gbps' },
];

export function LinksSection({
  uid,
  locked,
  links,
  nodeCount,
  nodeOptions,
  onUpdate,
  onRemove,
  onAdd,
}: LinksSectionProps) {
  return (
    <FieldReadout
      label={`Links (${links.length})`}
      description="Fibra = linha contínua · Rádio = tracejado · Capacidade define espessura e rótulo (Mb/Gb)"
    >
      <Stack direction="column" gap={1}>
        {links.map((link, idx) => {
          const bw = bandwidthToInput(link.bandwidthMbps);
          return (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="De">
                <Select
                  inputId={`${uid}-link-${idx}-from`}
                  width={20}
                  options={nodeOptions}
                  value={link.from}
                  disabled={locked}
                  onChange={(v) => {
                    if (v.value != null) {
                      onUpdate(idx, 'from', v.value);
                    }
                  }}
                />
              </Field>
              <Field label="Para">
                <Select
                  inputId={`${uid}-link-${idx}-to`}
                  width={20}
                  options={nodeOptions}
                  value={link.to}
                  disabled={locked}
                  onChange={(v) => {
                    if (v.value != null) {
                      onUpdate(idx, 'to', v.value);
                    }
                  }}
                />
              </Field>
              <Field label="Meio">
                <Select
                  inputId={`${uid}-link-${idx}-medium`}
                  width={18}
                  options={mediumOptions}
                  value={link.medium ?? 'fiber'}
                  disabled={locked}
                  onChange={(v) => {
                    if (v.value != null) {
                      onUpdate(idx, 'medium', v.value);
                    }
                  }}
                />
              </Field>
              <FieldReadout label="Capacidade">
                <div style={{ display: 'flex', gap: 4 }}>
                  <Input
                    aria-label={`Capacidade do link ${idx + 1} — valor`}
                    type="number"
                    min={0}
                    step="any"
                    width={10}
                    disabled={locked}
                    value={bw.value}
                    placeholder="1"
                    onChange={(e) => onUpdate(idx, 'bandwidthMbps', `${e.currentTarget.value}:${bw.unit}`)}
                  />
                  <Select
                    aria-label={`Capacidade do link ${idx + 1} — unidade`}
                    width={10}
                    options={bandwidthUnitOptions}
                    value={bw.unit}
                    disabled={locked}
                    onChange={(v) => onUpdate(idx, 'bandwidthMbps', `${bw.value}:${v.value ?? 'gbps'}`)}
                  />
                </div>
              </FieldReadout>
              <Button variant="destructive" size="sm" disabled={locked} onClick={() => onRemove(idx)}>
                Remover
              </Button>
            </div>
          );
        })}
        <Button onClick={onAdd} disabled={locked || nodeCount < 2}>
          + Adicionar link
        </Button>
      </Stack>
    </FieldReadout>
  );
}
