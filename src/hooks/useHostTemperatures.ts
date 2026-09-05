import { useEffect, useState } from 'react';
import { fetchHostTemperatures } from '../services/zabbixHostTemperature';
import type { HostTemperatureReading } from '../utils/hostTemperature';

export interface UseHostTemperaturesResult {
  loading: boolean;
  loadError?: string;
  readings: HostTemperatureReading[];
}

const EMPTY: UseHostTemperaturesResult = { loading: false, readings: [] };

/** Temperaturas do host no hover — só dispara com a opção ligada e hostid. */
export function useHostTemperatures(params: {
  enabled: boolean;
  datasourceUid?: string;
  hostid?: string;
}): UseHostTemperaturesResult {
  const { enabled, datasourceUid, hostid } = params;
  const [state, setState] = useState<UseHostTemperaturesResult>(EMPTY);

  useEffect(() => {
    const uid = datasourceUid?.trim();
    const id = hostid?.trim();
    if (!enabled || !uid || !id) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    setState({ loading: true, readings: [] });
    void fetchHostTemperatures(uid, id)
      .then((readings) => {
        if (!cancelled) {
          setState({ loading: false, readings });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            loading: false,
            readings: [],
            loadError: 'Não foi possível carregar as temperaturas.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, datasourceUid, hostid]);

  return state;
}
