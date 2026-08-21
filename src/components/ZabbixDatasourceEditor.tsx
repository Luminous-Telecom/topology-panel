import React, { useId } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { DataSourcePicker } from '@grafana/runtime';
import { TopologyPanelOptions } from '../types';

type Props = StandardEditorProps<string | undefined, TopologyPanelOptions>;

/** Escolhe o datasource Zabbix consultado no modo "Zabbix direto". */
export function ZabbixDatasourceEditor({ value, onChange }: Props) {
  const uid = useId();

  return (
    <DataSourcePicker
      inputId={`${uid}-zabbix-datasource`}
      pluginId="alexanderzobnin-zabbix-datasource"
      current={value ?? null}
      noDefault
      placeholder="Selecionar datasource Zabbix…"
      onChange={(ds) => onChange(ds?.uid)}
    />
  );
}
