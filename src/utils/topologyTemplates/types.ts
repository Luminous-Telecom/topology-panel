import { TopologyHostIcon, TopologyLinkMedium, TopologyNodeType } from '../../types';

/** Campo exibido no card do host conforme o template. */
export type NodeTemplateFieldKind =
  | 'name'
  | 'ip'
  | 'status'
  | 'traffic'
  | 'cpu'
  | 'memory'
  | 'temperature'
  | 'problems'
  | 'uplinks'
  | 'onuCount'
  | 'bgp';

/** Template visual de um host — define ícone e linhas de detalhe. */
export interface TopologyNodeTemplate {
  id: string;
  name: string;
  icon?: TopologyHostIcon;
  fields: NodeTemplateFieldKind[];
}

export type TemplateRuleCondition =
  | 'hostGroupContains'
  | 'tagEquals'
  | 'hostnameContains'
  | 'hostnameMatches';

/** Regra que associa hosts a um template automaticamente. */
export interface TopologyTemplateRule {
  id: string;
  name?: string;
  templateId: string;
  condition: TemplateRuleCondition;
  /** Para `tagEquals`: `tag=valor` ou só `tag`. Demais condições: texto livre. */
  value: string;
  /** Menor número = maior prioridade. */
  priority?: number;
}

/** Papel em um modelo de topologia (ex.: core, switch, olt). */
export interface TopologyBlueprintRole {
  role: string;
  label: string;
  type: TopologyNodeType;
  icon?: TopologyHostIcon;
  nodeTemplateId?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface TopologyBlueprintLink {
  fromRole: string;
  toRole: string;
  medium?: TopologyLinkMedium;
}

/** Modelo completo de mapa (POP, backbone, etc.). */
export interface TopologyBlueprint {
  id: string;
  name: string;
  description?: string;
  networkBox?: {
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  roles: TopologyBlueprintRole[];
  links?: TopologyBlueprintLink[];
}

export const TEMPLATE_RULE_CONDITION_LABELS: Record<TemplateRuleCondition, string> = {
  hostGroupContains: 'Grupo Zabbix contém',
  tagEquals: 'Tag do host',
  hostnameContains: 'Hostname contém',
  hostnameMatches: 'Hostname (regex)',
};

export const NODE_TEMPLATE_FIELD_LABELS: Record<NodeTemplateFieldKind, string> = {
  name: 'Nome',
  ip: 'IP',
  status: 'Status',
  traffic: 'Tráfego',
  cpu: 'CPU',
  memory: 'RAM',
  temperature: 'Temperatura',
  problems: 'Problemas',
  uplinks: 'Uplinks',
  onuCount: 'ONUs',
  bgp: 'BGP',
};
