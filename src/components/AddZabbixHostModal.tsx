import React, { useEffect, useMemo, useState } from 'react';
import { Button, Field, Modal, Select } from '@grafana/ui';
import { TopologyHostIcon, TopologyMap } from '../types';
import { HostIconPicker } from './HostIconPicker';
import { isIpv4, resolveHostIp } from '../utils';
import { fetchZabbixHostsInGroupNames, ZabbixHostOption } from '../utils/zabbixApi';

interface Props {
  mode: 'add' | 'edit';
  datasourceUid?: string;
  /** Host groups definidos na aba Query do painel */
  zabbixGroupNames?: string[];
  storedMap: TopologyMap;
  /** Host Zabbix atual (modo editar) */
  initialVisibleName?: string;
  /** IP Zabbix atual (modo editar) */
  initialIp?: string;
  /** Ícone atual (modo editar) */
  initialIcon?: TopologyHostIcon;
  onConfirm: (visibleName: string, ip: string, icon: TopologyHostIcon) => void;
  onClose: () => void;
}

function hostsAlreadyOnMap(map: TopologyMap, exceptIp?: string, exceptName?: string): {
  ips: Set<string>;
  names: Set<string>;
} {
  const ips = new Set<string>();
  const names = new Set<string>();
  const skipIp = exceptIp?.trim();
  const skipName = exceptName?.trim();
  for (const node of map.nodes) {
    if ((node.type ?? 'host') !== 'host') {
      continue;
    }
    const ip = resolveHostIp(node);
    if (ip && ip !== skipIp) {
      ips.add(ip);
    }
    const z = node.zabbixHost?.trim();
    if (z && !isIpv4(z) && z !== skipName) {
      names.add(z);
    }
  }
  return { ips, names };
}

export function ZabbixHostPickerModal({
  mode,
  datasourceUid,
  zabbixGroupNames = [],
  storedMap,
  initialVisibleName,
  initialIp,
  initialIcon,
  onConfirm,
  onClose,
}: Props) {
  const [hosts, setHosts] = useState<ZabbixHostOption[]>([]);
  const [hostKey, setHostKey] = useState<string | undefined>();
  const [icon, setIcon] = useState<TopologyHostIcon>(initialIcon ?? 'network');
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const groupNamesKey = zabbixGroupNames.join('\0');

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
    if (!datasourceUid) {
      setLoadError('Configure o UID do datasource Zabbix nas opções do painel.');
      setHosts([]);
      setHostKey(undefined);
      return;
    }
    if (!zabbixGroupNames.length) {
      setLoadError('Configure um host group na query Zabbix do painel (aba Query).');
      setHosts([]);
      setHostKey(undefined);
      return;
    }
    let cancelled = false;
    setLoadingHosts(true);
    setLoadError(null);
    fetchZabbixHostsInGroupNames(datasourceUid, zabbixGroupNames)
      .then((list) => {
        if (cancelled) {
          return;
        }
        if (!list.length) {
          setLoadError(`Nenhum host encontrado no grupo Zabbix: ${zabbixGroupNames.join(', ')}.`);
          setHosts([]);
          setHostKey(undefined);
          return;
        }
        setHosts(list);
        if (mode === 'edit') {
          const ip = initialIp?.trim();
          const match =
            (ip && isIpv4(ip) && list.find((host) => host.ip === ip)) ||
            (initialVisibleName && list.find((host) => host.visibleName === initialVisibleName));
          if (match) {
            setHostKey(match.ip ?? match.visibleName);
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Falha ao carregar hosts do Zabbix.');
          setHosts([]);
          setHostKey(undefined);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingHosts(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [datasourceUid, groupNamesKey, mode, initialVisibleName, initialIp, zabbixGroupNames]);

  const hostOptions = hosts
    .filter((host) => {
      if (host.ip && onMap.ips.has(host.ip)) {
        return false;
      }
      return !onMap.names.has(host.visibleName);
    })
    .map((host) => ({
      label: host.ip ? `${host.visibleName} (${host.ip})` : host.visibleName,
      value: host.ip ?? host.visibleName,
    }));

  const selectedHost = hosts.find((host) => host.ip === hostKey || host.visibleName === hostKey);
  const canConfirm = Boolean(selectedHost?.ip && isIpv4(selectedHost.ip));
  const title = mode === 'edit' ? 'Editar host Zabbix' : 'Adicionar host Zabbix';
  const confirmLabel = mode === 'edit' ? 'Salvar' : 'Adicionar';
  const groupHint = zabbixGroupNames.length ? zabbixGroupNames.join(', ') : undefined;

  return (
    <Modal title={title} isOpen onDismiss={onClose}>
      {!datasourceUid ? (
        <p>Configure o datasource Zabbix nas opções do painel.</p>
      ) : (
        <>
          <Field
            label="Host"
            description={
              loadError ??
              (groupHint
                ? `Hosts do grupo ${groupHint} (query Zabbix). Vinculado pelo IP da interface principal.`
                : 'Vinculado pelo IP da interface principal no Zabbix.')
            }
          >
            <Select
              options={hostOptions}
              value={hostKey}
              isLoading={loadingHosts}
              disabled={!zabbixGroupNames.length || loadingHosts}
              onChange={(v) => setHostKey(v.value)}
              placeholder={
                loadingHosts
                  ? 'Carregando hosts…'
                  : hostOptions.length
                    ? 'Selecione o host'
                    : 'Nenhum host disponível neste grupo'
              }
            />
          </Field>
          {selectedHost?.ip ? (
            <Field label="IP">
              <span>{selectedHost.ip}</span>
            </Field>
          ) : null}
          <Field label="Tipo / ícone">
            <HostIconPicker value={icon} onChange={setIcon} />
          </Field>
        </>
      )}
      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={!canConfirm}
          onClick={() => {
            const ip = selectedHost?.ip?.trim();
            if (selectedHost && ip && isIpv4(ip)) {
              onConfirm(selectedHost.visibleName, ip, icon);
              onClose();
            }
          }}
        >
          {confirmLabel}
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
}
