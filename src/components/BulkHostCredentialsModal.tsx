import React, { useId, useState } from 'react';
import { Button, Field, Input } from '@grafana/ui';
import { TopologyModal } from './TopologyModal';

interface Props {
  count: number;
  onSave: (creds: { toolUsername: string; toolPassword: string }) => void;
  onClose: () => void;
}

export function BulkHostCredentialsModal({ count, onSave, onClose }: Props) {
  const uid = useId();
  const [toolUsername, setToolUsername] = useState('');
  const [toolPassword, setToolPassword] = useState('');

  return (
    <TopologyModal title={`Credenciais Tools (${count} hosts)`} onClose={onClose}>
      <Field
        label="Usuário"
        description={`Aplicar o mesmo usuário a ${count} hosts selecionados (Winbox / SSH / Telnet)`}
      >
        <Input
          id={`${uid}-username`}
          value={toolUsername}
          onChange={(e) => setToolUsername(e.currentTarget.value)}
          placeholder="ex.: admin"
          autoComplete="off"
        />
      </Field>
      <Field
        label="Senha"
        description="Deixe em branco para limpar a senha desses hosts (passa a usar o padrão do painel)"
      >
        <Input
          id={`${uid}-password`}
          type="password"
          value={toolPassword}
          onChange={(e) => setToolPassword(e.currentTarget.value)}
          placeholder="Senha"
          autoComplete="new-password"
        />
      </Field>
      <TopologyModal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            onSave({
              toolUsername: toolUsername.trim(),
              toolPassword,
            });
            onClose();
          }}
        >
          Aplicar a {count} hosts
        </Button>
      </TopologyModal.ButtonRow>
    </TopologyModal>
  );
}
