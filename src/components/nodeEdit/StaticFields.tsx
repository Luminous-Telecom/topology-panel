import React from 'react';
import { ColorPickerInput, Field } from '@grafana/ui';
import { NodeEditFormSetter, NodeEditFormValues } from '../../hooks/useNodeEditForm';
import { NumberField } from './NumberField';

interface Props {
  uid: string;
  values: NodeEditFormValues;
  set: NodeEditFormSetter;
}

export function StaticFields({ uid, values, set }: Props) {
  return (
    <>
      <NumberField
        id={`${uid}-static-width`}
        label="Largura (px)"
        description="Vazio = automático pelo texto"
        value={values.width}
        placeholder="Automático"
        onChange={(value) => set('width', value)}
      />
      <NumberField
        id={`${uid}-static-height`}
        label="Altura (px)"
        description="Vazio = automático pelo texto"
        value={values.height}
        placeholder="Automático"
        onChange={(value) => set('height', value)}
      />
      <NumberField
        id={`${uid}-static-font-size`}
        label="Tamanho da fonte (px)"
        description="Vazio = padrão do painel"
        value={values.fontSize}
        placeholder="Padrão do painel"
        onChange={(value) => set('fontSize', value)}
      />
      <Field label="Cor de fundo" description="Vazio = cor estático do painel (Aparência)">
        <ColorPickerInput
          id={`${uid}-static-fill-color`}
          value={values.fillColor}
          onChange={(color) => set('fillColor', color)}
          returnColorAs="hex"
          placeholder="Padrão do painel"
        />
      </Field>
      <Field label="Cor do texto" description="Vazio = contraste automático sobre o fundo">
        <ColorPickerInput
          id={`${uid}-static-label-color`}
          value={values.labelColor}
          onChange={(color) => set('labelColor', color)}
          returnColorAs="hex"
          placeholder="Automático"
        />
      </Field>
    </>
  );
}
