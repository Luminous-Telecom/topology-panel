import React, { useEffect, useId, useMemo, useState } from 'react';
import { Button, Field, Input, Modal, Select, useTheme2 } from '@grafana/ui';
import { TopologyHostIcon, TopologyMap } from '../types';
import { HostIconPicker } from './HostIconPicker';
import { FieldReadout } from './FieldReadout';
import { isIpv4 } from '../utils/ipv4';
import { hostsAlreadyOnMap, QueryHostOption, queryHostPickerOptions } from '../utils/queryHostPicker';

const ipReadoutStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 14,
};

interface Props {
  mode: 'add' | 'edit';
  queryHostOptions?: QueryHostOption[];
  storedMap: TopologyMap;
  /** Host Zabbix atual (modo editar) */
  initialVisibleName?: string;
  /** IP Zabbix atual (modo editar) */
  initialIp?: string;
  /** Ícone atual (modo editar) */
  initialIcon?: TopologyHostIcon;
  /** Aguardando IP da API Zabbix (interface principal). */
  zabbixMetadataLoading?: boolean;
  onConfirm: (visibleName: string, ip: string, icon: TopologyHostIcon) => void;
  onClose: () => void;
}

export function ZabbixHostPickerModal({
  mode,
  queryHostOptions = [],
  storedMap,
  initialVisibleName,
  initialIp,
  initialIcon,
  zabbixMetadataLoading = false,
  onConfirm,
  onClose,
}: Props) {
  const theme = useTheme2();
  const uid = useId();
  const [hostKey, setHostKey] = useState<string | undefined>();
  const [manualIp, setManualIp] = useState('');
  const [icon, setIcon] = useState<TopologyHostIcon>(initialIcon ?? 'network');

  const onMap = useMemo(
    () =>
      hostsAlreadyOnMap(
        storedMap,
        mode === 'edit' ? initialIp : undefined,
        mode === 'edit' ? initialVisibleName : undefined
      ),
    [storedMap, mode, initialVisibleName, initialIp]
  );

  useEffect(() => {
    if (mode !== 'edit') {
      return;
    }
    const ip = initialIp?.trim();
    const match =
      (ip && isIpv4(ip) && queryHostOptions.find((host) => host.ip === ip)) ||
      (initialVisibleName &&
        queryHostOptions.find((host) => host.visibleName === initialVisibleName));
    if (match) {
      setHostKey(match.ip ?? match.visibleName);
    }
  }, [mode, initialVisibleName, initialIp, queryHostOptions]);

  useEffect(() => {
    setManualIp('');
  }, [hostKey]);

  const hostOptions = queryHostPickerOptions(queryHostOptions, onMap);

  const selectedHost = queryHostOptions.find(
    (host) => host.ip === hostKey || host.visibleName === hostKey
  );
  const autoIp =
    selectedHost?.ip?.trim() ||
    (hostKey && isIpv4(hostKey) ? hostKey.trim() : undefined);
  const manualIpTrimmed = manualIp.trim();
  const resolvedIp = autoIp || (isIpv4(manualIpTrimmed) ? manualIpTrimmed : undefined);
  const canConfirm = Boolean(resolvedIp && isIpv4(resolvedIp));
  const title = mode === 'edit' ? 'Editar host Zabbix' : 'Adicionar host Zabbix';
  const confirmLabel = mode === 'edit' ? 'Salvar' : 'Adicionar';
  const loadError = !queryHostOptions.length
    ? 'Nenhum host na Query do painel. Configure a aba Query e aguarde os dados.'
    : !hostOptions.length
      ? 'Todos os hosts da Query já estão no mapa.'
      : null;
  const needsManualIp = Boolean(hostKey && !autoIp && !zabbixMetadataLoading);
  const waitingForZabbixIp = Boolean(hostKey && !autoIp && zabbixMetadataLoading);

  return (
    <Modal title={title} isOpen onDismiss={onClose}>
      <Field
        label="Host"
        description={
          loadError ??
          'Hosts retornados pela Query do painel. O IP vem da interface principal no Zabbix.'
        }
      >
        <Select
          inputId={`${uid}-host`}
          options={hostOptions}
          value={hostKey}
          disabled={!queryHostOptions.length}
          onChange={(v) => setHostKey(v.value)}
          placeholder={
            hostOptions.length ? 'Selecione o host' : 'Nenhum host disponível na Query'
          }
        />
      </Field>
      {autoIp ? (
        <FieldReadout label="IP">
          <div style={ipReadoutStyle}>{autoIp}</div>
        </FieldReadout>
      ) : waitingForZabbixIp ? (
        <FieldReadout label="IP">
          <div style={{ fontSize: 13, opacity: 0.8 }}>Buscando IP no Zabbix…</div>
        </FieldReadout>
      ) : needsManualIp ? (
        <Field
          label="IP"
          description="O Zabbix não retornou o IP deste host. Informe o IP da interface principal."
        >
          <Input
            id={`${uid}-manual-ip`}
            width={20}
            value={manualIp}
            onChange={(e) => setManualIp(e.currentTarget.value)}
            placeholder="Ex.: 10.0.0.1"
          />
        </Field>
      ) : null}
      {needsManualIp && manualIpTrimmed && !isIpv4(manualIpTrimmed) ? (
        <FieldReadout label="IP">
          <div style={{ color: theme.colors.error.text, fontSize: 13 }}>Informe um IPv4 válido.</div>
        </FieldReadout>
      ) : null}
      <FieldReadout label="Tipo / ícone">
        <HostIconPicker value={icon} onChange={setIcon} />
      </FieldReadout>
      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={!canConfirm}
          onClick={() => {
            const ip = resolvedIp?.trim();
            if (!ip || !isIpv4(ip)) {
              return;
            }
            const visibleName = selectedHost?.visibleName ?? ip;
            onConfirm(visibleName, ip, icon);
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
}
