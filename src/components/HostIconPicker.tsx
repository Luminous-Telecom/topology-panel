import React from 'react';
import { useTheme2 } from '@grafana/ui';
import { TopologyHostIcon } from '../types';
import { HOST_ICON_LABELS, HOST_ICON_ORDER, HostIconImage, hostIconRenderDimensions } from '../utils/hostIcons';
import styles from './HostIconPicker.module.scss';

interface Props {
  value: TopologyHostIcon;
  onChange: (icon: TopologyHostIcon) => void;
}

export function HostIconPicker({ value, onChange }: Props) {
  const theme = useTheme2();

  return (
    <div className={styles.grid}>
      {HOST_ICON_ORDER.map((id) => {
        const selected = value === id;
        const { h } = hostIconRenderDimensions(id, 36);
        return (
          <button
            key={id}
            type="button"
            title={HOST_ICON_LABELS[id]}
            onClick={() => onChange(id)}
            data-selected={selected ? 'true' : 'false'}
            className={styles.cell}
            style={{
              borderColor: selected ? theme.colors.primary.border : theme.colors.border.weak,
              background: selected ? theme.colors.primary.transparent : theme.colors.background.secondary,
              color: theme.colors.text.primary,
            }}
          >
            <HostIconImage icon={id} size={h} />
            <span>{HOST_ICON_LABELS[id]}</span>
          </button>
        );
      })}
    </div>
  );
}
