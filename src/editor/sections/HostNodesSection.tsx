import React from 'react';
import { Stack, useTheme2 } from '@grafana/ui';
import { TopologyNode } from '../../types';
import { FieldReadout } from '../../components/FieldReadout';

/** Lista somente-leitura dos hosts: nome e IP vêm do Zabbix, não se edita aqui. */
export function HostNodesSection({ hostNodes }: { hostNodes: TopologyNode[] }) {
  const theme = useTheme2();
  return (
    <FieldReadout
      label={`Hosts Zabbix (${hostNodes.length})`}
      description="Nome e IP vêm do Zabbix. Posição: arraste no mapa (botão direito para links)."
    >
      <Stack direction="column" gap={1}>
        {hostNodes.length === 0 && (
          <div style={{ color: theme.colors.text.secondary, fontSize: 13 }}>
            Configure a aba <strong>Query</strong> do painel e o <strong>mapeamento de status</strong> nas opções do painel (Aparência) para cores dos hosts.
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
