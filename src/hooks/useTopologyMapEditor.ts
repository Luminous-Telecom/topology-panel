import { useCallback, useId, useMemo, useState } from 'react';
import { StandardEditorProps } from '@grafana/data';
import {
  TopologyLink,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
  defaultTopologyMap,
  parseTopologyJson,
  topologyToJson,
} from '../types';
import { activeChildMaps } from '../utils/childMapEdits';
import { inferLinkMedium } from '../utils/linkMedium';
import { findNodeById, isHostNode } from '../utils/topologyNodes';
import { LinkEditField } from '../editor/sections/LinksSection';

type EditorProps = StandardEditorProps<TopologyMap, TopologyPanelOptions>;

export function useTopologyMapEditor({ value, onChange, context }: EditorProps) {
  const uid = useId();
  const panelOptions = context.options;
  const map = value ?? panelOptions.map ?? defaultTopologyMap();
  const queryRefInfos = panelOptions.queryRefInfosAvailable ?? [];
  const locked = Boolean(map.locked);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState(() => topologyToJson(map));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({});

  const hostNodes = useMemo(() => map.nodes.filter((n) => isHostNode(n)), [map.nodes]);
  const submapNodes = useMemo(() => map.nodes.filter((n) => n.type === 'submap'), [map.nodes]);
  const childMapIds = useMemo(
    () => Object.keys(activeChildMaps(panelOptions.childMaps)).sort(),
    [panelOptions.childMaps]
  );
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

  const nodeOptions = useMemo(
    () =>
      map.nodes.map((n) => ({
        label: n.label?.trim() ? `${n.label.trim()} (${n.id})` : n.id,
        value: n.id,
      })),
    [map.nodes]
  );

  const openJsonMode = useCallback(() => {
    setJsonText(topologyToJson(map));
    setJsonMode(true);
  }, [map]);

  return {
    uid,
    map,
    locked,
    jsonMode,
    jsonText,
    jsonError,
    setJsonText,
    setJsonMode,
    queryRefInfos,
    hostNodes,
    submapNodes,
    childMapIds,
    dashboardPickerNodes,
    nodeOptions,
    openNodes,
    updateMap,
    toggleLock,
    toggleNodeOpen,
    addSubmap,
    addDashboardPicker,
    updateSubmap,
    removeSubmap,
    updateDashboardPicker,
    removeDashboardPicker,
    addLink,
    updateLink,
    removeLink,
    applyJson,
    openJsonMode,
  };
}
