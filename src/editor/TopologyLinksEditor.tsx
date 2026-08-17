import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Stack } from '@grafana/ui';
import { TopologyMap, TopologyPanelOptions } from '../types';
import { useTopologyMapEditor } from '../hooks/useTopologyMapEditor';
import { EditorLockBar } from './sections/EditorLockBar';
import { LinksSection } from './sections/LinksSection';

type Props = StandardEditorProps<TopologyMap, TopologyPanelOptions>;

/** Aba Links: cabos entre nós do mapa. */
export function TopologyLinksEditor(props: Props) {
  const {
    uid,
    locked,
    toggleLock,
    map,
    nodeOptions,
    updateLink,
    removeLink,
    addLink,
  } = useTopologyMapEditor(props);

  return (
    <Stack direction="column" gap={2}>
      <EditorLockBar locked={locked} onToggle={toggleLock} />
      <LinksSection
        uid={uid}
        locked={locked}
        links={map.links}
        nodeCount={map.nodes.length}
        nodeOptions={nodeOptions}
        onUpdate={updateLink}
        onRemove={removeLink}
        onAdd={addLink}
      />
    </Stack>
  );
}
