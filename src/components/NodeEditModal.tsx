import React, { useEffect, useId, useMemo, useState } from 'react';
import { Button, ColorPickerInput, Field, Input, Modal, Select } from '@grafana/ui';
import {
  TopologyDashboardChoice,
  TopologyHostIcon,
  TopologyMap,
  TopologyNode,
  TopologyQueryRefInfo,
} from '../types';
import { DashboardMultiSelect } from './DashboardMultiSelect';
import { DashboardPickerSelect } from './DashboardPickerSelect';
import { QueryRefSelect } from './QueryRefSelect';
import { HostIconPicker } from './HostIconPicker';
import { FieldReadout } from './FieldReadout';
import { HOST_ICON_LABELS } from '../utils/hostIcons';
import {
  hostsAlreadyOnMap,
  isIpv4,
  queryHostPickerOptions,
  QueryHostOption,
  resolveHostIp,
  resolveQueryHostOptionForNode,
} from '../utils';

const ipReadoutStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 14,
};

export interface NodeEditSavePayload {
  patch: Partial<TopologyNode>;
  rebind?: {
    visibleName: string;
    ip: string;
    icon: TopologyHostIcon;
  };
}

interface Props {
  node: TopologyNode;
  queryRefInfos?: TopologyQueryRefInfo[];
  queryHostOptions?: QueryHostOption[];
  storedMap?: TopologyMap;
  onSave: (payload: NodeEditSavePayload) => void;
  onClose: () => void;
}

function hostSelectValue(node: TopologyNode): string | undefined {
  const ip = resolveHostIp(node);
  if (ip) {
    return ip;
  }
  return node.zabbixHost?.trim() || node.label?.trim() || undefined;
}

export function NodeEditModal({
  node,
  queryRefInfos = [],
  queryHostOptions = [],
  storedMap,
  onSave,
  onClose,
}: Props) {
  const uid = useId();
  const [label, setLabel] = useState(node.label ?? '');
  const [subtitle, setSubtitle] = useState(node.subtitle ?? '');
  const [submapUid, setSubmapUid] = useState(node.submapUid ?? '');
  const [submapSlug, setSubmapSlug] = useState(node.submapSlug ?? '');
  const [queryRefId, setQueryRefId] = useState(node.queryRefId ?? '');
  const [dashboardChoices, setDashboardChoices] = useState<TopologyDashboardChoice[]>(
    node.dashboardChoices ?? []
  );
  const [icon, setIcon] = useState<TopologyHostIcon>(node.icon ?? 'network');
  const [width, setWidth] = useState(node.width !== undefined ? String(node.width) : '');
  const [height, setHeight] = useState(node.height !== undefined ? String(node.height) : '');
  const [fontSize, setFontSize] = useState(node.fontSize !== undefined ? String(node.fontSize) : '');
  const [fillColor, setFillColor] = useState(node.fillColor ?? '');
  const [labelColor, setLabelColor] = useState(node.labelColor ?? '');
  const [borderColor, setBorderColor] = useState(node.borderColor ?? '');
  const [toolUsername, setToolUsername] = useState(node.toolUsername ?? '');
  const [toolPassword, setToolPassword] = useState(node.toolPassword ?? '');
  const [selectedHostKey, setSelectedHostKey] = useState<string | undefined>(hostSelectValue(node));

  const type = node.type ?? 'host';
  const isHost = type === 'host';
  const isZabbixHost = isHost && Boolean(node.zabbixHost?.trim());
  const nodeIp = resolveHostIp(node);

  const onMap = useMemo(() => {
    if (!storedMap) {
      return { ips: new Set<string>(), names: new Set<string>() };
    }
    return hostsAlreadyOnMap(storedMap, nodeIp, node.zabbixHost);
  }, [node.zabbixHost, nodeIp, storedMap]);

  const boundQueryHost = useMemo(
    () => resolveQueryHostOptionForNode(queryHostOptions, node),
    [node, queryHostOptions]
  );

  useEffect(() => {
    if (!isZabbixHost) {
      return;
    }
    const match = resolveQueryHostOptionForNode(queryHostOptions, node);
    if (match) {
      setSelectedHostKey(match.ip ?? match.visibleName);
    }
  }, [isZabbixHost, node, queryHostOptions]);

  const queryHostSelectOptions = useMemo(
    () => queryHostPickerOptions(queryHostOptions, onMap, boundQueryHost),
    [boundQueryHost, onMap, queryHostOptions]
  );

  const selectedQueryHost =
    queryHostOptions.find((host) => host.ip === selectedHostKey || host.visibleName === selectedHostKey) ??
    boundQueryHost;
  const displayIp = selectedQueryHost?.ip ?? nodeIp;
  const queryLoadError = queryHostOptions.length
    ? null
    : 'Nenhum host na Query do painel. Configure a aba Query e aguarde os dados.';

  const title =
    type === 'submap'
      ? 'Propriedades do submapa'
      : type === 'dashboard_picker'
        ? 'Propriedades do seletor'
        : type === 'static'
          ? 'Propriedades do estático'
          : type === 'network'
            ? 'Propriedades da rede'
            : 'Propriedades do host';

  const handleSave = () => {
    if (isZabbixHost) {
      const ip = selectedQueryHost?.ip?.trim() || nodeIp;
      if (!ip || !isIpv4(ip)) {
        return;
      }
      const visibleName =
        selectedQueryHost?.visibleName ??
        (node.label?.trim() || node.zabbixHost?.trim() || ip);
      const payload: NodeEditSavePayload = {
        patch: {
          toolUsername: toolUsername.trim(),
          toolPassword,
        },
      };
      if (icon !== node.icon) {
        payload.patch.icon = icon;
      }
      const hostChanged =
        ip !== nodeIp ||
        visibleName !== (node.label?.trim() || node.zabbixHost?.trim());
      if (hostChanged) {
        payload.rebind = {
          visibleName,
          ip,
          icon,
        };
      }
      onSave(payload);
      onClose();
      return;
    }

    const patch: Partial<TopologyNode> = {
      label,
      subtitle: type === 'dashboard_picker' ? undefined : subtitle,
      submapUid: type === 'submap' ? submapUid : undefined,
      submapSlug: type === 'submap' ? submapSlug : undefined,
      icon: isHost ? icon : undefined,
    };
    if (isHost) {
      patch.toolUsername = toolUsername.trim();
      patch.toolPassword = toolPassword;
    }
    if (type === 'network') {
      patch.label = label.trim() || node.label;
      patch.width = Math.max(60, Number(width) || 220);
      patch.height = Math.max(40, Number(height) || 140);
      patch.fillColor = fillColor.trim() || undefined;
      patch.borderColor = borderColor.trim() || undefined;
    }
    if (type === 'submap') {
      patch.width = width.trim() ? Math.max(40, Number(width) || 40) : undefined;
      patch.height = height.trim() ? Math.max(24, Number(height) || 24) : undefined;
      patch.queryRefId = queryRefId.trim().toUpperCase() || undefined;
    }
    if (type === 'dashboard_picker') {
      patch.dashboardChoices = dashboardChoices.filter((c) => c.uid.trim());
      patch.width = width.trim() ? Math.max(40, Number(width) || 40) : undefined;
      patch.height = height.trim() ? Math.max(24, Number(height) || 24) : undefined;
      patch.fillColor = fillColor.trim() || undefined;
    }
    if (type === 'static') {
      patch.width = width.trim() ? Math.max(24, Number(width) || 24) : undefined;
      patch.height = height.trim() ? Math.max(20, Number(height) || 20) : undefined;
      patch.fontSize = fontSize.trim() ? Math.max(8, Number(fontSize) || 8) : undefined;
      patch.fillColor = fillColor.trim() || undefined;
      patch.labelColor = labelColor.trim() || undefined;
    }
    onSave({ patch });
    onClose();
  };

  const hostSelectionChanged = selectedHostKey !== hostSelectValue(node);
  const saveDisabled =
    isZabbixHost &&
    hostSelectionChanged &&
    (!selectedQueryHost?.ip || !isIpv4(selectedQueryHost.ip)) &&
    !nodeIp;

  return (
    <Modal title={title} isOpen onDismiss={onClose}>
      {isZabbixHost && (
        <>
          <Field
            label="Host Zabbix"
            description={
              queryLoadError ??
              'Hosts retornados pela Query do painel. Vinculado pelo IP nos labels da série.'
            }
          >
            <Select
              inputId={`${uid}-host`}
              options={queryHostSelectOptions}
              value={selectedHostKey}
              disabled={!queryHostOptions.length}
              onChange={(v) => setSelectedHostKey(v.value)}
              placeholder={
                queryHostSelectOptions.length
                  ? 'Selecione o host'
                  : 'Nenhum host disponível na Query'
              }
            />
          </Field>
          {displayIp ? (
            <FieldReadout label="IP">
              <div style={ipReadoutStyle}>{displayIp}</div>
            </FieldReadout>
          ) : null}
        </>
      )}
      {!isZabbixHost && type !== 'dashboard_picker' && (
        <Field label="Nome exibido">
          <Input id={`${uid}-label`} value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
        </Field>
      )}
      {!isZabbixHost && isHost && (
        <Field label="Subtítulo / IP">
          <Input id={`${uid}-subtitle`} value={subtitle} onChange={(e) => setSubtitle(e.currentTarget.value)} />
        </Field>
      )}
      {isHost && (
        <FieldReadout label="Tipo / ícone" description={`Ícone: ${HOST_ICON_LABELS[icon]}`}>
          <HostIconPicker value={icon} onChange={setIcon} />
        </FieldReadout>
      )}
      {isHost && (
        <>
          <Field
            label="Usuário (Tools)"
            description="Winbox / SSH / Telnet — vazio usa o padrão do painel (Acesso remoto)"
          >
            <Input
              id={`${uid}-tool-username`}
              value={toolUsername}
              onChange={(e) => setToolUsername(e.currentTarget.value)}
              placeholder="Padrão do painel"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Senha (Tools)"
            description="Abre Winbox já autenticado. Fica salva no JSON do mapa."
          >
            <Input
              id={`${uid}-tool-password`}
              type="password"
              value={toolPassword}
              onChange={(e) => setToolPassword(e.currentTarget.value)}
              placeholder="Padrão do painel"
              autoComplete="new-password"
            />
          </Field>
        </>
      )}
      {type === 'submap' && (
        <>
          <Field
            label="Dashboard"
            description={submapSlug ? `Slug: ${submapSlug}` : 'Selecione o dashboard de destino do submapa'}
          >
            <DashboardPickerSelect
              inputId={`${uid}-submap-dashboard`}
              value={submapUid}
              onChange={(nextUid, slug) => {
                setSubmapUid(nextUid);
                if (slug) {
                  setSubmapSlug(slug);
                }
              }}
            />
          </Field>
          <Field
            label="Consulta Zabbix"
            description="Consulta deste painel cujo host group define os hosts monitorados deste submapa"
          >
            <QueryRefSelect
              inputId={`${uid}-submap-query`}
              value={queryRefId}
              queryRefs={queryRefInfos}
              onChange={setQueryRefId}
            />
          </Field>
          <Field label="Largura (px)" description="Vazio = automático pelo texto">
            <Input
              id={`${uid}-submap-width`}
              type="number"
              value={width}
              onChange={(e) => setWidth(e.currentTarget.value)}
              placeholder="Automático"
            />
          </Field>
          <Field label="Altura (px)" description="Vazio = automático pelo texto">
            <Input
              id={`${uid}-submap-height`}
              type="number"
              value={height}
              onChange={(e) => setHeight(e.currentTarget.value)}
              placeholder="Automático"
            />
          </Field>
        </>
      )}
      {type === 'dashboard_picker' && (
        <>
          <Field
            label="Dashboards disponíveis"
            description="Dashboards que aparecem ao clicar neste botão no mapa"
          >
            <DashboardMultiSelect
              inputId={`${uid}-picker-dashboards`}
              value={dashboardChoices}
              onChange={setDashboardChoices}
            />
          </Field>
          <Field label="Largura (px)" description="Vazio = automático pelo texto">
            <Input
              id={`${uid}-picker-width`}
              type="number"
              value={width}
              onChange={(e) => setWidth(e.currentTarget.value)}
              placeholder="Automático"
            />
          </Field>
          <Field label="Altura (px)" description="Vazio = automático pelo texto">
            <Input
              id={`${uid}-picker-height`}
              type="number"
              value={height}
              onChange={(e) => setHeight(e.currentTarget.value)}
              placeholder="Automático"
            />
          </Field>
          <Field label="Cor de fundo" description="Vazio = cor submapa do painel (Aparência)">
            <ColorPickerInput
              id={`${uid}-picker-fill-color`}
              value={fillColor}
              onChange={setFillColor}
              returnColorAs="hex"
              placeholder="Padrão do painel"
            />
          </Field>
        </>
      )}
      {type === 'static' && (
        <>
          <Field label="Largura (px)" description="Vazio = automático pelo texto">
            <Input
              id={`${uid}-static-width`}
              type="number"
              value={width}
              onChange={(e) => setWidth(e.currentTarget.value)}
              placeholder="Automático"
            />
          </Field>
          <Field label="Altura (px)" description="Vazio = automático pelo texto">
            <Input
              id={`${uid}-static-height`}
              type="number"
              value={height}
              onChange={(e) => setHeight(e.currentTarget.value)}
              placeholder="Automático"
            />
          </Field>
          <Field label="Tamanho da fonte (px)" description="Vazio = padrão do painel">
            <Input
              id={`${uid}-static-font-size`}
              type="number"
              value={fontSize}
              onChange={(e) => setFontSize(e.currentTarget.value)}
              placeholder="Padrão do painel"
            />
          </Field>
          <Field label="Cor de fundo" description="Vazio = cor estático do painel (Aparência)">
            <ColorPickerInput
              id={`${uid}-static-fill-color`}
              value={fillColor}
              onChange={setFillColor}
              returnColorAs="hex"
              placeholder="Padrão do painel"
            />
          </Field>
          <Field label="Cor do texto" description="Vazio = contraste automático sobre o fundo">
            <ColorPickerInput
              id={`${uid}-static-label-color`}
              value={labelColor}
              onChange={setLabelColor}
              returnColorAs="hex"
              placeholder="Automático"
            />
          </Field>
        </>
      )}
      {type === 'network' && (
        <>
          <Field label="Nome">
            <Input id={`${uid}-network-label`} value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
          </Field>
          <Field label="Largura (px)">
            <Input
              id={`${uid}-network-width`}
              type="number"
              value={width || String(node.width ?? 220)}
              onChange={(e) => setWidth(e.currentTarget.value)}
            />
          </Field>
          <Field label="Altura (px)">
            <Input
              id={`${uid}-network-height`}
              type="number"
              value={height || String(node.height ?? 140)}
              onChange={(e) => setHeight(e.currentTarget.value)}
            />
          </Field>
          <Field label="Cor de preenchimento (opcional)" description="Ex: rgba(96,96,96,0.22)">
            <Input
              id={`${uid}-network-fill-color`}
              value={fillColor}
              onChange={(e) => setFillColor(e.currentTarget.value)}
              placeholder="Padrão do painel"
            />
          </Field>
          <Field label="Cor da borda (opcional)">
            <Input
              id={`${uid}-network-border-color`}
              value={borderColor}
              onChange={(e) => setBorderColor(e.currentTarget.value)}
              placeholder="Padrão do painel"
            />
          </Field>
        </>
      )}
      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={saveDisabled} onClick={handleSave}>
          Salvar
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
}
