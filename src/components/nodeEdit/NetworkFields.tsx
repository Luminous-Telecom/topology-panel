import React from 'react';
import { Field, Input } from '@grafana/ui';
import { NodeEditFormSetter, NodeEditFormValues } from '../../hooks/useNodeEditForm';
import { TopologyNode } from '../../types';
import { NumberField } from './NumberField';

interface Props {
  uid: string;
  node: TopologyNode;
  values: NodeEditFormValues;
  set: NodeEditFormSetter;
}

export function NetworkFields({ uid, node, values, set }: Props) {
  return (
    <>
      <Field label="Nome">
        <Input
          id={`${uid}-network-label`}
          value={values.label}
          onChange={(e) => set('label', e.currentTarget.value)}
        />
      </Field>
      <NumberField
        id={`${uid}-network-width`}
        label="Largura (px)"
        value={values.width || String(node.width ?? 220)}
        onChange={(value) => set('width', value)}
      />
      <NumberField
        id={`${uid}-network-height`}
        label="Altura (px)"
        value={values.height || String(node.height ?? 140)}
        onChange={(value) => set('height', value)}
      />
      <Field label="Cor de preenchimento (opcional)" description="Ex: rgba(96,96,96,0.22)">
        <Input
          id={`${uid}-network-fill-color`}
          value={values.fillColor}
          onChange={(e) => set('fillColor', e.currentTarget.value)}
          placeholder="Padrão do painel"
        />
      </Field>
      <Field label="Cor da borda (opcional)">
        <Input
          id={`${uid}-network-border-color`}
          value={values.borderColor}
          onChange={(e) => set('borderColor', e.currentTarget.value)}
          placeholder="Padrão do painel"
        />
      </Field>
    </>
  );
}
