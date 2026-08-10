import React, { useCallback } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { css } from '@emotion/css';
import { ColorPickerInput, Stack, useTheme2 } from '@grafana/ui';
import { TopologyHostIcon, TopologyPanelOptions } from '../types';
import {
  HOST_ICON_LABELS,
  HOST_ICON_ORDER,
  HostIconImage,
  hostIconRenderDimensions,
} from '../utils/hostIcons';

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

  const rowStyle = css`
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(120px, 1.2fr);
    gap: 10px;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid ${theme.colors.border.weak};
  `;

  const labelStyle = css`
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.primary};
  `;

  const hintStyle = css`
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
    margin-bottom: 8px;
  `;

  return (
    <Stack direction="column" gap={1}>
      <div className={hintStyle}>
        Vale para hosts online ou sem query. Offline e alerta usam as cores globais.
        Vazio = cor online / sem query do painel.
      </div>
      {HOST_ICON_ORDER.map((icon) => {
        const { h } = hostIconRenderDimensions(icon, 22);
        return (
          <div key={icon} className={rowStyle}>
            <HostIconImage icon={icon} size={h} />
            <span className={labelStyle}>{HOST_ICON_LABELS[icon]}</span>
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
