export interface IcmpHistoryPoint {
  clock: number;
  value: number;
}

/** Recorta a série para o sparkline — history/trend podem vir com milhares de pontos. */
export function downsampleIcmpHistory(
  points: readonly IcmpHistoryPoint[],
  maxPoints: number
): IcmpHistoryPoint[] {
  if (maxPoints < 2 || points.length <= maxPoints) {
    return [...points];
  }
  const last = points.length - 1;
  const out: IcmpHistoryPoint[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    const index = i === maxPoints - 1 ? last : Math.round((i * last) / (maxPoints - 1));
    const point = points[index];
    if (point) {
      out.push(point);
    }
  }
  return out;
}

export function formatIcmpRttMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) {
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

export function formatIcmpLossPct(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) {
    return '—';
  }
  return `${pct.toFixed(1)}%`;
}

export function formatIcmpRangeLabel(fromSec: number, toSec: number): string {
  const from = new Date(fromSec * 1000);
  const to = new Date(toSec * 1000);
  const sameDay = from.toDateString() === to.toDateString();
  const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  if (sameDay) {
    return `${from.toLocaleDateString('pt-BR', dateOpts)} ${from.toLocaleTimeString('pt-BR', timeOpts)} – ${to.toLocaleTimeString('pt-BR', timeOpts)}`;
  }
  return `${from.toLocaleString('pt-BR', { ...dateOpts, ...timeOpts })} – ${to.toLocaleString('pt-BR', { ...dateOpts, ...timeOpts })}`;
}
