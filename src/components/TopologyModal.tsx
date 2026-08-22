import React from 'react';
import { Modal } from '@grafana/ui';
import { grafanaModalClass, grafanaModalContentClass } from './overlayChrome';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Modal padrão do painel — mesma casca (largura, padding, cantos) em todos os diálogos.
 * O rodapé continua `TopologyModal.ButtonRow` (o `Modal.ButtonRow` do Grafana).
 */
function TopologyModalComponent({ title, onClose, children }: Props) {
  return (
    <Modal
      title={title}
      isOpen
      onDismiss={onClose}
      className={grafanaModalClass}
      contentClassName={grafanaModalContentClass}
    >
      {children}
    </Modal>
  );
}

export const TopologyModal = Object.assign(TopologyModalComponent, {
  ButtonRow: Modal.ButtonRow,
});
