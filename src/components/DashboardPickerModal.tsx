import React from 'react';
import { Button } from '@grafana/ui';
import { TopologyModal } from './TopologyModal';
import { modalHintStyle } from './overlayChrome';
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

/**
 * Navega para um dashboard. Sempre envia var-mapa=<uid> para o valor da
 * variável bater com o destino (evita redirect: ex. Portalegre → Potiretama
 * quando o current salvo no JSON do dashboard está errado).
 */
/** UID de dashboard do Grafana: alfanumérico + `_`/`-` (nunca contém `/`, `?`, `#`). */
const DASHBOARD_UID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function openDashboardUrl(uid: string, slug?: string, navVar = 'mapa'): void {
  const safeUid = uid.trim();
  if (!safeUid || !DASHBOARD_UID_PATTERN.test(safeUid)) {
    return;
  }
  const pathSlug = encodeURIComponent((slug?.trim() || safeUid).replace(/^\/+|\/+$/g, ''));
  const params = new URLSearchParams();
  const orgMatch = window.location.search.match(/orgId=(\d+)/);
  if (orgMatch) {
    params.set('orgId', orgMatch[1]);
  }
  const varName = navVar.trim() || 'mapa';
  params.set(`var-${varName}`, safeUid);
  const qs = params.toString() ? `?${params.toString()}` : '';
  window.location.href = `/d/${safeUid}/${pathSlug}${qs}`;
}

export function DashboardPickerModal({ node, onClose, onSelect }: Props) {
  const choices = (node.dashboardChoices ?? []).filter((c) => c.uid?.trim());
  const title = node.label?.trim() || 'Selecionar dashboard';

  return (
    <TopologyModal title={title} onClose={onClose}>
      {choices.length === 0 ? (
        <p className={modalHintStyle}>
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
      <TopologyModal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </TopologyModal.ButtonRow>
    </TopologyModal>
  );
}
