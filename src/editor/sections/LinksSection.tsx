import React, { useMemo, useState } from 'react';
import { Button, Field, Select, Stack, useTheme2 } from '@grafana/ui';
import { TopologyLink } from '../../types';
import { FieldReadout } from '../../components/FieldReadout';
import { formatLinkBandwidth } from '../../utils/linkBandwidth';

/** Campo do link editável por Select — capacidade vem das interfaces no mapa. */
export type LinkEditField = 'from' | 'to' | 'medium';

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

/** Rótulo compacto da linha — Selects só montam quando a linha está aberta. */
export function formatLinkRowLabel(
  link: TopologyLink,
  labelById: ReadonlyMap<string, string>
): string {
  const from = labelById.get(link.from) ?? link.from;
  const to = labelById.get(link.to) ?? link.to;
  const medium = link.medium === 'radio' ? 'Rádio' : 'Fibra';
  return `${from} → ${to} · ${medium}`;
}

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
  const theme = useTheme2();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const labelById = useMemo(() => {
    const next = new Map<string, string>();
    for (const opt of nodeOptions) {
      next.set(opt.value, opt.label);
    }
    return next;
  }, [nodeOptions]);

  return (
    <FieldReadout
      label={`Links (${links.length})`}
      description="Fibra = linha contínua · Rádio = tracejado · Capacidade vem das interfaces Zabbix no mapa. Abra a linha para editar."
    >
      <Stack direction="column" gap={1}>
        {links.map((link, idx) => {
          if (openIndex === idx) {
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
                  <span style={{ fontSize: 12 }}>
                    {formatLinkBandwidth(link.bandwidthMbps) ?? 'Automática (interfaces no mapa)'}
                  </span>
                </FieldReadout>
                <Button variant="secondary" size="sm" onClick={() => setOpenIndex(null)}>
                  Recolher
                </Button>
                <Button variant="destructive" size="sm" disabled={locked} onClick={() => onRemove(idx)}>
                  Remover
                </Button>
              </div>
            );
          }

          const bandwidth = formatLinkBandwidth(link.bandwidthMbps);
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
                fontSize: 13,
                padding: '6px 8px',
                borderRadius: 4,
                background: theme.colors.background.secondary,
                border: `1px solid ${theme.colors.border.weak}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 120 }}>{formatLinkRowLabel(link, labelById)}</div>
              {bandwidth ? (
                <span style={{ color: theme.colors.text.secondary, fontSize: 12 }}>{bandwidth}</span>
              ) : null}
              <Button variant="secondary" size="sm" onClick={() => setOpenIndex(idx)}>
                Editar
              </Button>
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
