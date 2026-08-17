import React from 'react';
import { Field, Input } from '@grafana/ui';

interface Props {
  id: string;
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

/** Campo numérico do modal de propriedades — vazio sempre significa "usa o padrão". */
export function NumberField({ id, label, description, value, placeholder, onChange }: Props) {
  return (
    <Field label={label} description={description}>
      <Input
        id={id}
        type="number"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    </Field>
  );
}
