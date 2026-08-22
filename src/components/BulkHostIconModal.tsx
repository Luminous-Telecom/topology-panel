import React, { useState } from 'react';
import { Button } from '@grafana/ui';
import { TopologyModal } from './TopologyModal';
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
    <TopologyModal title={`Alterar tipo (${count} hosts)`} onClose={onClose}>
      <FieldReadout label="Tipo / ícone" description={`Aplicar ${HOST_ICON_LABELS[icon]} a ${count} hosts selecionados`}>
        <HostIconPicker value={icon} onChange={setIcon} />
      </FieldReadout>
      <TopologyModal.ButtonRow>
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
      </TopologyModal.ButtonRow>
    </TopologyModal>
  );
}
