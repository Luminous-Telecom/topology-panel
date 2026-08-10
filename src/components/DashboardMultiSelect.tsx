import React, { useMemo } from 'react';
import { MultiSelect } from '@grafana/ui';
import { TopologyDashboardChoice } from '../types';
import { dashboardSelectOptions, findDashboardOption } from '../utils/grafanaDashboards';
import { useGrafanaDashboards } from '../hooks/useGrafanaDashboards';

interface Props {
  value: TopologyDashboardChoice[];
  onChange: (choices: TopologyDashboardChoice[]) => void;
  disabled?: boolean;
  /** Prefer dashboards com esta tag (ex.: topology) */
  tagHint?: string;
  menuShouldPortal?: boolean;
}

export function DashboardMultiSelect({
  value,
  onChange,
  disabled,
  tagHint = 'topology,dude',
  menuShouldPortal = true,
}: Props) {
  const { dashboards, loading } = useGrafanaDashboards();

  const options = useMemo(() => {
    const base = dashboardSelectOptions(dashboards, tagHint);
    const missing = value
      .filter((c) => c.uid && !base.some((o) => o.value === c.uid))
      .map((c) => {
        const found = findDashboardOption(dashboards, c.uid);
        return {
          value: c.uid,
          label: found?.title ?? c.title ?? c.uid,
          description: c.uid,
        };
      });
    return [...base, ...missing];
  }, [dashboards, tagHint, value]);

  const selected = useMemo(
    () =>
      value
        .map((c) => options.find((o) => o.value === c.uid))
        .filter((o): o is NonNullable<typeof o> => Boolean(o)),
    [options, value]
  );

  return (
    <MultiSelect
      options={options}
      value={selected}
      isLoading={loading}
      disabled={disabled}
      menuShouldPortal={menuShouldPortal}
      placeholder="Selecionar dashboards…"
      noOptionsMessage="Nenhum dashboard encontrado"
      closeMenuOnSelect={false}
      onChange={(vals) => {
        const next: TopologyDashboardChoice[] = (vals ?? []).map((v) => {
          const uid = v.value ?? '';
          const dash = findDashboardOption(dashboards, uid);
          const prev = value.find((c) => c.uid === uid);
          return {
            uid,
            slug: dash?.slug ?? prev?.slug,
            title: dash?.title ?? prev?.title ?? v.label,
          };
        });
        onChange(next.filter((c) => c.uid.trim()));
      }}
    />
  );
}
