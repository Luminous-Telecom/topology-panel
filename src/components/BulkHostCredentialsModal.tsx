import React, { useState } from 'react';
import { Button, Field, Input } from '@grafana/ui';
import { DraggableModal } from './DraggableModal';

interface Props {
  count: number;
  onSave: (creds: { toolUsername: string; toolPassword: string }) => void;
  onClose: () => void;
}

export function BulkHostCredentialsModal({ count, onSave, onClose }: Props) {
  const [toolUsername, setToolUsername] = useState('');
  const [toolPassword, setToolPassword] = useState('');

  return (
    <DraggableModal title={`Credenciais Tools (${count} hosts)`} isOpen onDismiss={onClose}>
      <Field
        label="Usuário"
        description={`Aplicar o mesmo usuário a ${count} hosts selecionados (Winbox / SSH / Telnet)`}
      >
        <Input
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
          type="password"
          value={toolPassword}
          onChange={(e) => setToolPassword(e.currentTarget.value)}
          placeholder="Senha"
          autoComplete="new-password"
        />
      </Field>
      <DraggableModal.ButtonRow>
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
      </DraggableModal.ButtonRow>
    </DraggableModal>
  );
}
