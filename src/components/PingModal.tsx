import React, { useCallback, useState } from 'react';
import { Button, Field } from '@grafana/ui';
import { DraggableModal } from './DraggableModal';
import { css } from '@emotion/css';
import { copyPingCommand } from '../utils/hostTools';

interface Props {
  label: string;
  ip: string;
  onClose: () => void;
}

const hintStyle = css`
  margin: 0;
  padding: 10px 12px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.12);
  color: inherit;
  font-size: 12px;
  line-height: 1.45;
`;

export function PingModal({ label, ip, onClose }: Props) {
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const onCopy = useCallback(async () => {
    const msg = await copyPingCommand(ip);
    setCopyMsg(msg);
    window.setTimeout(() => setCopyMsg(null), 2500);
  }, [ip]);

  const pingCmd = `ping ${ip}`;

  return (
    <DraggableModal title="Ping" isOpen onDismiss={onClose}>
      <Field label="Host">
        <div style={{ fontSize: 14 }}>{label}</div>
      </Field>
      <Field label="IP">
        <div style={{ fontFamily: 'monospace', fontSize: 14 }}>{ip}</div>
      </Field>

      <Field label="Comando local (terminal)">
        <div>
          <p className={hintStyle}>
            O ping é executado no seu computador. Copie o comando abaixo e rode no terminal.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <code
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 4,
                background: 'rgba(0,0,0,0.15)',
                fontFamily: 'monospace',
                fontSize: 13,
              }}
            >
              {pingCmd}
            </code>
            <Button variant="secondary" onClick={() => void onCopy()}>
              Copiar
            </Button>
          </div>
          {copyMsg ? <div style={{ marginTop: 6, fontSize: 12, color: '#66bb6a' }}>{copyMsg}</div> : null}
        </div>
      </Field>

      <DraggableModal.ButtonRow>
        <Button variant="primary" onClick={onClose}>
          Fechar
        </Button>
      </DraggableModal.ButtonRow>
    </DraggableModal>
  );
}
