import React from 'react';
import { Button } from '@grafana/ui';
import { TopologyModal } from './TopologyModal';
import { modalHintStyle } from './chrome/overlayChrome';
import { TopologyDashboardChoice, TopologyNode } from '../types';
import styles from './DashboardPickerModal.module.scss';

interface Props {
  node: TopologyNode;
  onClose: () => void;
  onSelect: (choice: TopologyDashboardChoice) => void;
}

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
        <div className={styles.list}>
          {choices.map((choice) => {
            const label = choice.title?.trim() || choice.uid;
            return (
              <button
                key={choice.uid}
                type="button"
                className={styles.item}
                onClick={() => onSelect(choice)}
              >
                <span>
                  <div className={styles.title}>{label}</div>
                  {choice.title?.trim() && choice.title.trim() !== choice.uid ? (
                    <div className={styles.uid}>{choice.uid}</div>
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
