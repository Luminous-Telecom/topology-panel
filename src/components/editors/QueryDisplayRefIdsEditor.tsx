import React, { useMemo } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Checkbox, Icon, Stack, useTheme2 } from '@grafana/ui';
import { TopologyPanelOptions, TopologyQueryRefInfo } from '../../types';
import { resolvePanelQueryRefInfos } from '../../services/zabbixDirectIndex';
import { collectAllSubmapGroups, collectSubmapQueryRefIds } from '../../utils/queryHosts';
import { queryRefBadgeLabel, queryRefRowTitle } from '../../utils/queryRefLabel';
import styles from './QueryDisplayRefIdsEditor.module.scss';

type Props = StandardEditorProps<string[] | undefined, TopologyPanelOptions>;

function resolveAvailableQueryRefs(context: Props['context']): TopologyQueryRefInfo[] {
  const options = context.options;
  if (!options) {
    return [];
  }
  return resolvePanelQueryRefInfos(
    options,
    options.queryRefInfosAvailable,
    collectAllSubmapGroups(options)
  );
}

function normalizeRefId(refId: string): string {
  return refId.trim().toUpperCase();
}

/** Escolhe quais grupos (refId virtual) importam hosts ao mapa — opt-in por grupo. */
export function QueryDisplayRefIdsEditor({ value, onChange, context }: Props) {
  const theme = useTheme2();
  const selected = useMemo(
    () => new Set((value ?? []).map(normalizeRefId).filter(Boolean)),
    [value]
  );

  const queryRefs = useMemo(() => resolveAvailableQueryRefs(context), [context]);

  const submapRefIds = useMemo(
    () => collectSubmapQueryRefIds(context.options?.map),
    [context.options?.map]
  );

  const commitSelection = (next: Set<string>) => {
    // Nunca persistir refIds reservados a submapa (evita toggle “fantasma”).
    for (const reserved of submapRefIds) {
      next.delete(reserved);
    }
    const list = [...next].sort((a, b) => a.localeCompare(b));
    onChange(list.length ? list : undefined);
  };

  if (!queryRefs.length) {
    return <span className={styles.hint}>Configure o grupo Zabbix em um submapa.</span>;
  }

  return (
    <Stack direction="column" gap={0.5}>
      {queryRefs.map(({ refId, hint }) => {
        const reservedForSubmap = submapRefIds.has(refId);
        const checked = !reservedForSubmap && selected.has(refId);

        return (
          <div key={refId} className={styles.row}>
            <span
              className={styles.badge}
              title={refId}
              style={{
                color: theme.colors.text.primary,
                background: theme.colors.background.secondary,
                border: `1px solid ${theme.colors.border.weak}`,
              }}
            >
              {queryRefBadgeLabel(refId)}
            </span>
            <div className={styles.clip}>
              <div className={styles.title} title={queryRefRowTitle(refId, hint)}>
                {queryRefRowTitle(refId, hint)}
              </div>
              <div className={styles.subtitle} style={{ color: theme.colors.text.secondary }}>
                {reservedForSubmap
                  ? 'Reservada a submapa — não importa hosts no mapa pai'
                  : hint || 'Mostrar hosts deste grupo no mapa'}
              </div>
            </div>
            {reservedForSubmap ? (
              <span
                className={styles.locked}
                style={{ color: theme.colors.text.secondary }}
                title="Reservada a submapa"
                aria-label={`Grupo ${refId} reservado a submapa`}
              >
                <Icon name="lock" />
              </span>
            ) : (
              <Checkbox
                value={checked}
                aria-label={`Grupo ${refId} — mostrar hosts no mapa`}
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
