import React, { useMemo } from 'react';
import { SelectableValue } from '@grafana/data';
import { MultiSelect } from '@grafana/ui';
import { useZabbixHostGroups } from '../hooks/useZabbixHostGroups';
import { resolveCatalogGroupName, uniqueGroupNames } from '../utils/queryHosts';

interface Props {
  value: string[];
  onChange: (groups: string[]) => void;
  datasourceUid?: string;
  disabled?: boolean;
  menuShouldPortal?: boolean;
  /** Associa o <Select> a um <Field label> externo (htmlFor) */
  inputId?: string;
}

/** MultiSelect de grupos Zabbix para vincular o submapa ao status. */
export function QueryRefSelect({
  value,
  onChange,
  datasourceUid,
  disabled,
  menuShouldPortal = true,
  inputId,
}: Props) {
  const { groups, loading, loadError } = useZabbixHostGroups(datasourceUid);
  const selected = useMemo(() => uniqueGroupNames(value), [value]);

  const options = useMemo(() => {
    const names = new Set([...groups, ...selected]);
    const items: Array<SelectableValue<string>> = [...names]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((name) => ({
        value: name,
        label: name,
        description: groups.some((group) => group.toUpperCase() === name.toUpperCase())
          ? undefined
          : 'Não encontrado no Zabbix',
      }));
    return items;
  }, [groups, selected]);

  const selectValue = useMemo(
    () => selected.map((name) => resolveCatalogGroupName(name, groups) ?? name),
    [groups, selected]
  );

  if (!datasourceUid) {
    return (
      <span id={inputId} style={{ fontSize: 12, opacity: 0.75 }}>
        Escolha o datasource Zabbix em Fonte de dados.
      </span>
    );
  }

  return (
    <>
      <MultiSelect
        inputId={inputId}
        options={options}
        value={selectValue}
        disabled={disabled}
        isLoading={loading}
        menuShouldPortal={menuShouldPortal}
        placeholder="Selecionar grupos…"
        noOptionsMessage="Nenhum grupo disponível"
        onChange={(items) => {
          const next = uniqueGroupNames(items.map((item) => item.value ?? '').filter(Boolean));
          onChange(next);
        }}
      />
      {loadError ? <span style={{ fontSize: 11, opacity: 0.85 }}>{loadError}</span> : null}
    </>
  );
}
