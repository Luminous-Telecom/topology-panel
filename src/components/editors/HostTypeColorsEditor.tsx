import React, { useCallback } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { ColorPickerInput, Stack, useTheme2 } from '@grafana/ui';
import { TopologyHostIcon, TopologyPanelOptions } from '../../types';
import {
  HOST_ICON_LABELS,
  HOST_ICON_ORDER,
  HostIconImage,
  hostIconRenderDimensions,
} from '../../utils/hostIcons';
import styles from './HostTypeColorsEditor.module.scss';

type HostTypeColors = NonNullable<TopologyPanelOptions['hostTypeColors']>;

type Props = StandardEditorProps<HostTypeColors, TopologyPanelOptions>;

/** Cores do card do host por tipo/ícone (opções do painel). */
export function HostTypeColorsEditor({ value, onChange }: Props) {
  const theme = useTheme2();
  const colors = value ?? {};

  const setColor = useCallback(
    (icon: TopologyHostIcon, next: string) => {
      const trimmed = next.trim();
      const updated: HostTypeColors = { ...colors };
      if (!trimmed) {
        delete updated[icon];
      } else {
        updated[icon] = trimmed;
      }
      onChange(updated);
    },
    [colors, onChange]
  );

  return (
    <Stack direction="column" gap={1}>
      <div className={styles.hint} style={{ color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize }}>
        Vale só para hosts online. Offline, alerta e sem dado usam as cores globais do painel.
        Vazio = cor online do painel.
      </div>
      {HOST_ICON_ORDER.map((icon) => {
        const { h } = hostIconRenderDimensions(icon, 22);
        return (
          <div key={icon} className={styles.row} style={{ borderBottom: `1px solid ${theme.colors.border.weak}` }}>
            <HostIconImage icon={icon} size={h} />
            <span
              className={styles.label}
              style={{ fontSize: theme.typography.bodySmall.fontSize, color: theme.colors.text.primary }}
            >
              {HOST_ICON_LABELS[icon]}
            </span>
            <ColorPickerInput
              value={colors[icon] ?? ''}
              onChange={(c) => setColor(icon, c)}
              returnColorAs="hex"
              placeholder="Padrão do painel"
            />
          </div>
        );
      })}
    </Stack>
  );
}
