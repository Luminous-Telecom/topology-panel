import React from 'react';
import { Button, CollapsableSection, Field, Icon, Input, Stack } from '@grafana/ui';
import { TopologyNode } from '../../types';
import { DashboardMultiSelect } from '../../components/DashboardMultiSelect';
import { FieldReadout } from '../../components/FieldReadout';

interface DashboardPickersSectionProps {
  uid: string;
  locked: boolean;
  pickerNodes: TopologyNode[];
  openNodes: Record<string, boolean>;
  onToggleNode: (nodeId: string, open: boolean) => void;
  onUpdate: (index: number, patch: Partial<TopologyNode>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

/** Botão no mapa que abre uma lista configurável de dashboards. */
export function DashboardPickersSection({
  uid,
  locked,
  pickerNodes,
  openNodes,
  onToggleNode,
  onUpdate,
  onRemove,
  onAdd,
}: DashboardPickersSectionProps) {
  return (
    <FieldReadout
      label={`Seletores de dashboards (${pickerNodes.length})`}
      description="Botão no mapa com lista configurável de dashboards para abrir"
    >
      <Stack direction="column" gap={1}>
        {pickerNodes.map((node, idx) => {
          const count = node.dashboardChoices?.length ?? 0;
          return (
            <CollapsableSection
              key={node.id}
              label={
                <span>
                  <Icon name="apps" style={{ marginRight: 6 }} />
                  {node.label?.trim() ?? ''}
                  {count > 0 ? ` (${count})` : ''}
                </span>
              }
              isOpen={openNodes[node.id] ?? false}
              onToggle={(open) => onToggleNode(node.id, open)}
            >
              <Stack direction="column" gap={1}>
                <Field label="Nome exibido">
                  <Input
                    id={`${uid}-picker-${idx}-label`}
                    value={node.label ?? ''}
                    disabled={locked}
                    onChange={(e) => onUpdate(idx, { label: e.currentTarget.value })}
                  />
                </Field>
                <Field label="Dashboards disponíveis" description="Aparecem ao clicar no botão no mapa">
                  <DashboardMultiSelect
                    inputId={`${uid}-picker-${idx}-dashboards`}
                    value={node.dashboardChoices ?? []}
                    disabled={locked}
                    onChange={(choices) => onUpdate(idx, { dashboardChoices: choices })}
                  />
                </Field>
                <Button variant="destructive" size="sm" disabled={locked} onClick={() => onRemove(idx)}>
                  Remover seletor
                </Button>
              </Stack>
            </CollapsableSection>
          );
        })}
        <Button onClick={onAdd} disabled={locked}>
          + Adicionar seletor de dashboards
        </Button>
      </Stack>
    </FieldReadout>
  );
}
