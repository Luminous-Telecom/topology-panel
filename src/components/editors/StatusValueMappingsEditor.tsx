import React, { useCallback } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Button, IconButton, Input, Select, Stack, useTheme2 } from '@grafana/ui';
import { TopologyHostStatus, TopologyPanelOptions, TopologyStatusValueMapping } from '../../types';
import styles from './StatusValueMappingsEditor.module.scss';

type Props = StandardEditorProps<TopologyStatusValueMapping[], TopologyPanelOptions>;

type MappingMode = 'value' | 'range';

const STATUS_OPTIONS: Array<{ label: string; value: TopologyHostStatus }> = [
  { label: 'Online', value: 'online' },
  { label: 'Offline', value: 'offline' },
  { label: 'Alerta', value: 'alert' },
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

  return (
    <Stack direction="column" gap={1}>
      <div className={styles.hint} style={{ color: theme.colors.text.secondary }}>
        Valores da Query Zabbix: 0 = offline; acima de 0 = online; alerta via regra própria.
        O valor exato (0 = Down) vence a faixa online, mesmo se a faixa estiver primeiro.
      </div>

      {mappings.length > 0 ? (
        <div>
          <div className={styles.row} style={{ borderBottom: `1px solid ${theme.colors.border.weak}` }}>
            <span className={styles.header} style={{ color: theme.colors.text.secondary }}>Valor / De</span>
            <span className={styles.header} style={{ color: theme.colors.text.secondary }}>Até</span>
            <span className={styles.header} style={{ color: theme.colors.text.secondary }}>Status</span>
            <span />
          </div>
          {mappings.map((entry, index) => {
            const mode = mappingMode(entry);
            return (
              <div key={index} className={styles.row} style={{ borderBottom: `1px solid ${theme.colors.border.weak}` }}>
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
                  <span className={styles.hint} style={{ color: theme.colors.text.secondary, padding: '8px 0' }}>
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
        <div className={styles.hint} style={{ color: theme.colors.text.secondary }}>
          Nenhuma regra — hosts sem mapeamento ficam na cor &quot;Sem dados&quot;.
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
