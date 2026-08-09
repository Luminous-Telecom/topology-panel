import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Field, Modal, Spinner } from '@grafana/ui';
import { css } from '@emotion/css';
import { executeHostPingScript, fetchHostIcmpStatus, HostIcmpStatus } from '../utils/zabbixApi';
import { copyPingCommand } from '../utils/hostTools';

interface Props {
  label: string;
  ip: string;
  zabbixHost?: string;
  datasourceUid?: string;
  onClose: () => void;
}

const PANEL_PING_INTERVAL_MS = 5000;

const terminalStyle = css`
  margin: 0;
  padding: 10px 12px;
  border-radius: 4px;
  background: #0d1117;
  color: #c9d1d9;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
  min-height: 140px;
`;

function formatRtt(ms: number | null): string {
  if (ms === null || Number.isNaN(ms)) {
    return '—';
  }
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)} µs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(1)} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

function icmpSummary(status: HostIcmpStatus | null): string | null {
  if (!status || status.error) {
    return null;
  }
  const parts: string[] = [];
  if (status.reachable === true) {
    parts.push('ICMP: respondendo');
  } else if (status.reachable === false) {
    parts.push('ICMP: sem resposta');
  }
  if (status.lossPct !== null) {
    parts.push(`perda ${status.lossPct.toFixed(1)}%`);
  }
  if (status.rttMs !== null) {
    parts.push(`RTT ${formatRtt(status.rttMs)}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

function stamp(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function PingModal({ label, ip, zabbixHost, datasourceUid, onClose }: Props) {
  const [pingOutput, setPingOutput] = useState('');
  const [pingError, setPingError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState(true);
  const [icmpStatus, setIcmpStatus] = useState<HostIcmpStatus | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const liveRef = useRef(true);
  const runningRef = useRef(false);

  const appendOutput = useCallback((chunk: string) => {
    setPingOutput((prev) => {
      const prefix = prev && !prev.endsWith('\n') ? '\n' : prev ? '' : '';
      return `${prev}${prefix}${chunk}`;
    });
  }, []);

  const runPingBurst = useCallback(async () => {
      if (!datasourceUid || !zabbixHost) {
        setPingError('Host sem vínculo Zabbix — use o comando abaixo no terminal.');
        setPingOutput('');
        setLive(false);
        return;
      }
      if (runningRef.current) {
        return;
      }

      runningRef.current = true;
      setRunning(true);
      setPingError(null);

      const [scriptResult, icmp] = await Promise.all([
        executeHostPingScript(datasourceUid, zabbixHost, 'panel'),
        fetchHostIcmpStatus(datasourceUid, zabbixHost).catch(() => null),
      ]);

      if (icmp) {
        setIcmpStatus(icmp);
      }

      if (scriptResult.success && scriptResult.output) {
        appendOutput(`--- ${stamp()} ---\n${scriptResult.output}\n`);
        setPingError(null);
      } else if (scriptResult.output) {
        appendOutput(`${scriptResult.output}\n`);
        setPingError(scriptResult.error ?? null);
      } else {
        setPingError(scriptResult.error ?? null);
        if (!scriptResult.error) {
          appendOutput('Ping sem resposta do script Zabbix.\n');
        }
      }

      runningRef.current = false;
      setRunning(false);
    },
    [appendOutput, datasourceUid, zabbixHost]
  );

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    if (!live || !datasourceUid || !zabbixHost) {
      return;
    }
    void runPingBurst();
    const id = window.setInterval(() => {
      if (liveRef.current && !runningRef.current) {
        void runPingBurst();
      }
    }, PANEL_PING_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [datasourceUid, zabbixHost, live, runPingBurst]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [pingOutput]);

  const onCopy = async () => {
    const msg = await copyPingCommand(ip);
    setCopyMsg(msg);
    window.setTimeout(() => setCopyMsg(null), 2500);
  };

  const pingCmd = `ping ${ip}`;
  const summary = icmpSummary(icmpStatus);

  return (
    <Modal title="Ping" isOpen onDismiss={onClose}>
      <Field label="Host">
        <div style={{ fontSize: 14 }}>{label}</div>
      </Field>
      <Field label="IP">
        <div style={{ fontFamily: 'monospace', fontSize: 14 }}>{ip}</div>
      </Field>

      <Field label="Resultado do ping">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            {running && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#90caf9' }}>
                <Spinner inline /> Executando…
              </span>
            )}
            {live && !running && (
              <span style={{ fontSize: 12, color: '#66bb6a' }}>Atualizando a cada {PANEL_PING_INTERVAL_MS / 1000}s</span>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (live) {
                  setLive(false);
                  liveRef.current = false;
                } else {
                  setLive(true);
                  liveRef.current = true;
                }
              }}
            >
              {live ? 'Pausar' : 'Retomar'} automático
            </Button>
          </div>
          <pre ref={outputRef} className={terminalStyle}>
            {pingOutput || (pingError ? '' : 'Aguardando…')}
          </pre>
          {pingError && (
            <div style={{ marginTop: 8, color: '#ef5350', fontSize: 12 }}>{pingError}</div>
          )}
          {summary && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#8ab4f8' }}>{summary}</div>
          )}
        </div>
      </Field>

      <Field label="Comando local (terminal)">
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          {copyMsg && <div style={{ marginTop: 6, fontSize: 12, color: '#66bb6a' }}>{copyMsg}</div>}
        </div>
      </Field>

      <Modal.ButtonRow>
        <Button variant="secondary" onClick={() => void runPingBurst()} disabled={running}>
          Ping agora
        </Button>
        <Button variant="primary" onClick={onClose}>
          Fechar
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
}
