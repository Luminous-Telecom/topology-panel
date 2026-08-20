import React, { useId, useState } from 'react';
import { Button, Field, Input, Modal } from '@grafana/ui';
import { TopologyNode } from '../types';
import { BulkSubmapLayoutSize, seedBulkSubmapFormValues } from '../utils/mapBulkEdits';

export type BulkSubmapPatch = {
  /** undefined = não alterar */
  width?: number;
  /** undefined = não alterar */
  height?: number;
};

interface Props {
  count: number;
  targets: TopologyNode[];
  nodeLayouts?: Map<string, BulkSubmapLayoutSize>;
  onSave: (patch: BulkSubmapPatch) => void;
  onClose: () => void;
}

export function BulkSubmapEditModal({ count, targets, nodeLayouts, onSave, onClose }: Props) {
  const uid = useId();
  const seed = seedBulkSubmapFormValues(targets, nodeLayouts);
  const [width, setWidth] = useState(seed.width);
  const [height, setHeight] = useState(seed.height);

  const widthDescription = seed.widthMixed
    ? 'Tamanhos diferentes na seleção — digite um valor para aplicar a todos'
    : 'Vazio = manter a largura atual de cada submapa';
  const heightDescription = seed.heightMixed
    ? 'Tamanhos diferentes na seleção — digite um valor para aplicar a todos'
    : 'Vazio = manter a altura atual de cada submapa';

  return (
    <Modal title={`Editar submapas (${count})`} isOpen onDismiss={onClose}>
      <Field label="Largura (px)" description={widthDescription}>
        <Input
          id={`${uid}-width`}
          type="number"
          value={width}
          onChange={(e) => setWidth(e.currentTarget.value)}
          placeholder={seed.widthMixed ? 'Tamanhos mistos' : 'Não alterar'}
        />
      </Field>
      <Field label="Altura (px)" description={heightDescription}>
        <Input
          id={`${uid}-height`}
          type="number"
          value={height}
          onChange={(e) => setHeight(e.currentTarget.value)}
          placeholder={seed.heightMixed ? 'Tamanhos mistos' : 'Não alterar'}
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
