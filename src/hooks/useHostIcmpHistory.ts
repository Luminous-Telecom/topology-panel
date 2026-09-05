import { useEffect, useState } from 'react';
import { fetchHostIcmpHistory, type HostIcmpHistory } from '../services/zabbixIcmpHistory';

export interface IcmpHistoryRange {
  fromSec: number;
  toSec: number;
}

export interface UseHostIcmpHistoryResult {
  loading: boolean;
  loadError?: string;
  history?: HostIcmpHistory;
}

const EMPTY: UseHostIcmpHistoryResult = { loading: false };

/**
 * Histórico ICMP (RTT e perda) no intervalo do dashboard — só dispara com hostid e intervalo válidos.
 */
export function useHostIcmpHistory(params: {
  enabled: boolean;
  datasourceUid?: string;
  hostid?: string;
  fromSec: number;
  toSec: number;
}): UseHostIcmpHistoryResult {
  const { enabled, datasourceUid, hostid, fromSec, toSec } = params;
  const [state, setState] = useState<UseHostIcmpHistoryResult>(EMPTY);

  useEffect(() => {
    const uid = datasourceUid?.trim();
    const id = hostid?.trim();
    if (!enabled || !uid || !id || !Number.isFinite(fromSec) || !Number.isFinite(toSec) || fromSec >= toSec) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    setState({ loading: true });
    void fetchHostIcmpHistory(uid, id, fromSec, toSec)
      .then((history) => {
        if (!cancelled) {
          setState({ loading: false, history });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ loading: false, loadError: 'Não foi possível carregar o histórico ICMP.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, datasourceUid, hostid, fromSec, toSec]);

  return state;
}
