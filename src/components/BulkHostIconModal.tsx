import React, { useState } from 'react';
import { Button, Field } from '@grafana/ui';
import { DraggableModal } from './DraggableModal';
import { TopologyHostIcon } from '../types';
import { HOST_ICON_LABELS } from '../utils/hostIcons';
import { HostIconPicker } from './HostIconPicker';

interface Props {
  count: number;
  onSave: (icon: TopologyHostIcon) => void;
  onClose: () => void;
}

export function BulkHostIconModal({ count, onSave, onClose }: Props) {
  const [icon, setIcon] = useState<TopologyHostIcon>('network');

  return (
    <DraggableModal title={`Alterar tipo (${count} hosts)`} isOpen onDismiss={onClose}>
      <Field label="Tipo / ícone" description={`Aplicar ${HOST_ICON_LABELS[icon]} a ${count} hosts selecionados`}>
        <HostIconPicker value={icon} onChange={setIcon} />
      </Field>
      <DraggableModal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            onSave(icon);
            onClose();
          }}
        >
          Aplicar
        </Button>
      </DraggableModal.ButtonRow>
    </DraggableModal>
  );
}
