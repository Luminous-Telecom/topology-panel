import React from 'react';
import { Icon, IconButton, useTheme2 } from '@grafana/ui';

/** Cadeado global do editor: travado, nada de posição, submapa ou link muda. */
export function EditorLockBar({ locked, onToggle }: { locked: boolean; onToggle: () => void }) {
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
