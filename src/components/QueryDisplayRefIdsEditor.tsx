import React, { useMemo } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { css } from '@emotion/css';
import { Stack, Switch, useTheme2 } from '@grafana/ui';
import { TopologyPanelOptions, TopologyQueryRefInfo } from '../types';
import { collectQueryRefInfosFromPanelData, collectSubmapQueryRefIds } from '../utils';

type Props = StandardEditorProps<string[] | undefined, TopologyPanelOptions>;

function resolveAvailableQueryRefs(context: Props['context']): TopologyQueryRefInfo[] {
  const synced = context.options.queryRefInfosAvailable ?? [];
  if (synced.length) {
    return synced;
  }
  return collectQueryRefInfosFromPanelData(context.data);
}

/** Escolhe quais queries (refId) importam hosts ao mapa — opt-in por query. */
export function QueryDisplayRefIdsEditor({ value, onChange, context }: Props) {
  const theme = useTheme2();
  const selected = useMemo(
    () => new Set((value ?? []).map((r) => r.trim().toUpperCase()).filter(Boolean)),
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
    width: 36px;
    height: 28px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 14px;
    line-height: 1;
    color: ${theme.colors.text.primary};
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
  `;

  if (!queryRefs.length) {
    return (
      <span style={{ fontSize: 12, opacity: 0.75 }}>
        Nenhuma query detectada ainda — salve ou aguarde a visualização do painel.
      </span>
    );
  }

  return (
    <Stack direction="column" gap={0.5}>
        {queryRefs.map(({ refId, hint }) => {
          const reservedForSubmap = submapRefIds.has(refId);
          return (
            <div key={refId} className={rowStyle}>
              <span className={badgeStyle} title={`Consulta ${refId}`}>
                {refId}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Consulta {refId}</div>
                <div style={{ fontSize: 11, color: theme.colors.text.secondary, lineHeight: 1.35 }}>
                  {reservedForSubmap
                    ? 'Reservada a submapa — não importa hosts no mapa pai'
                    : hint || 'Mostrar hosts desta query no mapa'}
                </div>
              </div>
              <Switch
                value={selected.has(refId)}
                disabled={reservedForSubmap}
                aria-label={`Consulta ${refId} — mostrar hosts no mapa`}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.currentTarget.checked) {
                    next.add(refId);
                  } else {
                    next.delete(refId);
                  }
                  const list = [...next].sort((a, b) => a.localeCompare(b));
                  onChange(list.length ? list : undefined);
                }}
              />
            </div>
          );
        })}
    </Stack>
  );
}
