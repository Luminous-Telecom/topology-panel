import { createAsyncCache } from './asyncCache';
import { zabbixCall, type ZabbixRpc } from './zabbixCall';
import { fetchIcmpItemSnapshot, type IcmpHistoryItemRef, type HostIcmpStatus } from './zabbixQuery';
import { downsampleIcmpHistory, type IcmpHistoryPoint } from '../utils/icmpHistorySeries';
import { isNumericZabbixItemId } from '../utils/zabbixApi';

/** Acima disso o hover usa `trend.get` (média horária) em vez de `history.get` cru. */
export const ICMP_HISTORY_TREND_AFTER_SEC = 12 * 60 * 60;
export const ICMP_HISTORY_MAX_POINTS = 80;

export type HostIcmpHistory = {
  status: HostIcmpStatus;
  rttMs: IcmpHistoryPoint[];
  lossPct: IcmpHistoryPoint[];
};

type HistoryRow = { clock?: string | number; value?: string | number };
type TrendRow = { clock?: string | number; value_avg?: string | number };

const historyCache = createAsyncCache<HostIcmpHistory>({
  ttlMs: 45_000,
  maxEntries: 40,
  isCacheable: (value) => !value.status.error,
});

function asFinite(value: string | number | undefined): number | undefined {
  if (value == null) {
    return undefined;
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : undefined;
}

function parseHistoryRows(rows: HistoryRow[], scale = 1): IcmpHistoryPoint[] {
  const points: IcmpHistoryPoint[] = [];
  for (const row of rows) {
    const clock = asFinite(row.clock);
    const value = asFinite(row.value);
    if (clock == null || value == null) {
      continue;
    }
    points.push({ clock, value: value * scale });
  }
  points.sort((a, b) => a.clock - b.clock);
  return downsampleIcmpHistory(points, ICMP_HISTORY_MAX_POINTS);
}

function parseTrendRows(rows: TrendRow[], scale = 1): IcmpHistoryPoint[] {
  const points: IcmpHistoryPoint[] = [];
  for (const row of rows) {
    const clock = asFinite(row.clock);
    const value = asFinite(row.value_avg);
    if (clock == null || value == null) {
      continue;
    }
    points.push({ clock, value: value * scale });
  }
  points.sort((a, b) => a.clock - b.clock);
  return downsampleIcmpHistory(points, ICMP_HISTORY_MAX_POINTS);
}

async function fetchSeries(
  datasourceUid: string,
  item: IcmpHistoryItemRef,
  timeFrom: number,
  timeTill: number,
  scale: number,
  call: ZabbixRpc
): Promise<IcmpHistoryPoint[]> {
  const span = timeTill - timeFrom;
  if (span > ICMP_HISTORY_TREND_AFTER_SEC) {
    const rows = await call<TrendRow[]>(datasourceUid, 'trend.get', {
      itemids: [item.itemid],
      time_from: timeFrom,
      time_till: timeTill,
      output: ['clock', 'value_avg'],
    });
    return parseTrendRows(Array.isArray(rows) ? rows : [], scale);
  }
  const rows = await call<HistoryRow[]>(datasourceUid, 'history.get', {
    itemids: [item.itemid],
    history: item.valueType,
    time_from: timeFrom,
    time_till: timeTill,
    sortfield: 'clock',
    sortorder: 'ASC',
    output: 'extend',
  });
  return parseHistoryRows(Array.isArray(rows) ? rows : [], scale);
}

export async function fetchHostIcmpHistory(
  datasourceUid: string,
  hostId: string,
  timeFrom: number,
  timeTill: number,
  call: ZabbixRpc = zabbixCall
): Promise<HostIcmpHistory> {
  const uid = datasourceUid.trim();
  const id = hostId.trim();
  if (!uid || !isNumericZabbixItemId(id) || !Number.isFinite(timeFrom) || !Number.isFinite(timeTill) || timeFrom >= timeTill) {
    return {
      status: { reachable: null, lossPct: null, rttMs: null },
      rttMs: [],
      lossPct: [],
    };
  }
  const key = `${uid}\u0000${id}\u0000${timeFrom}\u0000${timeTill}`;
  return historyCache.get(key, async () => {
    const snapshot = await fetchIcmpItemSnapshot(uid, id, call);
    const rttP = snapshot.rtt
      ? fetchSeries(uid, snapshot.rtt, timeFrom, timeTill, 1000, call).catch(() => [])
      : Promise.resolve([]);
    const lossP = snapshot.loss
      ? fetchSeries(uid, snapshot.loss, timeFrom, timeTill, 1, call).catch(() => [])
      : Promise.resolve([]);
    const [rttMs, lossPct] = await Promise.all([rttP, lossP]);
    return { status: snapshot.status, rttMs, lossPct };
  });
}

/** Testes: limpa o cache do histórico ICMP do hover. */
export function dropIcmpHistoryCache(): void {
  historyCache.invalidate();
}
