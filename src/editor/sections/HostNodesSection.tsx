import React from 'react';
import { Stack, useTheme2 } from '@grafana/ui';
import { TopologyNode } from '../../types';
import { FieldReadout } from '../../components/FieldReadout';

/** Lista só de identidade visível: posição no mapa não entra — arraste não remonta esta lista. */
export function sameHostReadoutIdentity(prev: TopologyNode[], next: TopologyNode[]): boolean {
  if (prev === next) {
    return true;
  }
  if (prev.length !== next.length) {
    return false;
  }
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (a.id !== b.id || a.label !== b.label || a.zabbixHost !== b.zabbixHost || a.subtitle !== b.subtitle) {
      return false;
    }
  }
  return true;
}

interface Props {
  hostNodes: TopologyNode[];
}

/** Lista somente-leitura dos hosts: nome e IP vêm do Zabbix, não se edita aqui. */
function HostNodesSectionComponent({ hostNodes }: Props) {
  const theme = useTheme2();
  return (
    <FieldReadout
      label={`Hosts Zabbix (${hostNodes.length})`}
      description="Nome e IP vêm do Zabbix. Posição: arraste no mapa (botão direito para links)."
    >
      <Stack direction="column" gap={1}>
        {hostNodes.length === 0 && (
          <div style={{ color: theme.colors.text.secondary, fontSize: 13 }}>
            Configure o datasource Zabbix nas opções do painel. Online e offline vêm da latência ICMP.
          </div>
        )}
        {hostNodes.map((node) => (
          <div
            key={node.id}
            style={{
              fontSize: 13,
              padding: '6px 8px',
              borderRadius: 4,
              background: theme.colors.background.secondary,
              border: `1px solid ${theme.colors.border.weak}`,
            }}
          >
            <div>{node.label?.trim()}</div>
            {node.zabbixHost?.trim() ? (
              <div style={{ color: theme.colors.text.secondary, fontSize: 12 }}>{node.zabbixHost.trim()}</div>
            ) : null}
            {node.subtitle ? (
              <div style={{ color: theme.colors.text.secondary, fontSize: 12 }}>{node.subtitle}</div>
            ) : null}
          </div>
        ))}
      </Stack>
    </FieldReadout>
  );
}

export const HostNodesSection = React.memo(HostNodesSectionComponent, (prev, next) =>
  sameHostReadoutIdentity(prev.hostNodes, next.hostNodes)
);
