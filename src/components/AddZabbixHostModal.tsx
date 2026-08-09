import React, { useEffect, useMemo, useState } from 'react';
import { Button, Field, Modal, Select } from '@grafana/ui';
import { TopologyHostIcon, TopologyMap } from '../types';
import { HostIconPicker } from './HostIconPicker';
import { fetchZabbixHostsInGroupNames, ZabbixHostOption } from '../utils/zabbixApi';

interface Props {
  mode: 'add' | 'edit';
  datasourceUid?: string;
  /** Host groups definidos na aba Query do painel */
  zabbixGroupNames?: string[];
  storedMap: TopologyMap;
  /** Host Zabbix atual (modo editar) */
  initialVisibleName?: string;
  /** hostid Zabbix atual (modo editar) */
  initialHostId?: string;
  /** Ícone atual (modo editar) */
  initialIcon?: TopologyHostIcon;
  onConfirm: (visibleName: string, ip: string | undefined, icon: TopologyHostIcon, hostid: string) => void;
  onClose: () => void;
}

function hostsAlreadyOnMap(map: TopologyMap, exceptName?: string, exceptHostId?: string): {
  names: Set<string>;
  hostIds: Set<string>;
} {
  const names = new Set<string>();
  const hostIds = new Set<string>();
  const skipName = exceptName?.trim();
  const skipId = exceptHostId?.trim();
  for (const node of map.nodes) {
    if ((node.type ?? 'host') !== 'host') {
      continue;
    }
    const z = node.zabbixHost?.trim();
    const id = node.zabbixHostId?.trim();
    if (z && z !== skipName) {
      names.add(z);
    }
    if (id && id !== skipId) {
      hostIds.add(id);
    }
  }
  return { names, hostIds };
}

export function ZabbixHostPickerModal({
  mode,
  datasourceUid,
  zabbixGroupNames = [],
  storedMap,
  initialVisibleName,
  initialHostId,
  initialIcon,
  onConfirm,
  onClose,
}: Props) {
  const [hosts, setHosts] = useState<ZabbixHostOption[]>([]);
  const [hostName, setHostName] = useState<string | undefined>();
  const [icon, setIcon] = useState<TopologyHostIcon>(initialIcon ?? 'network');
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const groupNamesKey = zabbixGroupNames.join('\0');

  const onMap = useMemo(
    () =>
      hostsAlreadyOnMap(
        storedMap,
        mode === 'edit' ? initialVisibleName : undefined,
        mode === 'edit' ? initialHostId : undefined
      ),
    [storedMap, mode, initialVisibleName, initialHostId]
  );

  useEffect(() => {
    if (!datasourceUid) {
      setLoadError('Configure o UID do datasource Zabbix nas opções do painel.');
      setHosts([]);
      setHostName(undefined);
      return;
    }
    if (!zabbixGroupNames.length) {
      setLoadError('Configure um host group na query Zabbix do painel (aba Query).');
      setHosts([]);
      setHostName(undefined);
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
          setHostName(undefined);
          return;
        }
        setHosts(list);
        if (mode === 'edit') {
          const match =
            (initialHostId && list.find((host) => host.hostid === initialHostId)) ||
            (initialVisibleName && list.find((host) => host.visibleName === initialVisibleName));
          if (match) {
            setHostName(match.visibleName);
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Falha ao carregar hosts do Zabbix.');
          setHosts([]);
          setHostName(undefined);
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
  }, [datasourceUid, groupNamesKey, mode, initialVisibleName, initialHostId, zabbixGroupNames]);

  const hostOptions = hosts
    .filter((host) => !onMap.hostIds.has(host.hostid) && !onMap.names.has(host.visibleName))
    .map((host) => ({
      label: host.ip ? `${host.visibleName} (${host.ip})` : host.visibleName,
      value: host.visibleName,
    }));

  const selectedHost = hosts.find((host) => host.visibleName === hostName);
  const canConfirm = Boolean(hostName && selectedHost?.hostid);
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
                ? `Hosts do grupo ${groupHint} (query Zabbix). Vinculado pelo hostid — renomear não quebra o mapa.`
                : 'Vinculado pelo hostid do Zabbix (renomear não quebra o mapa)')
            }
          >
            <Select
              options={hostOptions}
              value={hostName}
              isLoading={loadingHosts}
              disabled={!zabbixGroupNames.length || loadingHosts}
              onChange={(v) => setHostName(v.value)}
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
            if (selectedHost?.hostid) {
              onConfirm(selectedHost.visibleName, selectedHost.ip, icon, selectedHost.hostid);
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
