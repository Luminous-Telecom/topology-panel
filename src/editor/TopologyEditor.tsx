import React, { useCallback, useMemo, useState } from 'react';
import { StandardEditorProps } from '@grafana/data';
import {
  Alert,
  Button,
  CollapsableSection,
  Field,
  Icon,
  IconButton,
  Input,
  Select,
  TextArea,
  VerticalGroup,
  useTheme2,
} from '@grafana/ui';
import {
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
  defaultTopologyMap,
  parseTopologyJson,
  topologyToJson,
} from '../types';
import { inferLinkMedium } from '../utils';
import { DashboardPickerSelect } from '../components/DashboardPickerSelect';
import { bandwidthToInput, parseBandwidthInput, LinkBandwidthUnit } from '../utils/linkBandwidth';

type Props = StandardEditorProps<TopologyMap, TopologyPanelOptions>;

function nodeTitle(node: TopologyNode): string {
  return node.label?.trim() || node.id;
}

function LockBar({ locked, onToggle }: { locked: boolean; onToggle: () => void }) {
  const theme = useTheme2();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 4,
        border: `1px solid ${locked ? theme.colors.warning.border : theme.colors.border.weak}`,
        background: locked ? theme.colors.warning.transparent : theme.colors.background.secondary,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <Icon name={locked ? 'lock' : 'unlock'} size="lg" />
        <span>{locked ? 'Topologia travada' : 'Topologia editável'}</span>
      </div>
      <IconButton
        name={locked ? 'lock' : 'unlock'}
        tooltip={locked ? 'Destravar mapa, hosts e submapas' : 'Travar mapa, hosts e submapas'}
        aria-label={locked ? 'Destravar topologia' : 'Travar topologia'}
        onClick={onToggle}
        variant={locked ? 'primary' : 'secondary'}
      />
    </div>
  );
}

export function TopologyEditor({ value, onChange, context }: Props) {
  const theme = useTheme2();
  const map = value ?? defaultTopologyMap();
  const locked = Boolean(map.locked);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState(() => topologyToJson(map));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({});

  const hostNodes = useMemo(
    () => map.nodes.filter((n) => (n.type ?? 'host') === 'host'),
    [map.nodes]
  );
  const submapNodes = useMemo(() => map.nodes.filter((n) => n.type === 'submap'), [map.nodes]);

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

  const updateSubmap = useCallback(
    (index: number, patch: Partial<TopologyNode>) => {
      const target = submapNodes[index];
      if (!target) {
        return;
      }
      updateMap({
        nodes: map.nodes.map((n) => (n.id === target.id ? { ...n, ...patch } : n)),
      });
    },
    [map.nodes, submapNodes, updateMap]
  );

  const removeSubmap = useCallback(
    (index: number) => {
      const node = submapNodes[index];
      if (!node) {
        return;
      }
      updateMap({
        nodes: map.nodes.filter((n) => n.id !== node.id),
        links: map.links.filter((l) => l.from !== node.id && l.to !== node.id),
      });
    },
    [map.links, map.nodes, submapNodes, updateMap]
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
    (index: number, field: 'from' | 'to' | 'medium' | 'bandwidthMbps', value: string) => {
      const links = map.links.map((l, i) => {
        if (i !== index) {
          return l;
        }
        if (field === 'medium') {
          return { ...l, medium: value as 'fiber' | 'radio' };
        }
        if (field === 'bandwidthMbps') {
          const trimmed = value.trim();
          if (!trimmed) {
            const next = { ...l };
            delete next.bandwidthMbps;
            return next;
          }
          const [amount, unit] = trimmed.split(':');
          const mbps = parseBandwidthInput(amount, (unit as LinkBandwidthUnit) || 'gbps');
          if (!mbps) {
            const next = { ...l };
            delete next.bandwidthMbps;
            return next;
          }
          return { ...l, bandwidthMbps: mbps };
        }
        const next = { ...l, [field]: value };
        if (field === 'from' || field === 'to') {
          const fromNode = map.nodes.find((n) => n.id === (field === 'from' ? value : l.from));
          const toNode = map.nodes.find((n) => n.id === (field === 'to' ? value : l.to));
          if (!l.medium) {
            next.medium = inferLinkMedium(fromNode, toNode);
          }
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

  const nodeOptions = map.nodes.map((n) => ({ label: `${n.label || n.id} (${n.id})`, value: n.id }));
  const mediumOptions = [
    { label: 'Fibra (linha contínua)', value: 'fiber' },
    { label: 'Rádio (linha tracejada)', value: 'radio' },
  ];

  if (jsonMode) {
    return (
      <VerticalGroup spacing="md">
        <LockBar locked={locked} onToggle={toggleLock} />
        <Alert title="Importar / exportar topologia" severity="info">
          Cole o JSON completo do mapa (width, height, nodes, links) e clique em Aplicar.
        </Alert>
        <Field label="Topologia (JSON)">
          <TextArea
            rows={16}
            value={jsonText}
            disabled={locked}
            onChange={(e) => setJsonText(e.currentTarget.value)}
          />
        </Field>
        {jsonError && <div style={{ color: theme.colors.error.text }}>{jsonError}</div>}
        <Button onClick={applyJson} disabled={locked}>
          Aplicar JSON
        </Button>
        <Button variant="secondary" onClick={() => setJsonMode(false)}>
          Voltar ao editor
        </Button>
      </VerticalGroup>
    );
  }

  return (
    <VerticalGroup spacing="md">
      <LockBar locked={locked} onToggle={toggleLock} />

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
          type="number"
          value={map.width}
          disabled={locked}
          onChange={(e) => updateMap({ width: Number(e.currentTarget.value) || 1200 })}
        />
      </Field>
      <Field label="Altura do mapa">
        <Input
          type="number"
          value={map.height}
          disabled={locked}
          onChange={(e) => updateMap({ height: Number(e.currentTarget.value) || 800 })}
        />
      </Field>

      <Field
        label={`Hosts Zabbix (${hostNodes.length})`}
        description="Nome e IP vêm do Zabbix. Posição: arraste no mapa (botão direito para links)."
      >
        <VerticalGroup spacing="sm">
          {hostNodes.length === 0 && (
            <div style={{ color: theme.colors.text.secondary, fontSize: 13 }}>
              Configure o <strong>Datasource UID</strong> Zabbix nas opções do painel. O status ICMP é buscado direto na API (itens icmpping*).
            </div>
          )}
          {hostNodes.map((node) => {
            const hostKey = node.zabbixHost?.trim() || node.label?.trim() || node.id;
            return (
              <div
                key={hostKey}
                style={{
                  fontSize: 13,
                  padding: '6px 8px',
                  borderRadius: 4,
                  background: theme.colors.background.secondary,
                  border: `1px solid ${theme.colors.border.weak}`,
                }}
              >
                <div>{node.label ?? hostKey}</div>
                {node.subtitle ? (
                  <div style={{ color: theme.colors.text.secondary, fontSize: 12 }}>{node.subtitle}</div>
                ) : null}
              </div>
            );
          })}
        </VerticalGroup>
      </Field>

      <Field label={`Submapas (${submapNodes.length})`} description="Atalhos para outros dashboards">
        <VerticalGroup spacing="sm">
          {submapNodes.map((node, idx) => {
            const isOpen = openNodes[node.id] ?? false;
            return (
              <CollapsableSection
                key={node.id}
                label={
                  <span>
                    <Icon name="external-link-alt" style={{ marginRight: 6 }} />
                    {nodeTitle(node)}
                  </span>
                }
                isOpen={isOpen}
                onToggle={(open) => setOpenNodes((prev) => ({ ...prev, [node.id]: open }))}
              >
                <VerticalGroup spacing="sm">
                  <Field label="ID interno">
                    <Input
                      value={node.id}
                      disabled={locked}
                      onChange={(e) => updateSubmap(idx, { id: e.currentTarget.value })}
                    />
                  </Field>
                  <Field label="Nome exibido">
                    <Input
                      value={node.label ?? ''}
                      disabled={locked}
                      onChange={(e) => updateSubmap(idx, { label: e.currentTarget.value })}
                    />
                  </Field>
                  <Field
                    label="Dashboard"
                    description={node.submapSlug ? `Slug: ${node.submapSlug}` : undefined}
                  >
                    <DashboardPickerSelect
                      value={node.submapUid ?? ''}
                      disabled={locked}
                      onChange={(uid, slug) =>
                        updateSubmap(idx, {
                          submapUid: uid || undefined,
                          submapSlug: slug || uid || undefined,
                        })
                      }
                    />
                  </Field>
                  <Button variant="destructive" size="sm" disabled={locked} onClick={() => removeSubmap(idx)}>
                    Remover submapa
                  </Button>
                </VerticalGroup>
              </CollapsableSection>
            );
          })}
          <Button onClick={addSubmap} disabled={locked}>
            + Adicionar submapa
          </Button>
        </VerticalGroup>
      </Field>

      <Field label={`Links (${map.links.length})`} description="Fibra = linha contínua · Rádio = tracejado · Capacidade define espessura e rótulo (Mb/Gb)">
        <VerticalGroup spacing="sm">
          {map.links.map((link, idx) => {
            const bw = bandwidthToInput(link.bandwidthMbps);
            return (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="De">
                <Select
                  width={20}
                  options={nodeOptions}
                  value={link.from}
                  disabled={locked}
                  onChange={(v) => updateLink(idx, 'from', v.value!)}
                />
              </Field>
              <Field label="Para">
                <Select
                  width={20}
                  options={nodeOptions}
                  value={link.to}
                  disabled={locked}
                  onChange={(v) => updateLink(idx, 'to', v.value!)}
                />
              </Field>
              <Field label="Meio">
                <Select
                  width={18}
                  options={mediumOptions}
                  value={link.medium ?? 'fiber'}
                  disabled={locked}
                  onChange={(v) => updateLink(idx, 'medium', v.value!)}
                />
              </Field>
              <Field label="Capacidade">
                <div style={{ display: 'flex', gap: 4 }}>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    width={10}
                    disabled={locked}
                    value={bw.value}
                    placeholder="1"
                    onChange={(e) =>
                      updateLink(idx, 'bandwidthMbps', `${e.currentTarget.value}:${bw.unit}`)
                    }
                  />
                  <Select
                    width={10}
                    options={[
                      { label: 'Mb', value: 'mbps' },
                      { label: 'Gb', value: 'gbps' },
                    ]}
                    value={bw.unit}
                    disabled={locked}
                    onChange={(v) =>
                      updateLink(idx, 'bandwidthMbps', `${bw.value}:${v.value ?? 'gbps'}`)
                    }
                  />
                </div>
              </Field>
              <Button variant="destructive" size="sm" disabled={locked} onClick={() => removeLink(idx)}>
                Remover
              </Button>
            </div>
            );
          })}
          <Button onClick={addLink} disabled={locked || map.nodes.length < 2}>
            + Adicionar link
          </Button>
        </VerticalGroup>
      </Field>

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
    </VerticalGroup>
  );
}
