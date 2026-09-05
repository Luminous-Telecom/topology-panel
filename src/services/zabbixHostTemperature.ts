import { createAsyncCache } from './asyncCache';
import { zabbixCall, type ZabbixRpc } from './zabbixCall';
import { isNumericZabbixItemId } from '../utils/zabbixApi';
import { parseHostTemperatureRows, type HostTemperatureReading } from '../utils/hostTemperature';

const temperatureCache = createAsyncCache<HostTemperatureReading[]>({
  ttlMs: 45_000,
  maxEntries: 40,
});

type TempItemRow = {
  itemid?: string;
  name?: string;
  key_?: string;
  lastvalue?: string;
  units?: string;
  lastclock?: string;
};

/** Lastvalue de temperatura do host — só no hover, um `item.get` por hostid. */
export async function fetchHostTemperatures(
  datasourceUid: string,
  hostId: string,
  call: ZabbixRpc = zabbixCall
): Promise<HostTemperatureReading[]> {
  const uid = datasourceUid.trim();
  const id = hostId.trim();
  if (!uid || !isNumericZabbixItemId(id)) {
    return [];
  }
  return temperatureCache.get(`${uid}\u0000${id}`, async () => {
    const rows = await call<TempItemRow[]>(uid, 'item.get', {
      hostids: [id],
      output: ['itemid', 'name', 'key_', 'lastvalue', 'units', 'lastclock'],
      search: { key_: 'temp', name: 'temp' },
      searchByAny: true,
      filter: { status: 0 },
    });
    return parseHostTemperatureRows(Array.isArray(rows) ? rows : []);
  });
}

/** Testes: limpa o cache de temperatura do hover. */
export function dropHostTemperatureCache(): void {
  temperatureCache.invalidate();
}
