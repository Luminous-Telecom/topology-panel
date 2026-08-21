import React, { useMemo } from 'react';
import { SelectableValue } from '@grafana/data';
import { Select } from '@grafana/ui';
import { TopologyQueryRefInfo } from '../types';
import { queryRefRowTitle } from '../utils/queryRefLabel';

interface Props {
  value: string;
  onChange: (refId: string) => void;
  queryRefs: TopologyQueryRefInfo[];
  disabled?: boolean;
  menuShouldPortal?: boolean;
  /** Associa o <Select> a um <Field label> externo (htmlFor) */
  inputId?: string;
}

function queryRefToOption(info: TopologyQueryRefInfo): SelectableValue<string> {
  return {
    value: info.refId,
    label: queryRefRowTitle(info.refId, info.hint),
    description: info.hint,
  };
}

/** Select de grupo Zabbix (refId virtual) para vincular submapas ao status ICMP. */
export function QueryRefSelect({
  value,
  onChange,
  queryRefs,
  disabled,
  menuShouldPortal = true,
  inputId,
}: Props) {
  const normalized = value.trim().toUpperCase();

  const options = useMemo(() => {
    const items: SelectableValue<string>[] = [{ value: '', label: 'Nenhuma' }];
    for (const info of queryRefs) {
      items.push(queryRefToOption(info));
    }
    if (normalized && !queryRefs.some((info) => info.refId === normalized)) {
      items.push({
        value: normalized,
        label: normalized,
        description: 'Não está entre os grupos configurados',
      });
    }
    return items;
  }, [queryRefs, normalized]);

  if (!queryRefs.length && !normalized) {
    return (
      <span id={inputId} style={{ fontSize: 12, opacity: 0.75 }}>
        Nenhum grupo detectado — configure os grupos de host em Fonte de dados.
      </span>
    );
  }

  return (
    <Select
      inputId={inputId}
      options={options}
      value={normalized || null}
      disabled={disabled}
      menuShouldPortal={menuShouldPortal}
      placeholder="Selecionar grupo…"
      noOptionsMessage="Nenhum grupo disponível"
      onChange={(v) => onChange(v?.value ?? '')}
    />
  );
}
