import React from 'react';
import { css } from '@emotion/css';
import { useTheme2 } from '@grafana/ui';
import { TopologyHostIcon } from '../types';
import { HOST_ICON_LABELS, HOST_ICON_ORDER, HostIconImage, hostIconRenderDimensions } from '../utils/hostIcons';

interface Props {
  value: TopologyHostIcon;
  onChange: (icon: TopologyHostIcon) => void;
}

export function HostIconPicker({ value, onChange }: Props) {
  const theme = useTheme2();

  return (
    <div
      className={css`
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
        gap: 8px;
        max-height: 360px;
        overflow-y: auto;
        padding: 2px;
      `}
    >
      {HOST_ICON_ORDER.map((id) => {
        const selected = value === id;
        const { w, h } = hostIconRenderDimensions(id, 36);
        return (
          <button
            key={id}
            type="button"
            title={HOST_ICON_LABELS[id]}
            onClick={() => onChange(id)}
            className={css`
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 6px;
              padding: 10px 6px;
              border-radius: 6px;
              border: 1px solid
                ${selected ? theme.colors.primary.border : theme.colors.border.weak};
              background: ${selected ? theme.colors.primary.transparent : theme.colors.background.secondary};
              color: ${theme.colors.text.primary};
              cursor: pointer;
              font-size: 10px;
              line-height: 1.2;
              text-align: center;
              transition: border-color 0.15s, background 0.15s;

              &:hover {
                border-color: ${theme.colors.primary.border};
                background: ${theme.colors.action.hover};
              }
            `}
          >
            <HostIconImage icon={id} size={h} />
            <span>{HOST_ICON_LABELS[id]}</span>
          </button>
        );
      })}
    </div>
  );
}
