import React, { useState } from 'react';
import { Button, Field, InlineSwitch, Input, Modal } from '@grafana/ui';

export type BulkSubmapPatch = {
  /** undefined = não alterar */
  width?: number;
  /** undefined = não alterar */
  height?: number;
  /** true = incluir (padrão); false = só hosts diretos */
  includeInParentStats: boolean;
};

interface Props {
  count: number;
  onSave: (patch: BulkSubmapPatch) => void;
  onClose: () => void;
}

export function BulkSubmapEditModal({ count, onSave, onClose }: Props) {
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [includeInParentStats, setIncludeInParentStats] = useState(true);

  return (
    <Modal title={`Editar submapas (${count})`} isOpen onDismiss={onClose}>
      <Field
        label="Incluir submapas internos"
        description="Desative para monitorar só os hosts de cada dashboard, ignorando submapas dentro dele"
      >
        <InlineSwitch
          label={includeInParentStats ? 'Ativado' : 'Desativado'}
          value={includeInParentStats}
          onChange={(e) => setIncludeInParentStats(e.currentTarget.checked)}
        />
      </Field>
      <Field label="Largura (px)" description="Vazio = manter a largura atual de cada submapa">
        <Input
          type="number"
          value={width}
          onChange={(e) => setWidth(e.currentTarget.value)}
          placeholder="Não alterar"
        />
      </Field>
      <Field label="Altura (px)" description="Vazio = manter a altura atual de cada submapa">
        <Input
          type="number"
          value={height}
          onChange={(e) => setHeight(e.currentTarget.value)}
          placeholder="Não alterar"
        />
      </Field>
      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            const patch: BulkSubmapPatch = { includeInParentStats };
            if (width.trim()) {
              patch.width = Math.max(40, Number(width) || 40);
            }
            if (height.trim()) {
              patch.height = Math.max(24, Number(height) || 24);
            }
            onSave(patch);
            onClose();
          }}
        >
          Aplicar a {count} submapas
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
}
