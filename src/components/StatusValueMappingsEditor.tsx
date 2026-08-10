import React, { useCallback } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { css } from '@emotion/css';
import { Button, IconButton, Input, Select, Stack, useTheme2 } from '@grafana/ui';
import { TopologyHostStatus, TopologyPanelOptions, TopologyStatusValueMapping } from '../types';

type Props = StandardEditorProps<TopologyStatusValueMapping[], TopologyPanelOptions>;

type MappingMode = 'value' | 'range';

const STATUS_OPTIONS: Array<{ label: string; value: TopologyHostStatus }> = [
  { label: 'Online', value: 'online' },
  { label: 'Offline', value: 'offline' },
];

function mappingMode(entry: TopologyStatusValueMapping): MappingMode {
  return entry.value != null ? 'value' : 'range';
}

function parseNumberInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

function cloneMappings(mappings: TopologyStatusValueMapping[]): TopologyStatusValueMapping[] {
  return mappings.map((entry) => ({ ...entry }));
}

function newMapping(mode: MappingMode): TopologyStatusValueMapping {
  if (mode === 'value') {
    return { value: 0, status: 'offline' };
  }
  return { from: 0, to: 0, status: 'offline' };
}

/** Editor de mapeamento valor → online/offline nas opções do painel. */
export function StatusValueMappingsEditor({ value, onChange }: Props) {
  const theme = useTheme2();
  const mappings = value ?? [];

  const updateAt = useCallback(
    (index: number, patch: Partial<TopologyStatusValueMapping>) => {
      const next = cloneMappings(mappings);
      next[index] = { ...next[index], ...patch };
      onChange(next);
    },
    [mappings, onChange]
  );

  const removeAt = useCallback(
    (index: number) => {
      const next = mappings.filter((_, i) => i !== index);
      onChange(next.length ? next : []);
    },
    [mappings, onChange]
  );

  const addMapping = useCallback(
    (mode: MappingMode) => {
      onChange([...mappings, newMapping(mode)]);
    },
    [mappings, onChange]
  );

  const rowStyle = css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 8px;
    align-items: end;
    padding: 8px 0;
    border-bottom: 1px solid ${theme.colors.border.weak};
  `;

  const headerStyle = css`
    font-size: 11px;
    font-weight: 600;
    color: ${theme.colors.text.secondary};
    text-transform: uppercase;
    letter-spacing: 0.03em;
  `;

  return (
    <Stack direction="column" gap={1}>
      <div style={{ fontSize: 12, color: theme.colors.text.secondary, lineHeight: 1.4 }}>
        Valores da Query Zabbix: 0 = offline; acima de 0 = online (icmpping / icmppingsec).
        A primeira regra que bater define a cor — offline (valor exato 0) deve vir antes do intervalo online.
      </div>

      {mappings.length > 0 ? (
        <div>
          <div className={rowStyle}>
            <span className={headerStyle}>Valor / De</span>
            <span className={headerStyle}>Até</span>
            <span className={headerStyle}>Status</span>
            <span />
          </div>
          {mappings.map((entry, index) => {
            const mode = mappingMode(entry);
            return (
              <div key={index} className={rowStyle}>
                {mode === 'value' ? (
                  <Input
                    type="number"
                    value={entry.value ?? 0}
                    aria-label={`Valor ${index + 1}`}
                    onChange={(e) => {
                      const parsed = parseNumberInput(e.currentTarget.value);
                      if (parsed == null) {
                        return;
                      }
                      updateAt(index, { value: parsed, from: undefined, to: undefined });
                    }}
                  />
                ) : (
                  <Input
                    type="number"
                    placeholder="−∞"
                    value={entry.from ?? ''}
                    aria-label={`De ${index + 1}`}
                    onChange={(e) => {
                      const parsed = parseNumberInput(e.currentTarget.value);
                      updateAt(index, {
                        value: undefined,
                        from: parsed,
                      });
                    }}
                  />
                )}
                {mode === 'value' ? (
                  <span style={{ fontSize: 12, color: theme.colors.text.secondary, padding: '8px 0' }}>
                    —
                  </span>
                ) : (
                  <Input
                    type="number"
                    placeholder="+∞"
                    value={entry.to ?? ''}
                    aria-label={`Até ${index + 1}`}
                    onChange={(e) => {
                      const parsed = parseNumberInput(e.currentTarget.value);
                      updateAt(index, {
                        value: undefined,
                        to: parsed,
                      });
                    }}
                  />
                )}
                <Select
                  value={entry.status}
                  options={STATUS_OPTIONS}
                  onChange={(option) => {
                    if (!option?.value) {
                      return;
                    }
                    updateAt(index, { status: option.value });
                  }}
                />
                <IconButton
                  name="trash-alt"
                  variant="secondary"
                  tooltip="Remover regra"
                  aria-label={`Remover regra ${index + 1}`}
                  onClick={() => removeAt(index)}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: theme.colors.text.secondary }}>
          Nenhuma regra — hosts com query ficam na cor &quot;Sem query&quot;.
        </div>
      )}

      <Stack direction="row" gap={1}>
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          onClick={() => addMapping('value')}
        >
          Valor exato
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          onClick={() => addMapping('range')}
        >
          Intervalo
        </Button>
      </Stack>
    </Stack>
  );
}
