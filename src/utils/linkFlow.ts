/**
 * Animação contínua das faixas RX/TX — velocidade por elemento via data-link-flow-speed.
 *
 * Traço curto + linecap redondo vira cápsula (pacote). Soma do padrão = LINK_FLOW_PERIOD.
 */
export const LINK_FLOW_DASH = '2 28';
const LINK_FLOW_PERIOD = 30;

export type LinkFlowController = {
  stop: () => void;
  setPaused: (paused: boolean) => void;
};

function readFlowSpeed(el: Element): number {
  const raw = el.getAttribute('data-link-flow-speed');
  if (!raw) {
    return 0;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Deslocamento de cada faixa, fora do DOM.
 *
 * Guardar no atributo custava uma leitura e uma escrita de string por faixa em **cada** frame; o
 * valor só interessa à própria animação.
 */
const flowOffsets = new WeakMap<Element, number>();

/** Reconsulta o DOM no máximo a cada 250 ms — link novo entra na animação no fatiamento seguinte. */
const FLOW_QUERY_INTERVAL_MS = 250;

function writeFlowOffset(el: Element, offset: number): void {
  const normalized = ((offset % LINK_FLOW_PERIOD) + LINK_FLOW_PERIOD) % LINK_FLOW_PERIOD;
  flowOffsets.set(el, normalized);
  const direction = el.getAttribute('data-link-flow');
  const signed = direction === 'upload' ? -normalized : normalized;
  el.setAttribute('stroke-dashoffset', String(signed));
}

/** Atualiza stroke-dashoffset via rAF com velocidade individual por faixa. */
export function startLinkFlowAnimation(root: HTMLElement): LinkFlowController {
  let raf = 0;
  /** Timer do modo dormente — nenhuma faixa com tráfego, nada para animar. */
  let idleTimer = 0;
  let paused = false;
  let lanes: Element[] = [];
  let lanesReadAt = 0;

  const clearPending = () => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (idleTimer) {
      window.clearTimeout(idleTimer);
      idleTimer = 0;
    }
  };

  const schedule = () => {
    if (paused || raf || idleTimer) {
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  /**
   * Sem faixa ativa não existe animação para avançar. Em vez de gastar um frame por vez só para
   * reler os mesmos atributos, dorme até a próxima varredura do DOM — é o que mantém o painel
   * barato num mapa sem tráfego ou com todos os cabos parados.
   */
  const sleepUntilNextScan = () => {
    idleTimer = window.setTimeout(() => {
      idleTimer = 0;
      schedule();
    }, FLOW_QUERY_INTERVAL_MS);
  };

  const tick = () => {
    raf = 0;
    const now = performance.now();
    if (now - lanesReadAt >= FLOW_QUERY_INTERVAL_MS) {
      lanes = Array.from(root.querySelectorAll('[data-link-flow]'));
      lanesReadAt = now;
    }
    let animated = 0;
    for (const el of lanes) {
      if (el.getAttribute('data-link-flow-active') === 'false') {
        continue;
      }
      const speed = readFlowSpeed(el);
      if (speed <= 0) {
        continue;
      }
      writeFlowOffset(el, (flowOffsets.get(el) ?? 0) + speed);
      animated++;
    }
    if (!animated) {
      sleepUntilNextScan();
      return;
    }
    schedule();
  };

  schedule();

  return {
    stop: clearPending,
    setPaused: (next) => {
      if (paused === next) {
        return;
      }
      paused = next;
      if (paused) {
        clearPending();
        return;
      }
      // Força reler o DOM: o mapa pode ter mudado enquanto a animação estava parada.
      lanesReadAt = 0;
      schedule();
    },
  };
}
