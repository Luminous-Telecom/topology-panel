import React, { useId } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Button, Field, IconButton, Input, Select, Stack } from '@grafana/ui';
import { TopologyPanelOptions, TopologyTemplateRule } from '../types';
import { mergeNodeTemplates, mergeTemplateRules } from '../utils/topologyTemplates/resolveTemplates';
import { TEMPLATE_RULE_CONDITION_LABELS } from '../utils/topologyTemplates/types';

type Props = StandardEditorProps<TopologyTemplateRule[] | undefined, TopologyPanelOptions>;

function newRuleId(): string {
  return `rule-${Date.now().toString(36)}`;
}

export function TopologyTemplatesEditor({ value, onChange, context }: Props) {
  const uid = useId();
  const customRules = value ?? [];
  const templates = mergeNodeTemplates(context.options.nodeTemplates);
  const rules = mergeTemplateRules(customRules);

  const updateCustomRules = (nextCustom: TopologyTemplateRule[]) => {
    onChange(nextCustom.length ? nextCustom : undefined);
  };

  const addRule = () => {
    updateCustomRules([
      ...customRules,
      {
        id: newRuleId(),
        name: 'Nova regra',
        templateId: templates[0]?.id ?? 'generic',
        condition: 'hostnameContains',
        value: '',
        priority: 50,
      },
    ]);
  };

  const updateRule = (id: string, patch: Partial<TopologyTemplateRule>) => {
    updateCustomRules(customRules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRule = (id: string) => {
    updateCustomRules(customRules.filter((r) => r.id !== id));
  };

  const templateOptions = templates.map((t) => ({ label: t.name, value: t.id }));
  const conditionOptions = (
    Object.keys(TEMPLATE_RULE_CONDITION_LABELS) as Array<keyof typeof TEMPLATE_RULE_CONDITION_LABELS>
  ).map((key) => ({ label: TEMPLATE_RULE_CONDITION_LABELS[key], value: key }));

  return (
    <Stack gap={2}>
      <div style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.85 }}>
        Templates padrão (Router, OLT, Switch, etc.) já vêm embutidos. Adicione regras para associar
        hosts automaticamente por grupo Zabbix, tag ou hostname.
      </div>

      <Field label="Templates de host disponíveis">
        <div style={{ fontSize: 12, opacity: 0.9 }}>{templates.map((t) => t.name).join(' · ')}</div>
      </Field>

      <Field label="Regras personalizadas">
        <Stack gap={1}>
          {customRules.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.75 }}>Nenhuma regra personalizada — só as padrão.</div>
          ) : null}
          {customRules.map((rule) => (
            <div
              key={rule.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) minmax(120px,1fr) minmax(0,1.2fr) auto',
                gap: 8,
                alignItems: 'end',
              }}
            >
              <Field label="Nome">
                <Input
                  id={`${uid}-rule-name-${rule.id}`}
                  value={rule.name ?? ''}
                  onChange={(e) => updateRule(rule.id, { name: e.currentTarget.value })}
                />
              </Field>
              <Field label="Condição">
                <Select
                  inputId={`${uid}-rule-cond-${rule.id}`}
                  options={conditionOptions}
                  value={rule.condition}
                  onChange={(v) => {
                    if (v?.value) {
                      updateRule(rule.id, { condition: v.value });
                    }
                  }}
                />
              </Field>
              <Field label="Valor">
                <Input
                  id={`${uid}-rule-val-${rule.id}`}
                  value={rule.value}
                  placeholder="ex.: OLT ou device_type=router"
                  onChange={(e) => updateRule(rule.id, { value: e.currentTarget.value })}
                />
              </Field>
              <IconButton
                name="trash-alt"
                tooltip="Remover regra"
                variant="secondary"
                onClick={() => removeRule(rule.id)}
              />
              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1fr) 80px',
                  gap: 8,
                }}
              >
                <Field label="Template">
                  <Select
                    inputId={`${uid}-rule-tpl-${rule.id}`}
                    options={templateOptions}
                    value={rule.templateId}
                    onChange={(v) => {
                      if (v?.value) {
                        updateRule(rule.id, { templateId: v.value });
                      }
                    }}
                  />
                </Field>
                <Field label="Prioridade">
                  <Input
                    id={`${uid}-rule-pri-${rule.id}`}
                    type="number"
                    value={rule.priority ?? 50}
                    onChange={(e) => {
                      const n = Number(e.currentTarget.value);
                      updateRule(rule.id, { priority: Number.isFinite(n) ? n : 50 });
                    }}
                  />
                </Field>
              </div>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addRule}>
            Adicionar regra
          </Button>
        </Stack>
      </Field>

      <Field label="Regras ativas (padrão + personalizadas)">
        <div style={{ fontSize: 11, lineHeight: 1.6, opacity: 0.85 }}>
          {rules.map((r) => (
            <div key={r.id}>
              {r.name ?? r.id}: {TEMPLATE_RULE_CONDITION_LABELS[r.condition]} «{r.value}» →{' '}
              {templates.find((t) => t.id === r.templateId)?.name ?? r.templateId}
            </div>
          ))}
        </div>
      </Field>
    </Stack>
  );
}
