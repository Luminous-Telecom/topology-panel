import React, { useMemo } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { css } from '@emotion/css';
import { Checkbox, Icon, Stack, useTheme2 } from '@grafana/ui';
import { TopologyPanelOptions, TopologyQueryRefInfo } from '../types';
import { resolvePanelQueryRefInfos } from '../services/zabbixDirectIndex';
import { collectQueryRefInfosFromPanelData, collectSubmapQueryRefIds } from '../utils/queryHosts';
import { queryRefBadgeLabel, queryRefRowTitle } from '../utils/queryRefLabel';

type Props = StandardEditorProps<string[] | undefined, TopologyPanelOptions>;

function resolveAvailableQueryRefs(context: Props['context']): TopologyQueryRefInfo[] {
  const synced = context.options.queryRefInfosAvailable ?? [];
  if (synced.length) {
    return synced;
  }
  if (context.options.dataMode === 'zabbix') {
    return resolvePanelQueryRefInfos(context.options);
  }
  return collectQueryRefInfosFromPanelData(context.data);
}

function normalizeRefId(refId: string): string {
  return refId.trim().toUpperCase();
}

/** Escolhe quais queries (refId) importam hosts ao mapa — opt-in por query. */
export function QueryDisplayRefIdsEditor({ value, onChange, context }: Props) {
  const theme = useTheme2();
  const selected = useMemo(
    () => new Set((value ?? []).map(normalizeRefId).filter(Boolean)),
    [value]
  );

  const queryRefs = useMemo(() => resolveAvailableQueryRefs(context), [context]);

  const submapRefIds = useMemo(
    () => collectSubmapQueryRefIds(context.options.map),
    [context.options.map]
  );

  const rowStyle = css`
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 6px 0;
  `;

  const badgeStyle = css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 100%;
    max-width: 36px;
    height: 28px;
    padding: 0 4px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 12px;
    line-height: 1;
    color: ${theme.colors.text.primary};
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `;

  const lockedStyle = css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: ${theme.colors.text.secondary};
    pointer-events: none;
  `;

  const commitSelection = (next: Set<string>) => {
    // Nunca persistir refIds reservados a submapa (evita toggle “fantasma”).
    for (const reserved of submapRefIds) {
      next.delete(reserved);
    }
    const list = [...next].sort((a, b) => a.localeCompare(b));
    onChange(list.length ? list : undefined);
  };

  if (!queryRefs.length) {
    const directMode = context.options.dataMode === 'zabbix';
    return (
      <span style={{ fontSize: 12, opacity: 0.75 }}>
        {directMode
          ? 'Escolha o datasource Zabbix e ao menos um grupo de host em Fonte de dados.'
          : 'Nenhuma query detectada ainda — salve ou aguarde a visualização do painel.'}
      </span>
    );
  }

  return (
    <Stack direction="column" gap={0.5}>
      {queryRefs.map(({ refId, hint }) => {
        const reservedForSubmap = submapRefIds.has(refId);
        const checked = !reservedForSubmap && selected.has(refId);

        return (
          <div key={refId} className={rowStyle}>
            <span className={badgeStyle} title={refId}>
              {queryRefBadgeLabel(refId)}
            </span>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={queryRefRowTitle(refId, hint)}
              >
                {queryRefRowTitle(refId, hint)}
              </div>
              <div style={{ fontSize: 11, color: theme.colors.text.secondary, lineHeight: 1.35 }}>
                {reservedForSubmap
                  ? 'Reservada a submapa — não importa hosts no mapa pai'
                  : hint || 'Mostrar hosts desta query no mapa'}
              </div>
            </div>
            {reservedForSubmap ? (
              <span
                className={lockedStyle}
                title="Reservada a submapa"
                aria-label={`Consulta ${refId} reservada a submapa`}
              >
                <Icon name="lock" />
              </span>
            ) : (
              <Checkbox
                value={checked}
                aria-label={`Consulta ${refId} — mostrar hosts no mapa`}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.currentTarget.checked) {
                    next.add(refId);
                  } else {
                    next.delete(refId);
                  }
                  commitSelection(next);
                }}
              />
            )}
          </div>
        );
      })}
    </Stack>
  );
}
