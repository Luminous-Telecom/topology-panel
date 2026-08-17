import React, { useCallback, useId, useMemo, useState } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Alert, Button, Field, Input, Stack } from '@grafana/ui';
import {
  TopologyLink,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
  defaultTopologyMap,
  parseTopologyJson,
  topologyToJson,
} from '../types';
import { inferLinkMedium } from '../utils/linkMedium';
import { findNodeById, isHostNode } from '../utils/topologyNodes';
import { parseBandwidthInput, LinkBandwidthUnit } from '../utils/linkBandwidth';
import { DashboardPickersSection } from './sections/DashboardPickersSection';
import { EditorLockBar } from './sections/EditorLockBar';
import { HostNodesSection } from './sections/HostNodesSection';
import { LinkEditField, LinksSection } from './sections/LinksSection';
import { SubmapsSection } from './sections/SubmapsSection';
import { TopologyJsonEditor } from './sections/TopologyJsonEditor';

type Props = StandardEditorProps<TopologyMap, TopologyPanelOptions>;

export function TopologyEditor({ value, onChange, context }: Props) {
  const uid = useId();
  const map = value ?? defaultTopologyMap();
  const queryRefInfos = context.options.queryRefInfosAvailable ?? [];
  const locked = Boolean(map.locked);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState(() => topologyToJson(map));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({});

  const hostNodes = useMemo(() => map.nodes.filter((n) => isHostNode(n)), [map.nodes]);
  const submapNodes = useMemo(() => map.nodes.filter((n) => n.type === 'submap'), [map.nodes]);
  const dashboardPickerNodes = useMemo(
    () => map.nodes.filter((n) => n.type === 'dashboard_picker'),
    [map.nodes]
  );

  const updateMap = useCallback(
    (patch: Partial<TopologyMap>) => {
      if (locked && !Object.prototype.hasOwnProperty.call(patch, 'locked')) {
        return;
      }
      onChange({ ...map, ...patch });
    },
    [locked, map, onChange]
  );

  const toggleLock = useCallback(() => {
    onChange({ ...map, locked: !locked });
  }, [locked, map, onChange]);

  const toggleNodeOpen = useCallback((nodeId: string, open: boolean) => {
    setOpenNodes((prev) => ({ ...prev, [nodeId]: open }));
  }, []);

  /** Patch por índice dentro de uma sublista (submapas, seletores), aplicado no mapa inteiro. */
  const updateNodeInSection = useCallback(
    (section: TopologyNode[], index: number, patch: Partial<TopologyNode>) => {
      const target = section[index];
      if (!target) {
        return;
      }
      updateMap({
        nodes: map.nodes.map((n) => (n.id === target.id ? { ...n, ...patch } : n)),
      });
    },
    [map.nodes, updateMap]
  );

  /** Remover nó também remove os links presos nele — senão sobrariam cabos soltos no mapa. */
  const removeNodeInSection = useCallback(
    (section: TopologyNode[], index: number) => {
      const node = section[index];
      if (!node) {
        return;
      }
      updateMap({
        nodes: map.nodes.filter((n) => n.id !== node.id),
        links: map.links.filter((l) => l.from !== node.id && l.to !== node.id),
      });
    },
    [map.links, map.nodes, updateMap]
  );

  const addSubmap = useCallback(() => {
    const id = `submap-${submapNodes.length + 1}`;
    const node: TopologyNode = {
      id,
      label: `Submapa ${submapNodes.length + 1}`,
      type: 'submap',
      x: 400 + submapNodes.length * 40,
      y: 200,
    };
    updateMap({ nodes: [...map.nodes, node] });
    setOpenNodes((prev) => ({ ...prev, [id]: true }));
  }, [map.nodes, submapNodes.length, updateMap]);

  const addDashboardPicker = useCallback(() => {
    const id = `dashboard-picker-${dashboardPickerNodes.length + 1}`;
    const node: TopologyNode = {
      id,
      label: dashboardPickerNodes.length ? `Dashboards ${dashboardPickerNodes.length + 1}` : 'Dashboards',
      type: 'dashboard_picker',
      dashboardChoices: [],
      x: 400 + dashboardPickerNodes.length * 40,
      y: 280,
    };
    updateMap({ nodes: [...map.nodes, node] });
    setOpenNodes((prev) => ({ ...prev, [id]: true }));
  }, [dashboardPickerNodes.length, map.nodes, updateMap]);

  const updateSubmap = useCallback(
    (index: number, patch: Partial<TopologyNode>) => updateNodeInSection(submapNodes, index, patch),
    [submapNodes, updateNodeInSection]
  );

  const removeSubmap = useCallback(
    (index: number) => removeNodeInSection(submapNodes, index),
    [removeNodeInSection, submapNodes]
  );

  const updateDashboardPicker = useCallback(
    (index: number, patch: Partial<TopologyNode>) =>
      updateNodeInSection(dashboardPickerNodes, index, patch),
    [dashboardPickerNodes, updateNodeInSection]
  );

  const removeDashboardPicker = useCallback(
    (index: number) => removeNodeInSection(dashboardPickerNodes, index),
    [dashboardPickerNodes, removeNodeInSection]
  );

  const addLink = useCallback(() => {
    if (map.nodes.length < 2) {
      return;
    }
    const from = map.nodes[0];
    const to = map.nodes[1];
    updateMap({
      links: [...map.links, { from: from.id, to: to.id, medium: inferLinkMedium(from, to) }],
    });
  }, [map.nodes, map.links, updateMap]);

  const updateLink = useCallback(
    (index: number, field: LinkEditField, value: string) => {
      const links = map.links.map((l, i) => {
        if (i !== index) {
          return l;
        }
        if (field === 'medium') {
          const next: TopologyLink = { ...l, medium: value === 'radio' ? 'radio' : 'fiber' };
          return next;
        }
        if (field === 'bandwidthMbps') {
          const trimmed = value.trim();
          if (!trimmed) {
            const next = { ...l };
            delete next.bandwidthMbps;
            return next;
          }
          const [amount, unit] = trimmed.split(':');
          const bandwidthUnit: LinkBandwidthUnit = unit === 'mbps' ? 'mbps' : 'gbps';
          const mbps = parseBandwidthInput(amount, bandwidthUnit);
          if (!mbps) {
            const next = { ...l };
            delete next.bandwidthMbps;
            return next;
          }
          return { ...l, bandwidthMbps: mbps };
        }
        const next: TopologyLink = { ...l, [field]: value };
        const fromNode = findNodeById(map.nodes, field === 'from' ? value : l.from);
        const toNode = findNodeById(map.nodes, field === 'to' ? value : l.to);
        if (!l.medium) {
          next.medium = inferLinkMedium(fromNode, toNode);
        }
        return next;
      });
      updateMap({ links });
    },
    [map.links, map.nodes, updateMap]
  );

  const removeLink = useCallback(
    (index: number) => {
      updateMap({ links: map.links.filter((_, i) => i !== index) });
    },
    [map.links, updateMap]
  );

  const applyJson = useCallback(() => {
    const parsed = parseTopologyJson(jsonText);
    if (!parsed) {
      setJsonError('JSON inválido');
      return;
    }
    setJsonError(null);
    onChange(parsed);
    setJsonMode(false);
  }, [jsonText, onChange]);

  const nodeOptions = map.nodes.map((n) => ({
    label: n.label?.trim() ? `${n.label.trim()} (${n.id})` : n.id,
    value: n.id,
  }));

  if (jsonMode) {
    return (
      <Stack direction="column" gap={2}>
        <EditorLockBar locked={locked} onToggle={toggleLock} />
        <TopologyJsonEditor
          uid={uid}
          locked={locked}
          text={jsonText}
          error={jsonError}
          onTextChange={setJsonText}
          onApply={applyJson}
          onBack={() => setJsonMode(false)}
        />
      </Stack>
    );
  }

  return (
    <Stack direction="column" gap={2}>
      <EditorLockBar locked={locked} onToggle={toggleLock} />

      {locked && (
        <Alert title="Edição bloqueada" severity="warning">
          Posições, submapas e links estão travados. Clique no cadeado para destravar.
        </Alert>
      )}

      {!locked && (
        <Alert title="Edição no mapa" severity="info">
          Nome e IP dos hosts vêm do <strong>Zabbix</strong>. Posição: <strong>arraste</strong> no mapa (destravado).
          Botão direito para links e submapas.
        </Alert>
      )}

      <Field label="Largura do mapa">
        <Input
          id={`${uid}-map-width`}
          type="number"
          value={map.width}
          disabled={locked}
          onChange={(e) => {
            const width = Number(e.currentTarget.value);
            if (Number.isFinite(width) && width > 0) {
              updateMap({ width: Math.round(width) });
            }
          }}
        />
      </Field>
      <Field label="Altura do mapa">
        <Input
          id={`${uid}-map-height`}
          type="number"
          value={map.height}
          disabled={locked}
          onChange={(e) => {
            const height = Number(e.currentTarget.value);
            if (Number.isFinite(height) && height > 0) {
              updateMap({ height: Math.round(height) });
            }
          }}
        />
      </Field>

      <HostNodesSection hostNodes={hostNodes} />

      <SubmapsSection
        uid={uid}
        locked={locked}
        submapNodes={submapNodes}
        queryRefInfos={queryRefInfos}
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

      <Button
        variant="secondary"
        disabled={locked}
        onClick={() => {
          setJsonText(topologyToJson(map));
          setJsonMode(true);
        }}
      >
        Importar / exportar JSON
      </Button>
    </Stack>
  );
}
