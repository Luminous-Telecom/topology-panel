import React, { useId, useMemo } from 'react';
import { SelectableValue, StandardEditorProps } from '@grafana/data';
import { Select, Stack } from '@grafana/ui';
import { TopologyPanelOptions } from '../types';
import { useZabbixHostGroups } from '../hooks/useZabbixHostGroups';
import { useZabbixItemNames } from '../hooks/useZabbixItemNames';
import { collectAllSubmapGroups } from '../utils/queryHosts';

type Props = StandardEditorProps<string | undefined, TopologyPanelOptions>;

/** Item de status: escolhe um nome da lista do campo Item do grafana-zabbix. */
export function ZabbixStatusItemEditor({ value, onChange, context }: Props) {
  const uid = useId();
  const panelOptions = context.options as TopologyPanelOptions | undefined;
  const datasourceUid = panelOptions?.zabbixDatasourceUid;
  const { groups: zabbixGroups } = useZabbixHostGroups(datasourceUid);
  const configuredGroups = useMemo(
    () => (panelOptions ? collectAllSubmapGroups(panelOptions) : []),
    [panelOptions]
  );
  const groupNames = configuredGroups.length ? configuredGroups : zabbixGroups;
  const { items, loading, loadError } = useZabbixItemNames(datasourceUid, groupNames);
  const selected = value?.trim() || undefined;

  const options = useMemo(() => {
    const names = new Set([...items, ...(selected ? [selected] : [])]);
    const list: Array<SelectableValue<string>> = [...names]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((name) => ({
        value: name,
        label: name,
        description: items.includes(name) ? undefined : 'Não encontrado no Zabbix',
      }));
    return list;
  }, [items, selected]);

  if (!datasourceUid) {
    return (
      <span style={{ fontSize: 12, opacity: 0.75 }}>
        Escolha primeiro o datasource Zabbix acima.
      </span>
    );
  }

  return (
    <Stack direction="column" gap={0.5}>
      <Select
        inputId={`${uid}-zabbix-status-item`}
        options={options}
        value={selected}
        isLoading={loading}
        placeholder="Selecionar item de status…"
        noOptionsMessage="Nenhum item disponível"
        onChange={(item) => onChange(item?.value)}
      />
      {loadError ? (
        <span style={{ fontSize: 11, opacity: 0.85 }}>{loadError}</span>
      ) : null}
    </Stack>
  );
}
