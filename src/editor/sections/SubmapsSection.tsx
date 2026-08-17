import React from 'react';
import { Button, CollapsableSection, Field, Icon, Input, Stack } from '@grafana/ui';
import { TopologyNode, TopologyQueryRefInfo } from '../../types';
import { DashboardPickerSelect } from '../../components/DashboardPickerSelect';
import { FieldReadout } from '../../components/FieldReadout';
import { QueryRefSelect } from '../../components/QueryRefSelect';

interface SubmapsSectionProps {
  uid: string;
  locked: boolean;
  submapNodes: TopologyNode[];
  queryRefInfos: TopologyQueryRefInfo[];
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
  openNodes,
  onToggleNode,
  onUpdate,
  onRemove,
  onAdd,
}: SubmapsSectionProps) {
  return (
    <FieldReadout label={`Submapas (${submapNodes.length})`} description="Atalhos para outros dashboards">
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
              <Field label="Dashboard" description={node.submapSlug ? `Slug: ${node.submapSlug}` : undefined}>
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
                label="Consulta Zabbix"
                description="Host group desta consulta alimenta a contagem de hosts do submapa"
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
