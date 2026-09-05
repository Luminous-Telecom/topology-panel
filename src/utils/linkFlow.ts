/**
 * Animação contínua das faixas RX/TX.
 *
 * Traço curto + linecap redondo vira cápsula (pacote). Soma do padrão = LINK_FLOW_PERIOD.
 *
 * O passo por faixa vem de `data-link-flow-step` (igual em todos, via `syncLinkFlowStepsInRoot`).
 * O React não grava `offset-distance`, `offset-path` nem `stroke-dashoffset` — gravar speed/path
 * no SVG a cada poll zerava o deslocamento no Chrome.
 */

export const LINK_FLOW_DASH = '7 11';
export const LINK_FLOW_PERIOD = 18;
/** Multiplicador-base do passo; o controle do painel entra em `data-link-flow-step`. */
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

/** Atributos lidos na varredura do DOM — o frame só consulta este cache. */
type LaneMeta = {
  step: number;
  period: number;
  phase: number;
  isArrow: boolean;
  direction: string;
  pathD: string;
  rotate: string;
  storageKey: string | undefined;
  active: boolean;
};

const laneMeta = new WeakMap<Element, LaneMeta>();

function buildLaneMeta(el: Element): LaneMeta {
  const isArrow = el.hasAttribute(FLOW_ARROW_ATTR);
  const customPeriod = readNumberAttribute(el, 'data-link-flow-period');
  const period = isArrow
    ? readNumberAttribute(el, 'data-link-flow-length')
    : customPeriod > 0
      ? customPeriod
      : LINK_FLOW_PERIOD;
  const linkKey = el.getAttribute('data-link-key');
  const direction = el.getAttribute('data-link-flow') ?? '';
  const mult = readNumberAttribute(el, 'data-link-flow-step');
  return {
    step: LINK_FLOW_SPEED * (mult > 0 ? mult : 1),
    period,
    phase: readNumberAttribute(el, 'data-link-flow-phase'),
    isArrow,
    direction,
    pathD: el.getAttribute('data-link-flow-path') ?? '',
    rotate: el.getAttribute('data-link-flow-rotate') === 'auto' ? 'auto' : '0deg',
    storageKey: linkKey ? (direction ? `${linkKey}\0${direction}` : linkKey) : undefined,
    active: el.getAttribute('data-link-flow-active') !== 'false',
  };
}

function metaOf(el: Element): LaneMeta {
  const cached = laneMeta.get(el);
  if (cached) {
    return cached;
  }
  const built = buildLaneMeta(el);
  laneMeta.set(el, built);
  return built;
}

function refreshLaneMeta(lanes: Element[]): void {
  for (const el of lanes) {
    laneMeta.set(el, buildLaneMeta(el));
  }
}

export type LinkFlowController = {
  stop: () => void;
  setPaused: (paused: boolean) => void;
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
/** Sobrevive à troca do `<path>` quando o React remonta o traço amarelo. */
const flowOffsetsByLinkKey = new Map<string, number>();
/** `offset-path` já aplicado — regravar o mesmo path no poll zera `offset-distance` no Chrome. */
const appliedFlowPaths = new WeakMap<Element, string>();

/** Reconsulta o DOM no máximo a cada 250 ms — link novo entra na animação no fatiamento seguinte. */
const FLOW_QUERY_INTERVAL_MS = 250;
const FLOW_QUERY_INTERVAL_HEAVY_MS = 500;
const FLOW_FRAME_MS = 1000 / 60;
/** Teto do dt: aba de fundo ou piscada pesada não dá um pulo enorme no offset. */
const FLOW_MAX_DT_MS = 80;

function frameSkipForLaneCount(count: number): number {
  if (count <= 60) {
    return 1;
  }
  if (count <= 120) {
    return 2;
  }
  if (count <= 240) {
    return 3;
  }
  return 4;
}

function queryIntervalForLaneCount(count: number): number {
  return count > 80 ? FLOW_QUERY_INTERVAL_HEAVY_MS : FLOW_QUERY_INTERVAL_MS;
}

function readFlowOffset(el: Element, meta: LaneMeta): number {
  if (meta.storageKey !== undefined) {
    const keyed = flowOffsetsByLinkKey.get(meta.storageKey);
    if (keyed !== undefined) {
      return keyed;
    }
  }
  return flowOffsets.get(el) ?? 0;
}

function storeFlowOffset(el: Element, meta: LaneMeta, normalized: number): void {
  flowOffsets.set(el, normalized);
  if (meta.storageKey !== undefined) {
    flowOffsetsByLinkKey.set(meta.storageKey, normalized);
  }
}

function advanceFlowLanes(lanes: Element[], frameUnits: number): number {
  let animated = 0;
  const units = Number.isFinite(frameUnits) && frameUnits > 0 ? frameUnits : 1;
  for (const el of lanes) {
    if (!el.isConnected) {
      continue;
    }
    const meta = metaOf(el);
    if (!meta.active) {
      continue;
    }
    writeFlowOffset(el, meta, readFlowOffset(el, meta) + meta.step * units);
    animated += 1;
  }
  return animated;
}

function ensureArrowOffsetPath(el: Element, meta: LaneMeta): boolean {
  if (!meta.pathD || !(el instanceof SVGElement || el instanceof HTMLElement)) {
    return false;
  }
  const cacheKey = `${meta.pathD}\0${meta.rotate}`;
  if (appliedFlowPaths.get(el) === cacheKey) {
    return false;
  }
  appliedFlowPaths.set(el, cacheKey);
  el.style.setProperty('offset-path', `path('${meta.pathD}')`);
  el.style.setProperty('offset-rotate', meta.rotate);
  return true;
}

function writeFlowOffset(el: Element, meta: LaneMeta, offset: number): boolean {
  if (meta.period <= 0) {
    return false;
  }
  const normalized = ((offset % meta.period) + meta.period) % meta.period;
  storeFlowOffset(el, meta, normalized);
  if (meta.isArrow) {
    const pathWrote = ensureArrowOffsetPath(el, meta);
    // Cada seta entra defasada para as três se espalharem pelo cabo; o path já vem no sentido certo.
    const distance = (normalized + meta.phase) % meta.period;
    if (el instanceof SVGElement || el instanceof HTMLElement) {
      el.style.setProperty('offset-distance', `${distance}px`);
    }
    return pathWrote;
  }
  const signed = meta.direction === 'upload' ? -normalized : normalized;
  if (el instanceof SVGElement) {
    el.style.strokeDashoffset = String(signed);
  } else {
    el.setAttribute('stroke-dashoffset', String(signed));
  }
  return false;
}

/** Atualiza o deslocamento via rAF com velocidade fixa por faixa. */
export function startLinkFlowAnimation(root: HTMLElement): LinkFlowController {
  let raf = 0;
  /** Timer do modo dormente — nenhuma faixa no DOM, nada para animar. */
  let idleTimer = 0;
  let paused = false;
  let lanes: Element[] = [];
  let lanesReadAt = 0;
  let frameTick = 0;
  let lastAnimatedAt = 0;
  let lastTickAt = 0;

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
    lastTickAt = 0;
    const recentlyActive = lastAnimatedAt > 0 && performance.now() - lastAnimatedAt < 2000;
    const delay = recentlyActive ? 32 : queryIntervalForLaneCount(lanes.length);
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
      refreshLaneMeta(lanes);
      lanesReadAt = now;
    }
    const skip = frameSkipForLaneCount(lanes.length);
    frameTick += 1;
    if (frameTick % skip !== 0) {
      schedule();
      return;
    }
    const elapsed = lastTickAt === 0 ? FLOW_FRAME_MS : now - lastTickAt;
    lastTickAt = now;
    const frameUnits = Math.min(Math.max(elapsed, 0), FLOW_MAX_DT_MS) / FLOW_FRAME_MS;
    let animated = advanceFlowLanes(lanes, frameUnits);
    if (!animated) {
      lanes = Array.from(root.querySelectorAll('[data-link-flow]'));
      refreshLaneMeta(lanes);
      lanesReadAt = now;
      animated = advanceFlowLanes(lanes, frameUnits);
    }
    if (!animated) {
      sleepUntilNextScan();
      return;
    }
    lastAnimatedAt = now;
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
      lastTickAt = 0;
      if (paused) {
        clearPending();
        return;
      }
      wake();
    },
  };
}
