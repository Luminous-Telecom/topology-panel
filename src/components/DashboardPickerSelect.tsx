import React, { useMemo } from 'react';
import { Select } from '@grafana/ui';
import { dashboardSelectOptions, findDashboardOption } from '../utils/grafanaDashboards';
import { useGrafanaDashboards } from '../hooks/useGrafanaDashboards';

interface Props {
  value: string;
  onChange: (uid: string, slug?: string) => void;
  disabled?: boolean;
  /** Prefer dashboards com esta tag (ex.: topology) */
  tagHint?: string;
  menuShouldPortal?: boolean;
  /** Associa o <Select> a um <Field label> externo (htmlFor) */
  inputId?: string;
}

export function DashboardPickerSelect({
  value,
  onChange,
  disabled,
  tagHint = 'topology,dude',
  menuShouldPortal = true,
  inputId,
}: Props) {
  const { dashboards, loading } = useGrafanaDashboards();

  const options = useMemo(() => {
    const base = dashboardSelectOptions(dashboards, tagHint);
    const selected = findDashboardOption(dashboards, value);
    if (selected && !base.some((o) => o.value === selected.uid)) {
      return [...base, { value: selected.uid, label: `${selected.title} (atual)`, description: selected.uid }];
    }
    return base;
  }, [dashboards, tagHint, value]);

  return (
    <Select
      inputId={inputId}
      options={options}
      value={value || null}
      isLoading={loading}
      disabled={disabled}
      menuShouldPortal={menuShouldPortal}
      placeholder="Selecionar dashboard…"
      noOptionsMessage="Nenhum dashboard encontrado"
      onChange={(v) => {
        const uid = v?.value ?? '';
        const dash = findDashboardOption(dashboards, uid);
        onChange(uid, dash?.slug);
      }}
    />
  );
}
