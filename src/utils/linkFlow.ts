/**
 * Animação contínua das faixas RX/TX — velocidade por elemento via data-link-flow-speed.
 *
 * Traço curto + linecap redondo vira cápsula (pacote). Soma do padrão = LINK_FLOW_PERIOD.
 *
 * O React não grava `offset-distance` nem `stroke-dashoffset`: cada commit zerava o deslocamento
 * e o cabo travava no poll de tráfego. Velocidade entra por `data-link-flow-speed`.
 */
export const LINK_FLOW_DASH = '7 11';
const LINK_FLOW_PERIOD = 18;

/** Seta que corre pelo cabo: anda por `offset-path`, não por dash. */
const FLOW_ARROW_ATTR = 'data-link-flow-arrow';

/**
 * `offset-path` move o glifo ao longo do cabo e `offset-rotate: auto` o gira na tangente. Sem
 * suporte, as setas empilhariam na origem — nesse caso o canvas desenha os pacotes por dash.
 */
export const supportsFlowArrows =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('offset-path', "path('M 0 0 L 1 1')");

function readNumberAttribute(el: Element, name: string): number {
  const raw = el.getAttribute(name);
  if (!raw) {
    return 0;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Dash fecha o ciclo no padrão; seta fecha no comprimento do próprio cabo. */
function flowPeriod(el: Element): number {
  if (!el.hasAttribute(FLOW_ARROW_ATTR)) {
    return LINK_FLOW_PERIOD;
  }
  return readNumberAttribute(el, 'data-link-flow-length');
}

export type LinkFlowController = {
  stop: () => void;
  setPaused: (paused: boolean) => void;
  /** Relê as faixas agora — o lastvalue acabou de pintar e o laço dormente atrasava ~1 s. */
  wake: () => void;
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
/** `offset-path` já aplicado — regravar o mesmo path no poll zera `offset-distance` no Chrome. */
const appliedFlowPaths = new WeakMap<Element, string>();

/** Reconsulta o DOM no máximo a cada 250 ms — link novo entra na animação no fatiamento seguinte. */
const FLOW_QUERY_INTERVAL_MS = 250;

function advanceFlowLanes(lanes: Element[]): number {
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
    animated += 1;
  }
  return animated;
}

function ensureArrowOffsetPath(el: Element): void {
  const d = el.getAttribute('data-link-flow-path');
  if (!d || !(el instanceof SVGElement || el instanceof HTMLElement)) {
    return;
  }
  if (appliedFlowPaths.get(el) === d) {
    return;
  }
  appliedFlowPaths.set(el, d);
  el.style.setProperty('offset-path', `path('${d}')`);
  el.style.setProperty('offset-rotate', '0deg');
}

function writeFlowOffset(el: Element, offset: number): void {
  const period = flowPeriod(el);
  if (period <= 0) {
    return;
  }
  const normalized = ((offset % period) + period) % period;
  flowOffsets.set(el, normalized);
  if (el.hasAttribute(FLOW_ARROW_ATTR)) {
    ensureArrowOffsetPath(el);
    // Cada seta entra defasada para as três se espalharem pelo cabo; o path já vem no sentido certo.
    const phase = readNumberAttribute(el, 'data-link-flow-phase');
    const distance = (normalized + phase) % period;
    if (el instanceof SVGElement || el instanceof HTMLElement) {
      el.style.setProperty('offset-distance', `${distance}px`);
    }
    return;
  }
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
    let animated = advanceFlowLanes(lanes);
    if (!animated) {
      lanes = Array.from(root.querySelectorAll('[data-link-flow]'));
      lanesReadAt = now;
      animated = advanceFlowLanes(lanes);
    }
    if (!animated) {
      sleepUntilNextScan();
      return;
    }
    schedule();
  };

  /**
   * Lastvalue pintou as faixas ativas: cancela o sono e relê o DOM no próximo frame.
   * Não avança no layout do React — escrever o SVG aí deixava o painel em tela preta no F5.
   */
  const wake = () => {
    if (paused) {
      return;
    }
    lanesReadAt = 0;
    if (idleTimer) {
      window.clearTimeout(idleTimer);
      idleTimer = 0;
    }
    schedule();
  };

  schedule();

  return {
    stop: clearPending,
    wake,
    setPaused: (next) => {
      if (paused === next) {
        return;
      }
      paused = next;
      if (paused) {
        clearPending();
        return;
      }
      wake();
    },
  };
}
