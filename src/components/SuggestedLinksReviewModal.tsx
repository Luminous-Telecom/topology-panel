import React, { useId } from 'react';
import { Button, Modal, Stack } from '@grafana/ui';
import { TopologyMap, TopologyNode, TopologySuggestedLink } from '../types';
import { findNodeById } from '../utils/topologyNodes';
import { FieldReadout } from './FieldReadout';

export interface NeighborDiscoveryReport {
  hostsScanned: number;
  neighborRecords: number;
  lldpAvailable: boolean;
  cdpAvailable: boolean;
  newSuggestions: number;
}

interface Props {
  map: TopologyMap;
  suggestions: TopologySuggestedLink[];
  report?: NeighborDiscoveryReport;
  loading?: boolean;
  loadError?: string;
  onConfirm: (id: string) => void;
  onIgnore: (id: string) => void;
  onConfirmAll: () => void;
  onClose: () => void;
}

function nodeLabel(nodes: TopologyNode[], id: string): string {
  return findNodeById(nodes, id)?.label?.trim() || id;
}

function confidenceLabel(confidence: TopologySuggestedLink['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'Alta';
    case 'medium':
      return 'Média';
    case 'low':
      return 'Baixa';
    case 'ambiguous':
      return 'Ambígua';
    default:
      return '—';
  }
}

export function SuggestedLinksReviewModal({
  map,
  suggestions,
  report,
  loading,
  loadError,
  onConfirm,
  onIgnore,
  onConfirmAll,
  onClose,
}: Props) {
  const uid = useId();
  const pending = suggestions.filter((s) => s.state === 'suggested');

  return (
    <Modal title="Links sugeridos (LLDP/CDP)" isOpen onDismiss={onClose}>
      {loadError ? (
        <div style={{ color: 'var(--error-text)', fontSize: 12, marginBottom: 8 }}>{loadError}</div>
      ) : null}

      {report ? (
        <FieldReadout label="Origem dos dados">
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div>
              Itens lidos do <strong>Zabbix</strong> (templates/LLD de cada host monitorado).
            </div>
            <div>Hosts analisados: {report.hostsScanned}</div>
            <div>Vizinhos encontrados: {report.neighborRecords}</div>
            <div>
              LLDP: {report.lldpAvailable ? 'disponível' : 'não encontrado'} · CDP:{' '}
              {report.cdpAvailable ? 'disponível' : 'não encontrado'}
            </div>
            {!report.lldpAvailable && !report.cdpAvailable ? (
              <div style={{ marginTop: 6, opacity: 0.85 }}>
                Nenhum item LLDP/CDP no Zabbix. Verifique se o template do host inclui discovery de
                vizinhança (SNMP) e se o LLD já rodou.
              </div>
            ) : null}
          </div>
        </FieldReadout>
      ) : null}

      {loading ? (
        <div style={{ fontSize: 12, opacity: 0.8 }}>Consultando Zabbix…</div>
      ) : pending.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          Nenhuma sugestão nova. Links existentes e ignorados não são recriados.
        </div>
      ) : (
        <Stack direction="column" gap={1}>
          {pending.map((sugg, idx) => (
            <div
              key={sugg.id}
              style={{
                border: '1px solid var(--border-weak)',
                borderRadius: 4,
                padding: 10,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {nodeLabel(map.nodes, sugg.fromNodeId)} ↔ {nodeLabel(map.nodes, sugg.toNodeId)}
              </div>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>
                {sugg.localPort ?? '—'} ↔ {sugg.remotePort ?? sugg.remoteSysName ?? '—'}
              </div>
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                {sugg.source.toUpperCase()} · confiança {confidenceLabel(sugg.confidence)}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Button size="sm" onClick={() => onConfirm(sugg.id)}>
                  Confirmar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onIgnore(sugg.id)}>
                  Ignorar
                </Button>
              </div>
            </div>
          ))}
        </Stack>
      )}

      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
        {pending.length > 1 ? (
          <Button onClick={onConfirmAll} disabled={loading || pending.length === 0}>
            Confirmar todos ({pending.length})
          </Button>
        ) : null}
      </Modal.ButtonRow>
    </Modal>
  );
}
