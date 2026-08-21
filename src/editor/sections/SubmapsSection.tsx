import React from 'react';
import { Button, CollapsableSection, Field, Icon, Input, Select, Stack } from '@grafana/ui';
import { TopologyNode, TopologyQueryRefInfo } from '../../types';
import { DashboardPickerSelect } from '../../components/DashboardPickerSelect';
import { FieldReadout } from '../../components/FieldReadout';
import { QueryRefSelect } from '../../components/QueryRefSelect';

interface SubmapsSectionProps {
  uid: string;
  locked: boolean;
  submapNodes: TopologyNode[];
  queryRefInfos: TopologyQueryRefInfo[];
  childMapIds?: string[];
  openNodes: Record<string, boolean>;
  onToggleNode: (nodeId: string, open: boolean) => void;
  onUpdate: (index: number, patch: Partial<TopologyNode>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

/** Submapas: atalho para outro dashboard, com a consulta que alimenta a contagem de hosts. */
export function SubmapsSection({
  uid,
  locked,
  submapNodes,
  queryRefInfos,
  childMapIds = [],
  openNodes,
  onToggleNode,
  onUpdate,
  onRemove,
  onAdd,
}: SubmapsSectionProps) {
  return (
    <FieldReadout label={`Submapas (${submapNodes.length})`} description="Mapas internos ou atalhos para outros dashboards">
      <Stack direction="column" gap={1}>
        {submapNodes.map((node, idx) => (
          <CollapsableSection
            key={node.id}
            label={
              <span>
                <Icon name="external-link-alt" style={{ marginRight: 6 }} />
                {node.label?.trim() ?? ''}
              </span>
            }
            isOpen={openNodes[node.id] ?? false}
            onToggle={(open) => onToggleNode(node.id, open)}
          >
            <Stack direction="column" gap={1}>
              <Field label="ID interno">
                <Input
                  id={`${uid}-submap-${idx}-id`}
                  value={node.id}
                  disabled={locked}
                  onChange={(e) => onUpdate(idx, { id: e.currentTarget.value })}
                />
              </Field>
              <Field label="Nome exibido">
                <Input
                  id={`${uid}-submap-${idx}-label`}
                  value={node.label ?? ''}
                  disabled={locked}
                  onChange={(e) => onUpdate(idx, { label: e.currentTarget.value })}
                />
              </Field>
              <Field label="Mapa interno" description="Navega dentro do painel (prioridade sobre dashboard externo)">
                <Select
                  inputId={`${uid}-submap-${idx}-child-map`}
                  value={node.submapChildMapId ?? ''}
                  disabled={locked}
                  options={[
                    { label: '— Nenhum —', value: '' },
                    ...childMapIds.map((id) => ({ label: id, value: id })),
                  ]}
                  onChange={(opt) =>
                    onUpdate(idx, { submapChildMapId: opt?.value?.trim() || undefined })
                  }
                />
              </Field>
              <Field label="Dashboard externo" description={node.submapSlug ? `Slug: ${node.submapSlug}` : undefined}>
                <DashboardPickerSelect
                  inputId={`${uid}-submap-${idx}-dashboard`}
                  value={node.submapUid ?? ''}
                  disabled={locked}
                  onChange={(nextUid, slug) =>
                    onUpdate(idx, {
                      submapUid: nextUid || undefined,
                      submapSlug: slug || nextUid || undefined,
                    })
                  }
                />
              </Field>
              <Field
                label="Grupo Zabbix"
                description="Este grupo alimenta a contagem de hosts do submapa"
              >
                <QueryRefSelect
                  inputId={`${uid}-submap-${idx}-query`}
                  value={node.queryRefId ?? ''}
                  queryRefs={queryRefInfos}
                  disabled={locked}
                  onChange={(refId) => onUpdate(idx, { queryRefId: refId.trim().toUpperCase() || undefined })}
                />
              </Field>
              <Button variant="destructive" size="sm" disabled={locked} onClick={() => onRemove(idx)}>
                Remover submapa
              </Button>
            </Stack>
          </CollapsableSection>
        ))}
        <Button onClick={onAdd} disabled={locked}>
          + Adicionar submapa
        </Button>
      </Stack>
    </FieldReadout>
  );
}
