import React from 'react';
import { ColorPickerInput, Field } from '@grafana/ui';
import { NodeEditFormSetter, NodeEditFormValues } from '../../hooks/useNodeEditForm';
import { DashboardMultiSelect } from '../DashboardMultiSelect';
import { NumberField } from './NumberField';

interface Props {
  uid: string;
  values: NodeEditFormValues;
  set: NodeEditFormSetter;
}

export function DashboardPickerFields({ uid, values, set }: Props) {
  return (
    <>
      <Field
        label="Dashboards disponíveis"
        description="Dashboards que aparecem ao clicar neste botão no mapa"
      >
        <DashboardMultiSelect
          inputId={`${uid}-picker-dashboards`}
          value={values.dashboardChoices}
          onChange={(choices) => set('dashboardChoices', choices)}
        />
      </Field>
      <NumberField
        id={`${uid}-picker-width`}
        label="Largura (px)"
        description="Vazio = automático pelo texto"
        value={values.width}
        placeholder="Automático"
        onChange={(value) => set('width', value)}
      />
      <NumberField
        id={`${uid}-picker-height`}
        label="Altura (px)"
        description="Vazio = automático pelo texto"
        value={values.height}
        placeholder="Automático"
        onChange={(value) => set('height', value)}
      />
      <Field label="Cor de fundo" description="Vazio = cor submapa do painel (Aparência)">
        <ColorPickerInput
          id={`${uid}-picker-fill-color`}
          value={values.fillColor}
          onChange={(color) => set('fillColor', color)}
          returnColorAs="hex"
          placeholder="Padrão do painel"
        />
      </Field>
    </>
  );
}
