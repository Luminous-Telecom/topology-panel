/** Item de temperatura do hover — lastvalue, sem key de ambiente. */
export interface HostTemperatureReading {
  itemId: string;
  label: string;
  value: number;
  units: string;
  lastClock?: number;
}

/** Evita casar template/attempt: só temp, temperature, temperatura como token. */
const TEMP_TOKEN = /(^|[^a-z0-9])(temp(erature|eratura)?)([^a-z0-9]|$)/i;
const TEMP_UNITS = /^(°?[cCfF]|degc|degf)$/i;

export function isTemperatureItem(item: {
  key_?: string;
  name?: string;
  units?: string;
}): boolean {
  const units = item.units?.trim() ?? '';
  if (units && TEMP_UNITS.test(units)) {
    return true;
  }
  return TEMP_TOKEN.test(`${item.key_ ?? ''} ${item.name ?? ''}`);
}

export function formatTemperatureValue(value: number, units?: string): string {
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
  const u = units?.trim();
  return u ? `${n} ${u}` : n;
}

export function hostTemperatureLabel(item: { name?: string; key_?: string }): string {
  const name = item.name?.trim();
  if (name) {
    return name;
  }
  const key = item.key_?.trim();
  return key || 'Temperatura';
}

export function parseHostTemperatureRows(
  rows: Array<{
    itemid?: string;
    name?: string;
    key_?: string;
    lastvalue?: string;
    units?: string;
    lastclock?: string;
  }>
): HostTemperatureReading[] {
  const readings: HostTemperatureReading[] = [];
  for (const row of rows) {
    if (!isTemperatureItem(row)) {
      continue;
    }
    const itemId = row.itemid?.trim();
    if (!itemId) {
      continue;
    }
    const value = Number(String(row.lastvalue ?? '').trim());
    if (!Number.isFinite(value)) {
      continue;
    }
    const clock = Number(row.lastclock);
    readings.push({
      itemId,
      label: hostTemperatureLabel(row),
      value,
      units: row.units?.trim() ?? '',
      lastClock: Number.isFinite(clock) && clock > 0 ? clock : undefined,
    });
  }
  return readings.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}
