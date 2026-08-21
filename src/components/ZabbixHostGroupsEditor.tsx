import React, { useId, useMemo } from 'react';
import { SelectableValue, StandardEditorProps } from '@grafana/data';
import { MultiSelect, Stack } from '@grafana/ui';
import { TopologyPanelOptions } from '../types';
import { useZabbixHostGroups } from '../hooks/useZabbixHostGroups';

type Props = StandardEditorProps<string[] | undefined, TopologyPanelOptions>;

/**
 * Grupos do Zabbix que alimentam o mapa.
 *
 * Cada grupo aparece em "Mostrar hosts do grupo no mapa" e no campo de grupo dos submapas.
 */
export function ZabbixHostGroupsEditor({ value, onChange, context }: Props) {
  const uid = useId();
  const datasourceUid = context.options?.zabbixDatasourceUid;
  const { groups, loading, loadError } = useZabbixHostGroups(datasourceUid);

  const selected = useMemo(() => value ?? [], [value]);

  const options = useMemo(() => {
    const names = new Set([...groups, ...selected]);
    const items: Array<SelectableValue<string>> = [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        value: name,
        label: name,
        description: groups.includes(name) ? undefined : 'Não encontrado no Zabbix',
      }));
    return items;
  }, [groups, selected]);

  if (!datasourceUid) {
    return (
      <span style={{ fontSize: 12, opacity: 0.75 }}>
        Escolha primeiro o datasource Zabbix acima.
      </span>
    );
  }

  return (
    <Stack direction="column" gap={0.5}>
      <MultiSelect
        inputId={`${uid}-zabbix-groups`}
        options={options}
        value={selected}
        isLoading={loading}
        placeholder="Selecionar grupos de host…"
        noOptionsMessage="Nenhum grupo disponível"
        onChange={(items) => {
          const next = items
            .map((item) => item.value)
            .filter((name): name is string => Boolean(name));
          onChange(next.length ? next : undefined);
        }}
      />
      {loadError ? (
        <span style={{ fontSize: 11, opacity: 0.85 }}>{loadError}</span>
      ) : null}
    </Stack>
  );
}
