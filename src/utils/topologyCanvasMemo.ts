import { HostDisplayMap, HostMetadataMap, LinkRuntimeMetricsMap, TopologyMap, TopologyPanelOptions, TopologyView } from '../types';
import { HostProblemsMap } from '../utils/noc/types';
import { QueryHostOption } from './queryHostPicker';
import { TopologyBreadcrumbItem } from './topologyMapNavigation';

/** Props de dados do canvas — callbacks `on*` não entram (trocam de identidade sem mudar o desenho). */
export interface TopologyCanvasMemoProps {
  map: TopologyMap;
  storedMap: TopologyMap;
  options: TopologyPanelOptions;
  queryHostOptions?: QueryHostOption[];
  hostDisplay?: HostDisplayMap;
  hostDisplayByRefId?: Record<string, HostDisplayMap>;
  queryReady?: boolean;
  queryError?: boolean;
  queryLoading?: boolean;
  hostMetadata?: HostMetadataMap;
  submapHosts?: Record<string, string[] | null | undefined>;
  refreshIntervalSec?: number | null;
  zabbixDatasourceUid?: string;
  linkPaintMetricsByLink?: LinkRuntimeMetricsMap;
  hostProblems?: HostProblemsMap;
  hideOverlayControls?: boolean;
  savedView?: TopologyView;
  mapNavigationKey?: string;
  mapNavigationBreadcrumb?: TopologyBreadcrumbItem[];
  canMapNavigateBack?: boolean;
  canMapNavigateForward?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
}

const DATA_PROP_KEYS: (keyof TopologyCanvasMemoProps)[] = [
  'map',
  'storedMap',
  'options',
  'queryHostOptions',
  'hostDisplay',
  'hostDisplayByRefId',
  'queryReady',
  'queryError',
  'queryLoading',
  'hostMetadata',
  'submapHosts',
  'refreshIntervalSec',
  'zabbixDatasourceUid',
  'linkPaintMetricsByLink',
  'hostProblems',
  'hideOverlayControls',
  'savedView',
  'mapNavigationKey',
  'mapNavigationBreadcrumb',
  'canMapNavigateBack',
  'canMapNavigateForward',
  'canUndo',
  'canRedo',
];

export function topologyCanvasPropsEqual(
  prev: TopologyCanvasMemoProps,
  next: TopologyCanvasMemoProps
): boolean {
  for (const key of DATA_PROP_KEYS) {
    if (!Object.is(prev[key], next[key])) {
      return false;
    }
  }
  return true;
}
