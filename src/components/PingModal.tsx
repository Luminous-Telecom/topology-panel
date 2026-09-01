import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Spinner } from '@grafana/ui';
import { TopologyModal } from './TopologyModal';
import { modalErrorStyle } from './chrome/overlayChrome';
import { runZabbixPing, type HostIcmpStatus } from '../services/zabbixQuery';
import { copyPingCommand } from '../utils/hostTools';
import { FieldReadout } from './FieldReadout';
import styles from './PingModal.module.scss';

interface Props {
  label: string;
  ip: string;
  zabbixHostId?: string;
  datasourceUid?: string;
  onClose: () => void;
}

const PANEL_PING_INTERVAL_MS = 5000;

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

export function PingModal({ label, ip, zabbixHostId, datasourceUid, onClose }: Props) {
  const [pingOutput, setPingOutput] = useState('');
  const [pingError, setPingError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState(true);
  const [icmpStatus, setIcmpStatus] = useState<HostIcmpStatus | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const liveRef = useRef(true);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const appendOutput = useCallback((chunk: string) => {
    setPingOutput((prev) => {
      const prefix = prev && !prev.endsWith('\n') ? '\n' : prev ? '' : '';
      return `${prev}${prefix}${chunk}`;
    });
  }, []);

  const runPingBurst = useCallback(async () => {
    if (!datasourceUid || !zabbixHostId) {
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

    try {
      const result = await runZabbixPing(datasourceUid, zabbixHostId, 'panel');

      if (!mountedRef.current) {
        return;
      }

      if (result.icmp) {
        setIcmpStatus(result.icmp);
      }

      if (result.success && result.output) {
        appendOutput(`--- ${stamp()} ---\n${result.output}\n`);
        setPingError(null);
      } else if (result.output) {
        appendOutput(`${result.output}\n`);
        setPingError(result.error ?? null);
      } else {
        setPingError(result.error ?? null);
        if (!result.error) {
          appendOutput('Ping sem resposta do script Zabbix.\n');
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setPingError(err instanceof Error ? err.message : 'Falha ao executar o ping.');
      }
    } finally {
      runningRef.current = false;
      if (mountedRef.current) {
        setRunning(false);
      }
    }
  }, [appendOutput, datasourceUid, zabbixHostId]);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    if (!live || !datasourceUid || !zabbixHostId) {
      return;
    }
    void runPingBurst();
    const id = window.setInterval(() => {
      if (liveRef.current && !runningRef.current) {
        void runPingBurst();
      }
    }, PANEL_PING_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [datasourceUid, zabbixHostId, live, runPingBurst]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [pingOutput]);

  const onCopy = useCallback(async () => {
    const msg = await copyPingCommand(ip);
    if (!mountedRef.current) {
      return;
    }
    setCopyMsg(msg);
    window.setTimeout(() => {
      if (mountedRef.current) {
        setCopyMsg(null);
      }
    }, 2500);
  }, [ip]);

  const pingCmd = `ping ${ip}`;
  const summary = icmpSummary(icmpStatus);

  return (
    <TopologyModal title="Ping" onClose={onClose}>
      <FieldReadout label="Host">
        <div style={{ fontSize: 14 }}>{label}</div>
      </FieldReadout>
      <FieldReadout label="IP">
        <div style={{ fontFamily: 'monospace', fontSize: 14 }}>{ip}</div>
      </FieldReadout>

      <FieldReadout label="Resultado do ping">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            {running ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#90caf9' }}>
                <Spinner inline /> Executando…
              </span>
            ) : null}
            {live && !running ? (
              <span style={{ fontSize: 12, color: '#66bb6a' }}>
                Atualizando a cada {PANEL_PING_INTERVAL_MS / 1000}s
              </span>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLive((current) => {
                  const next = !current;
                  liveRef.current = next;
                  return next;
                });
              }}
            >
              {live ? 'Pausar' : 'Retomar'} automático
            </Button>
          </div>
          <pre ref={outputRef} className={styles.terminal}>
            {pingOutput || (pingError ? '' : 'Aguardando…')}
          </pre>
          {pingError ? <div className={`${modalErrorStyle} ${styles.error}`}>{pingError}</div> : null}
          {summary ? (
            <div style={{ marginTop: 8, fontSize: 12, color: '#8ab4f8' }}>{summary}</div>
          ) : null}
        </div>
      </FieldReadout>

      <FieldReadout label="Comando local (terminal)">
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
          {copyMsg ? <div style={{ marginTop: 6, fontSize: 12, color: '#66bb6a' }}>{copyMsg}</div> : null}
        </div>
      </FieldReadout>

      <TopologyModal.ButtonRow>
        <Button variant="secondary" onClick={() => void runPingBurst()} disabled={running}>
          Ping agora
        </Button>
        <Button variant="primary" onClick={onClose}>
          Fechar
        </Button>
      </TopologyModal.ButtonRow>
    </TopologyModal>
  );
}
