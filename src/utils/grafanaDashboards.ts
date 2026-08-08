import { SelectableValue } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';

export interface GrafanaDashboardOption {
  uid: string;
  title: string;
  slug: string;
  tags: string[];
}

interface GrafanaSearchHit {
  uid: string;
  title: string;
  url?: string;
  tags?: string[];
}

function slugFromDashboardUrl(url: string | undefined, uid: string): string {
  if (!url) {
    return uid;
  }
  const match = url.match(/\/d\/[^/]+\/([^/?]+)/);
  return match?.[1] ?? uid;
}

/** Lista dashboards Grafana (dash-db) para seleção de submapas. */
export async function fetchGrafanaDashboards(): Promise<GrafanaDashboardOption[]> {
  try {
    const items = await getBackendSrv().get<GrafanaSearchHit[]>('/api/search?type=dash-db&limit=500');
    return (items ?? [])
      .filter((d) => d.uid?.trim())
      .map((d) => ({
        uid: d.uid.trim(),
        title: d.title?.trim() || d.uid,
        slug: slugFromDashboardUrl(d.url, d.uid),
        tags: d.tags ?? [],
      }));
  } catch {
    return [];
  }
}

export function dashboardSelectOptions(
  dashboards: GrafanaDashboardOption[],
  tagHint?: string
): Array<SelectableValue<string>> {
  let list = dashboards;
  if (tagHint) {
    const tagged = dashboards.filter((d) => d.tags.includes(tagHint));
    if (tagged.length > 0) {
      list = tagged;
    }
  }

  return list
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
    .map((d) => ({
      value: d.uid,
      label: d.title,
      description: d.uid,
    }));
}

export function findDashboardOption(
  dashboards: GrafanaDashboardOption[],
  uid: string
): GrafanaDashboardOption | undefined {
  const key = uid.trim();
  if (!key) {
    return undefined;
  }
  return dashboards.find((d) => d.uid === key);
}
