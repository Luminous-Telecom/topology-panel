/** Intervalo mínimo entre duas buscas, independente do que dispare o ciclo. */
export const POLL_MIN_GAP_MS = 2_000;

/** Se a busca anterior não voltou neste prazo, o ciclo pode iniciar outra. */
export const POLL_WATCHDOG_MS = 25_000;

/**
 * Gate do polling Zabbix: não sobrepõe buscas rápidas, mas não trava o ciclo quando
 * `getBackendSrv().post` fica pendente sem rejeitar.
 */
export function canStartPolledFetch(
  nowMs: number,
  lastStartMs: number,
  inFlight: boolean,
  minGapMs = POLL_MIN_GAP_MS,
  watchdogMs = POLL_WATCHDOG_MS
): boolean {
  const elapsed = nowMs - lastStartMs;
  if (inFlight) {
    return elapsed >= watchdogMs;
  }
  return lastStartMs <= 0 || elapsed >= minGapMs;
}
