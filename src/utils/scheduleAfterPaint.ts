/**
 * Agenda `run` para depois de dois `requestAnimationFrame` e um `setTimeout(0)` — o quadro
 * atual pinta, o próximo confirma o layout, o timeout devolve o controle ao browser, e só então
 * o trabalho pesado entra.
 *
 * Devolve um cancelador: se o usuário soltar outro nó antes, o persist anterior é substituído.
 */
export function scheduleAfterPaint(run: () => void): () => void {
  let secondId = 0;
  let timeoutId = 0;
  const firstId = requestAnimationFrame(() => {
    secondId = requestAnimationFrame(() => {
      timeoutId = window.setTimeout(run, 0);
    });
  });
  return () => {
    cancelAnimationFrame(firstId);
    if (secondId !== 0) {
      cancelAnimationFrame(secondId);
    }
    if (timeoutId !== 0) {
      window.clearTimeout(timeoutId);
    }
  };
}

const IDLE_TIMEOUT_MS = 120;

/**
 * Agenda `run` quando o browser estiver ocioso (ou após `timeoutMs`). Gravacao no Grafana
 * não compete com o pointerup nem com o paint do preview.
 */
export function scheduleWhenIdle(run: () => void, timeoutMs = IDLE_TIMEOUT_MS): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => run(), { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, timeoutMs);
  return () => window.clearTimeout(id);
}
