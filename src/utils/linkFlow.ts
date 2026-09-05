/**
 * Animação contínua das faixas RX/TX.
 *
 * Traço curto + linecap redondo vira cápsula (pacote). Soma do padrão = LINK_FLOW_PERIOD.
 *
 * Velocidade é constante (`LINK_FLOW_SPEED`): o lastvalue não mexe no pulso — gravar speed/path no
 * SVG a cada poll zerava `offset-distance` no Chrome. O React não grava `offset-distance`,
 * `offset-path` nem `stroke-dashoffset`.
 */

export const LINK_FLOW_DASH = '7 11';
const LINK_FLOW_PERIOD = 18;
/** Passo por frame (~60 fps): ~60 px/s no cabo. Igual nos dois sentidos, independente do bps. */
export const LINK_FLOW_SPEED = 1;

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

function laneStep(el: Element): number {
  const mult = readNumberAttribute(el, 'data-link-flow-step');
  return LINK_FLOW_SPEED * (mult > 0 ? mult : 1);
}

/** Dash fecha o ciclo no padrão; seta fecha no comprimento do próprio cabo. */
function flowPeriod(el: Element): number {
  if (el.hasAttribute(FLOW_ARROW_ATTR)) {
    return readNumberAttribute(el, 'data-link-flow-length');
  }
  const custom = readNumberAttribute(el, 'data-link-flow-period');
  if (custom > 0) {
    return custom;
  }
  return LINK_FLOW_PERIOD;
}

export type LinkFlowController = {
  stop: () => void;
  setPaused: (paused: boolean) => void;
  /** Escala do `<g>` do mapa — muda o offset-path aplicado e acorda o laço. */
  setViewScale: (scale: number) => void;
  /** Relê as faixas agora — o lastvalue acabou de pintar e o laço dormente atrasava ~1 s. */
  wake: () => void;
};

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
const FLOW_QUERY_INTERVAL_HEAVY_MS = 500;

function frameSkipForLaneCount(count: number): number {
  if (count <= 40) {
    return 1;
  }
  if (count <= 80) {
    return 2;
  }
  if (count <= 160) {
    return 3;
  }
  return 4;
}

function queryIntervalForLaneCount(count: number): number {
  return count > 80 ? FLOW_QUERY_INTERVAL_HEAVY_MS : FLOW_QUERY_INTERVAL_MS;
}

function isFlowLaneActive(el: Element): boolean {
  return el.getAttribute('data-link-flow-active') !== 'false';
}

function advanceFlowLanes(lanes: Element[], scale: number): number {
  let animated = 0;
  for (const el of lanes) {
    if (!el.isConnected || !isFlowLaneActive(el)) {
      continue;
    }
    writeFlowOffset(el, (flowOffsets.get(el) ?? 0) + laneStep(el), scale);
    animated += 1;
  }
  return animated;
}

function ensureArrowOffsetPath(el: Element, scale: number): boolean {
  const d = el.getAttribute('data-link-flow-path');
  if (!d || !(el instanceof SVGElement || el instanceof HTMLElement)) {
    return false;
  }
  const cacheKey = arrowPathCacheKey(d, scale);
  if (appliedFlowPaths.get(el) === cacheKey) {
    return false;
  }
  appliedFlowPaths.set(el, cacheKey);
  el.style.setProperty('offset-path', `path('${d}')`);
  el.style.setProperty('offset-rotate', '0deg');
  return true;
}

function writeFlowOffset(el: Element, offset: number, scale: number): boolean {
  const period = flowPeriod(el);
  if (period <= 0) {
    return false;
  }
  const normalized = ((offset % period) + period) % period;
  flowOffsets.set(el, normalized);
  if (el.hasAttribute(FLOW_ARROW_ATTR)) {
    const pathWrote = ensureArrowOffsetPath(el, scale);
    // Cada seta entra defasada para as três se espalharem pelo cabo; o path já vem no sentido certo.
    const phase = readNumberAttribute(el, 'data-link-flow-phase');
    const distance = (normalized + phase) % period;
    if (el instanceof SVGElement || el instanceof HTMLElement) {
      el.style.setProperty('offset-distance', `${distance}px`);
    }
    return pathWrote;
  }
  const direction = el.getAttribute('data-link-flow');
  const signed = direction === 'upload' ? -normalized : normalized;
  if (el instanceof SVGElement) {
    el.style.strokeDashoffset = String(signed);
  } else {
    el.setAttribute('stroke-dashoffset', String(signed));
  }
  return false;
}

function normalizeViewScale(scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function arrowPathCacheKey(pathD: string, viewScale: number): string {
  return `${pathD}\0${viewScale}`;
}

/** Atualiza o deslocamento via rAF com velocidade fixa por faixa. */
export function startLinkFlowAnimation(root: HTMLElement): LinkFlowController {
  let raf = 0;
  /** Timer do modo dormente — nenhuma faixa no DOM, nada para animar. */
  let idleTimer = 0;
  let paused = false;
  let viewScale = 1;
  let lanes: Element[] = [];
  let lanesReadAt = 0;
  let frameTick = 0;

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
    const delay = queryIntervalForLaneCount(lanes.length);
    idleTimer = window.setTimeout(() => {
      idleTimer = 0;
      schedule();
    }, delay);
  };

  const tick = () => {
    raf = 0;
    const now = performance.now();
    const stale = lanes.some((el) => !el.isConnected);
    const scanInterval = queryIntervalForLaneCount(lanes.length);
    if (stale || now - lanesReadAt >= scanInterval) {
      lanes = Array.from(root.querySelectorAll('[data-link-flow]'));
      lanesReadAt = now;
    }
    const skip = frameSkipForLaneCount(lanes.length);
    frameTick += 1;
    if (frameTick % skip !== 0) {
      schedule();
      return;
    }
    let animated = advanceFlowLanes(lanes, viewScale);
    if (!animated) {
      lanes = Array.from(root.querySelectorAll('[data-link-flow]'));
      lanesReadAt = now;
      animated = advanceFlowLanes(lanes, viewScale);
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

  const setViewScale = (scale: number) => {
    const next = normalizeViewScale(scale);
    if (viewScale === next) {
      return;
    }
    viewScale = next;
    wake();
  };

  return {
    stop: clearPending,
    wake,
    setViewScale,
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
