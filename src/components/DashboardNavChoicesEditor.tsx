import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Field } from '@grafana/ui';
import { TopologyDashboardChoice } from '../types';
import { DashboardMultiSelect } from './DashboardMultiSelect';

type Props = StandardEditorProps<TopologyDashboardChoice[] | undefined>;

/** Editor das opções do painel: quais dashboards aparecem no botão superior esquerdo. */
export function DashboardNavChoicesEditor({ value, onChange }: Props) {
  return (
    <Field
      label="Dashboards no seletor"
      description="Lista que aparece ao clicar no botão no canto superior esquerdo do mapa"
    >
      <DashboardMultiSelect value={value ?? []} onChange={onChange} />
    </Field>
  );
}
