import React, { useId, useState } from 'react';
import { Button, Field, Input, Modal } from '@grafana/ui';

export type BulkSubmapPatch = {
  /** undefined = não alterar */
  width?: number;
  /** undefined = não alterar */
  height?: number;
};

interface Props {
  count: number;
  onSave: (patch: BulkSubmapPatch) => void;
  onClose: () => void;
}

export function BulkSubmapEditModal({ count, onSave, onClose }: Props) {
  const uid = useId();
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');

  return (
    <Modal title={`Editar submapas (${count})`} isOpen onDismiss={onClose}>
      <Field label="Largura (px)" description="Vazio = manter a largura atual de cada submapa">
        <Input
          id={`${uid}-width`}
          type="number"
          value={width}
          onChange={(e) => setWidth(e.currentTarget.value)}
          placeholder="Não alterar"
        />
      </Field>
      <Field label="Altura (px)" description="Vazio = manter a altura atual de cada submapa">
        <Input
          id={`${uid}-height`}
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
            const patch: BulkSubmapPatch = {};
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
