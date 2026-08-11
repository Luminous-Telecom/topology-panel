import React, { useState } from 'react';
import { Button, Modal } from '@grafana/ui';
import { TopologyHostIcon } from '../types';
import { HOST_ICON_LABELS } from '../utils/hostIcons';
import { HostIconPicker } from './HostIconPicker';
import { FieldReadout } from './FieldReadout';

interface Props {
  count: number;
  onSave: (icon: TopologyHostIcon) => void;
  onClose: () => void;
}

export function BulkHostIconModal({ count, onSave, onClose }: Props) {
  const [icon, setIcon] = useState<TopologyHostIcon>('network');

  return (
    <Modal title={`Alterar tipo (${count} hosts)`} isOpen onDismiss={onClose}>
      <FieldReadout label="Tipo / ícone" description={`Aplicar ${HOST_ICON_LABELS[icon]} a ${count} hosts selecionados`}>
        <HostIconPicker value={icon} onChange={setIcon} />
      </FieldReadout>
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
