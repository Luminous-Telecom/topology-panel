import React from 'react';
import { Button, Modal } from '@grafana/ui';
import { css } from '@emotion/css';
import { TopologyDashboardChoice, TopologyNode } from '../types';

interface Props {
  node: TopologyNode;
  onClose: () => void;
  onSelect: (choice: TopologyDashboardChoice) => void;
}

const listStyle = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(60vh, 420px);
  overflow-y: auto;
  padding: 4px 0;
`;

const itemStyle = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: 4px;
  border: 1px solid rgba(204, 204, 220, 0.25);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
  &:hover {
    background: rgba(110, 159, 255, 0.12);
    border-color: rgba(110, 159, 255, 0.45);
  }
`;

const titleStyle = css`
  font-weight: 600;
`;

const uidStyle = css`
  font-size: 11px;
  opacity: 0.65;
  margin-top: 2px;
`;

export function openDashboardUrl(uid: string, slug?: string): void {
  const safeUid = uid.trim();
  if (!safeUid) {
    return;
  }
  const pathSlug = (slug?.trim() || safeUid).replace(/^\/+|\/+$/g, '');
  const orgMatch = window.location.search.match(/orgId=\d+/);
  const qs = orgMatch ? `?${orgMatch[0]}` : '';
  window.location.href = `/d/${safeUid}/${pathSlug}${qs}`;
}

export function DashboardPickerModal({ node, onClose, onSelect }: Props) {
  const choices = (node.dashboardChoices ?? []).filter((c) => c.uid?.trim());
  const title = node.label?.trim() || 'Selecionar dashboard';

  return (
    <Modal title={title} isOpen onDismiss={onClose}>
      {choices.length === 0 ? (
        <p style={{ margin: '8px 0 16px', opacity: 0.8 }}>
          Nenhum dashboard configurado neste seletor. Edite as propriedades do botão para incluir dashboards.
        </p>
      ) : (
        <div className={listStyle}>
          {choices.map((choice) => {
            const label = choice.title?.trim() || choice.uid;
            return (
              <button
                key={choice.uid}
                type="button"
                className={itemStyle}
                onClick={() => onSelect(choice)}
              >
                <span>
                  <div className={titleStyle}>{label}</div>
                  {choice.title?.trim() && choice.title.trim() !== choice.uid ? (
                    <div className={uidStyle}>{choice.uid}</div>
                  ) : null}
                </span>
                <span aria-hidden>↗</span>
              </button>
            );
          })}
        </div>
      )}
      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
}
