import { NodeEditFormValues } from '../hooks/useNodeEditForm';
import { NodeEditSavePayload, TopologyNode } from '../types';
import { isIpv4 } from './ipv4';

/** Medida opcional: vazio significa "automático", então vira `undefined` em vez de zero. */
function optionalSize(raw: string, min: number): number | undefined {
  return raw.trim() ? Math.max(min, Number(raw) || min) : undefined;
}

function trimmedOrUndefined(raw: string): string | undefined {
  return raw.trim() || undefined;
}

/** Nome pelo qual o host aparece hoje no mapa — usado para detectar troca de host. */
function currentHostName(node: TopologyNode): string | undefined {
  return node.label?.trim() || node.zabbixHost?.trim();
}

export interface SelectedQueryHost {
  ip?: string;
  visibleName?: string;
}

/**
 * Traduz o formulário no payload de salvamento.
 *
 * Host vindo do Zabbix é o caso especial: o mapa não guarda label editável para ele, então só
 * mudam ícone e credenciais de Tools; trocar o host selecionado vira `rebind`. Devolve `null`
 * quando o host escolhido não tem IPv4 válido — salvar nesse estado quebraria o vínculo com a
 * Query.
 */
export function buildNodeEditPayload(
  node: TopologyNode,
  values: NodeEditFormValues,
  selectedQueryHost?: SelectedQueryHost,
  nodeIp?: string
): NodeEditSavePayload | null {
  const type = node.type ?? 'host';
  const isHost = type === 'host';
  const isZabbixHost = isHost && Boolean(node.zabbixHost?.trim());

  if (isZabbixHost) {
    const ip = selectedQueryHost?.ip?.trim() || nodeIp;
    if (!ip || !isIpv4(ip)) {
      return null;
    }
    const visibleName = selectedQueryHost?.visibleName ?? (currentHostName(node) || ip);
    const payload: NodeEditSavePayload = {
      patch: { toolUsername: values.toolUsername.trim(), toolPassword: values.toolPassword },
    };
    if (values.icon !== node.icon) {
      payload.patch.icon = values.icon;
    }
    if (ip !== nodeIp || visibleName !== currentHostName(node)) {
      payload.rebind = { visibleName, ip, icon: values.icon };
    }
    return payload;
  }

  const patch: Partial<TopologyNode> = {
    label: values.label,
    subtitle: type === 'dashboard_picker' ? undefined : values.subtitle,
    submapUid: type === 'submap' ? values.submapUid : undefined,
    submapSlug: type === 'submap' ? values.submapSlug : undefined,
    icon: isHost ? values.icon : undefined,
  };

  if (isHost) {
    patch.toolUsername = values.toolUsername.trim();
    patch.toolPassword = values.toolPassword;
  }
  if (type === 'network') {
    patch.label = values.label.trim() || node.label;
    patch.width = Math.max(60, Number(values.width) || 220);
    patch.height = Math.max(40, Number(values.height) || 140);
    patch.fillColor = trimmedOrUndefined(values.fillColor);
    patch.borderColor = trimmedOrUndefined(values.borderColor);
  }
  if (type === 'submap') {
    patch.width = optionalSize(values.width, 40);
    patch.height = optionalSize(values.height, 24);
    patch.queryRefId = trimmedOrUndefined(values.queryRefId.toUpperCase());
  }
  if (type === 'dashboard_picker') {
    patch.dashboardChoices = values.dashboardChoices.filter((choice) => choice.uid.trim());
    patch.width = optionalSize(values.width, 40);
    patch.height = optionalSize(values.height, 24);
    patch.fillColor = trimmedOrUndefined(values.fillColor);
  }
  if (type === 'static') {
    patch.width = optionalSize(values.width, 24);
    patch.height = optionalSize(values.height, 20);
    patch.fontSize = optionalSize(values.fontSize, 8);
    patch.fillColor = trimmedOrUndefined(values.fillColor);
    patch.labelColor = trimmedOrUndefined(values.labelColor);
  }

  return { patch };
}
