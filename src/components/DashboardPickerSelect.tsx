import React, { useEffect, useMemo, useState } from 'react';
import { Select } from '@grafana/ui';
import {
  dashboardSelectOptions,
  fetchGrafanaDashboards,
  findDashboardOption,
  GrafanaDashboardOption,
} from '../utils/grafanaDashboards';

interface Props {
  value: string;
  onChange: (uid: string, slug?: string) => void;
  disabled?: boolean;
  /** Prefer dashboards com esta tag (ex.: topology) */
  tagHint?: string;
}

export function DashboardPickerSelect({ value, onChange, disabled, tagHint = 'topology,dude' }: Props) {
  const [dashboards, setDashboards] = useState<GrafanaDashboardOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchGrafanaDashboards().then((list) => {
      if (!cancelled) {
        setDashboards(list);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      options={options}
      value={value || null}
      isLoading={loading}
      disabled={disabled}
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
