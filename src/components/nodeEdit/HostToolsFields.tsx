import React from 'react';
import { Field, Input } from '@grafana/ui';
import { NodeEditFormSetter, NodeEditFormValues } from '../../hooks/useNodeEditForm';

interface Props {
  uid: string;
  values: NodeEditFormValues;
  set: NodeEditFormSetter;
}

export function HostToolsFields({ uid, values, set }: Props) {
  return (
    <>
      <Field
        label="Usuário (Tools)"
        description="Winbox / SSH / Telnet — vazio usa o padrão do painel (Acesso remoto)"
      >
        <Input
          id={`${uid}-tool-username`}
          value={values.toolUsername}
          onChange={(e) => set('toolUsername', e.currentTarget.value)}
          placeholder="Padrão do painel"
          autoComplete="off"
        />
      </Field>
      <Field label="Senha (Tools)" description="Abre Winbox já autenticado. Fica salva no JSON do mapa.">
        <Input
          id={`${uid}-tool-password`}
          type="password"
          value={values.toolPassword}
          onChange={(e) => set('toolPassword', e.currentTarget.value)}
          placeholder="Padrão do painel"
          autoComplete="new-password"
        />
      </Field>
    </>
  );
}
