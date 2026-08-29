/** Intervalo mínimo entre duas buscas, independente do que dispare o ciclo. */
export const POLL_MIN_GAP_MS = 2_000;

/**
 * Se a busca anterior não voltou neste prazo, o ciclo pode iniciar outra.
 * Precisa ficar acima do teto do `item.get` de status (45 s): um watchdog menor abortava o
 * `host.get` no meio e o Network enchia de `zabbix-api` canceled + replay.
 */
export const POLL_WATCHDOG_MS = 50_000;

interface PollClockState {
  /** Ausente = esta chave ainda não largou um ciclo. `0` é instante válido (timers de teste). */
  lastStartMs?: number;
  inFlight: boolean;
}

/**
 * Relógio do poll fora do React. O Grafana remonta o painel (auto-refresh do dashboard, persistir
 * view, Strict Mode) e o efeito zerava `lastStartMs` — cada remontagem disparava um ciclo novo
 * sem esperar o intervalo do plugin.
 */
const clocks = new Map<string, PollClockState>();

export function readPollClock(key: string): PollClockState {
  return clocks.get(key) ?? { inFlight: false };
}

export function markPollStarted(key: string, nowMs: number): void {
  clocks.set(key, { lastStartMs: nowMs, inFlight: true });
}

/** Encerra o voo; o instante da última largada continua valendo para o intervalo. */
export function markPollFinished(key: string): void {
  const prev = clocks.get(key);
  if (!prev) {
    return;
  }
  clocks.set(key, { lastStartMs: prev.lastStartMs, inFlight: false });
}

export function clearPollClock(): void {
  clocks.clear();
}

/**
 * Ms até o próximo ciclo permitido. `0` = pode largar agora (nunca buscou nesta chave).
 */
export function msUntilNextPoll(key: string, intervalMs: number, nowMs: number): number {
  const { lastStartMs } = readPollClock(key);
  if (lastStartMs == null) {
    return 0;
  }
  const remaining = lastStartMs + intervalMs - nowMs;
  return remaining > 0 ? remaining : 0;
}

/**
 * Gate do polling Zabbix: não sobrepõe buscas e respeita o intervalo do plugin.
 * O watchdog (`inFlight`) só libera outra busca se a anterior passou do prazo — passe
 * `Number.POSITIVE_INFINITY` para nunca iniciar um ciclo em cima do outro.
 * `lastStartMs` ausente = primeira busca desta chave (`0` é instante válido).
 */
export function canStartPolledFetch(
  nowMs: number,
  lastStartMs: number | undefined,
  inFlight: boolean,
  minGapMs = POLL_MIN_GAP_MS,
  watchdogMs = POLL_WATCHDOG_MS
): boolean {
  if (inFlight) {
    return lastStartMs != null && nowMs - lastStartMs >= watchdogMs;
  }
  if (lastStartMs == null) {
    return true;
  }
  return nowMs - lastStartMs >= minGapMs;
}
