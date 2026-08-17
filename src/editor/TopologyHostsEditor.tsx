import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Stack } from '@grafana/ui';
import { TopologyMap, TopologyPanelOptions } from '../types';
import { useTopologyMapEditor } from '../hooks/useTopologyMapEditor';
import { EditorLockBar } from './sections/EditorLockBar';
import { HostNodesSection } from './sections/HostNodesSection';

type Props = StandardEditorProps<TopologyMap, TopologyPanelOptions>;

/** Aba Hosts Zabbix: lista dos hosts importados da Query. */
export function TopologyHostsEditor(props: Props) {
  const { locked, toggleLock, hostNodes } = useTopologyMapEditor(props);

  return (
    <Stack direction="column" gap={2}>
      <EditorLockBar locked={locked} onToggle={toggleLock} />
      <HostNodesSection hostNodes={hostNodes} />
    </Stack>
  );
}
