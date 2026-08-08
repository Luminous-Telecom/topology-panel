import React, { useState } from 'react';
import { Button, Field, Modal } from '@grafana/ui';
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
    <Modal title={`Alterar tipo (${count} hosts)`} isOpen onDismiss={onClose}>
      <Field label="Tipo / ícone" description={`Aplicar ${HOST_ICON_LABELS[icon]} a ${count} hosts selecionados`}>
        <HostIconPicker value={icon} onChange={setIcon} />
      </Field>
      <Modal.ButtonRow>
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
      </Modal.ButtonRow>
    </Modal>
  );
}
