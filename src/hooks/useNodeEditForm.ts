import { useCallback, useState } from 'react';
import { TopologyDashboardChoice, TopologyHostIcon, TopologyNode } from '../types';

/**
 * Campos do formulário de propriedades do nó. Medidas ficam como texto porque o `Input type=number`
 * devolve string e vazio significa "automático" — converter só na hora de salvar.
 */
export interface NodeEditFormValues {
  label: string;
  subtitle: string;
  submapUid: string;
  submapSlug: string;
  queryRefId: string;
  dashboardChoices: TopologyDashboardChoice[];
  icon: TopologyHostIcon;
  width: string;
  height: string;
  fontSize: string;
  fillColor: string;
  labelColor: string;
  borderColor: string;
  toolUsername: string;
  toolPassword: string;
}

export type NodeEditFormSetter = <K extends keyof NodeEditFormValues>(
  key: K,
  value: NodeEditFormValues[K]
) => void;

function numberField(value?: number): string {
  return value !== undefined ? String(value) : '';
}

export function initialNodeEditValues(node: TopologyNode): NodeEditFormValues {
  return {
    label: node.label ?? '',
    subtitle: node.subtitle ?? '',
    submapUid: node.submapUid ?? '',
    submapSlug: node.submapSlug ?? '',
    queryRefId: node.queryRefId ?? '',
    dashboardChoices: node.dashboardChoices ?? [],
    icon: node.icon ?? 'network',
    width: numberField(node.width),
    height: numberField(node.height),
    fontSize: numberField(node.fontSize),
    fillColor: node.fillColor ?? '',
    labelColor: node.labelColor ?? '',
    borderColor: node.borderColor ?? '',
    toolUsername: node.toolUsername ?? '',
    toolPassword: node.toolPassword ?? '',
  };
}

export function useNodeEditForm(node: TopologyNode) {
  const [values, setValues] = useState<NodeEditFormValues>(() => initialNodeEditValues(node));

  const set = useCallback<NodeEditFormSetter>((key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  return { values, set };
}
