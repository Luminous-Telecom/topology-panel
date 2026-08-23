import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Stack } from '@grafana/ui';
import { TopologyMap, TopologyPanelOptions } from '../types';
import { useTopologyMapEditor } from '../hooks/useTopologyMapEditor';
import { DashboardPickersSection } from './sections/DashboardPickersSection';
import { EditorLockBar } from './sections/EditorLockBar';
import { SubmapsSection } from './sections/SubmapsSection';

type Props = StandardEditorProps<TopologyMap, TopologyPanelOptions>;

/** Aba Submapas: nós submapa e seletores de dashboard no mapa. */
export function TopologySubmapsEditor(props: Props) {
  const {
    uid,
    locked,
    toggleLock,
    submapNodes,
    datasourceUid,
    childMapIds,
    openNodes,
    toggleNodeOpen,
    updateSubmap,
    removeSubmap,
    addSubmap,
    dashboardPickerNodes,
    updateDashboardPicker,
    removeDashboardPicker,
    addDashboardPicker,
  } = useTopologyMapEditor(props);

  return (
    <Stack direction="column" gap={2}>
      <EditorLockBar locked={locked} onToggle={toggleLock} />
      <SubmapsSection
        uid={uid}
        locked={locked}
        submapNodes={submapNodes}
        datasourceUid={datasourceUid}
        childMapIds={childMapIds}
        openNodes={openNodes}
        onToggleNode={toggleNodeOpen}
        onUpdate={updateSubmap}
        onRemove={removeSubmap}
        onAdd={addSubmap}
      />
      <DashboardPickersSection
        uid={uid}
        locked={locked}
        pickerNodes={dashboardPickerNodes}
        openNodes={openNodes}
        onToggleNode={toggleNodeOpen}
        onUpdate={updateDashboardPicker}
        onRemove={removeDashboardPicker}
        onAdd={addDashboardPicker}
      />
    </Stack>
  );
}
