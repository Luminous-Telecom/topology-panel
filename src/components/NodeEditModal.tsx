import React, { useState } from 'react';
import { Button, ColorPickerInput, Field, InlineSwitch, Input, Modal } from '@grafana/ui';
import { TopologyHostIcon, TopologyNode } from '../types';
import { DashboardPickerSelect } from './DashboardPickerSelect';
import { HostIconPicker } from './HostIconPicker';
import { HOST_ICON_LABELS } from '../utils/hostIcons';

interface Props {
  node: TopologyNode;
  onSave: (patch: Partial<TopologyNode>) => void;
  onClose: () => void;
}

export function NodeEditModal({ node, onSave, onClose }: Props) {
  const [label, setLabel] = useState(node.label ?? '');
  const [subtitle, setSubtitle] = useState(node.subtitle ?? '');
  const [submapUid, setSubmapUid] = useState(node.submapUid ?? '');
  const [submapSlug, setSubmapSlug] = useState(node.submapSlug ?? '');
  const [includeInParentStats, setIncludeInParentStats] = useState(
    node.includeInParentStats !== false && node.showStatusStats !== false
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

  const type = node.type ?? 'host';
  const isHost = type === 'host';
  const title =
    type === 'submap'
      ? 'Submapa'
      : type === 'static'
        ? 'Estático'
        : type === 'network'
          ? 'Rede'
          : node.zabbixHost
            ? 'Host Zabbix'
            : 'Dispositivo';

  return (
    <Modal title={title} isOpen onDismiss={onClose}>
      {node.zabbixHost && (
        <Field label="Host Zabbix">
          <Input value={node.zabbixHost} disabled />
        </Field>
      )}
      {!node.zabbixHost && (
        <Field label="Nome exibido">
          <Input value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
        </Field>
      )}
      {!node.zabbixHost && (
        <Field label="Subtítulo / IP">
          <Input value={subtitle} onChange={(e) => setSubtitle(e.currentTarget.value)} />
        </Field>
      )}
      {node.zabbixHost && node.subtitle && (
        <Field label="IP">
          <Input value={node.subtitle} disabled />
        </Field>
      )}
      {isHost && (
        <Field label="Tipo / ícone" description={`Ícone: ${HOST_ICON_LABELS[icon]}`}>
          <HostIconPicker value={icon} onChange={setIcon} />
        </Field>
      )}
      {isHost && (
        <>
          <Field
            label="Usuário (Tools)"
            description="Winbox / SSH / Telnet — vazio usa o padrão do painel (Acesso remoto)"
          >
            <Input
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
              value={submapUid}
              onChange={(uid, slug) => {
                setSubmapUid(uid);
                if (slug) {
                  setSubmapSlug(slug);
                }
              }}
            />
          </Field>
          <Field
            label="Incluir submapas internos"
            description="Desative para monitorar só os hosts deste dashboard, ignorando submapas dentro dele (ex.: outra rede)"
          >
            <InlineSwitch
              label={includeInParentStats ? 'Ativado' : 'Desativado'}
              value={includeInParentStats}
              onChange={(e) => setIncludeInParentStats(e.currentTarget.checked)}
            />
          </Field>
          <Field label="Largura (px)" description="Vazio = automático pelo texto">
            <Input type="number" value={width} onChange={(e) => setWidth(e.currentTarget.value)} placeholder="Automático" />
          </Field>
          <Field label="Altura (px)" description="Vazio = automático pelo texto">
            <Input type="number" value={height} onChange={(e) => setHeight(e.currentTarget.value)} placeholder="Automático" />
          </Field>
        </>
      )}
      {type === 'static' && (
        <>
          <Field label="Largura (px)" description="Vazio = automático pelo texto">
            <Input type="number" value={width} onChange={(e) => setWidth(e.currentTarget.value)} placeholder="Automático" />
          </Field>
          <Field label="Altura (px)" description="Vazio = automático pelo texto">
            <Input type="number" value={height} onChange={(e) => setHeight(e.currentTarget.value)} placeholder="Automático" />
          </Field>
          <Field label="Tamanho da fonte (px)" description="Vazio = padrão do painel">
            <Input type="number" value={fontSize} onChange={(e) => setFontSize(e.currentTarget.value)} placeholder="Padrão do painel" />
          </Field>
          <Field label="Cor de fundo" description="Vazio = cor estático do painel (Aparência)">
            <ColorPickerInput
              value={fillColor}
              onChange={setFillColor}
              returnColorAs="hex"
              placeholder="Padrão do painel"
            />
          </Field>
          <Field label="Cor do texto" description="Vazio = contraste automático sobre o fundo">
            <ColorPickerInput
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
          <Field label="Largura (px)">
            <Input type="number" value={width || String(node.width ?? 220)} onChange={(e) => setWidth(e.currentTarget.value)} />
          </Field>
          <Field label="Altura (px)">
            <Input type="number" value={height || String(node.height ?? 140)} onChange={(e) => setHeight(e.currentTarget.value)} />
          </Field>
          <Field label="Cor de preenchimento (opcional)" description="Ex: rgba(96,96,96,0.22)">
            <Input value={fillColor} onChange={(e) => setFillColor(e.currentTarget.value)} placeholder="Padrão do painel" />
          </Field>
          <Field label="Cor da borda (opcional)">
            <Input value={borderColor} onChange={(e) => setBorderColor(e.currentTarget.value)} placeholder="Padrão do painel" />
          </Field>
        </>
      )}
      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            const patch: Partial<TopologyNode> = {
              label: node.zabbixHost ? node.label : label,
              subtitle: node.zabbixHost ? node.subtitle : subtitle,
              submapUid: type === 'submap' ? submapUid : undefined,
              submapSlug: type === 'submap' ? submapSlug : undefined,
              zabbixHost: node.zabbixHost,
              icon: isHost ? icon : undefined,
            };
            if (isHost) {
              // Sempre envia as chaves para poder limpar credencial antiga
              patch.toolUsername = toolUsername.trim();
              patch.toolPassword = toolPassword;
            }
            if (type === 'network') {
              patch.width = Math.max(60, Number(width) || 220);
              patch.height = Math.max(40, Number(height) || 140);
              patch.fillColor = fillColor.trim() || undefined;
              patch.borderColor = borderColor.trim() || undefined;
            }
            if (type === 'submap') {
              patch.width = width.trim() ? Math.max(40, Number(width) || 40) : undefined;
              patch.height = height.trim() ? Math.max(24, Number(height) || 24) : undefined;
              // Só persiste false; true/omitido = inclui no pai (padrão)
              patch.includeInParentStats = includeInParentStats ? undefined : false;
              // Limpa flag legada se existir
              patch.showStatusStats = undefined;
            }
            if (type === 'static') {
              patch.width = width.trim() ? Math.max(24, Number(width) || 24) : undefined;
              patch.height = height.trim() ? Math.max(20, Number(height) || 20) : undefined;
              patch.fontSize = fontSize.trim() ? Math.max(8, Number(fontSize) || 8) : undefined;
              patch.fillColor = fillColor.trim() || undefined;
              patch.labelColor = labelColor.trim() || undefined;
            }
            onSave(patch);
            onClose();
          }}
        >
          Salvar
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
}
