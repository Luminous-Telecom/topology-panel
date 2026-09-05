import { describe, expect, it } from 'vitest';
import {
  formatTemperatureValue,
  hostTemperatureLabel,
  isTemperatureItem,
  parseHostTemperatureRows,
} from './hostTemperature';

describe('hostTemperature', () => {
  it('reconhece temp, temperature e temperatura e ignora template', () => {
    expect(isTemperatureItem({ key_: 'sensor.temp[cpu]' })).toBe(true);
    expect(isTemperatureItem({ name: 'CPU temperature' })).toBe(true);
    expect(isTemperatureItem({ name: 'Temperatura da placa' })).toBe(true);
    expect(isTemperatureItem({ units: '°C', key_: 'sensor[1]' })).toBe(true);
    expect(isTemperatureItem({ key_: 'vendor.template.info' })).toBe(false);
    expect(isTemperatureItem({ name: 'Login attempt' })).toBe(false);
  });

  it('formata o valor com a unidade do item', () => {
    expect(formatTemperatureValue(42, '°C')).toBe('42 °C');
    expect(formatTemperatureValue(36.7, 'C')).toBe('36.7 C');
    expect(hostTemperatureLabel({ name: 'CPU', key_: 'sensor.temp[cpu]' })).toBe('CPU');
  });

  it('lista todas as temperaturas do host e descarta item que não é sensor', () => {
    const readings = parseHostTemperatureRows([
      { itemid: '11', name: 'CPU', key_: 'sensor.temp[cpu]', lastvalue: '48', units: '°C' },
      { itemid: '12', name: 'Placa', key_: 'sensor.temp[board]', lastvalue: '39.2', units: '°C' },
      { itemid: '13', name: 'Template info', key_: 'vendor.template.info', lastvalue: '1' },
      { itemid: '14', name: 'CPU', key_: 'sensor.temp[cpu]', lastvalue: 'n/a' },
    ]);
    expect(readings.map((row) => `${row.label}:${row.value}`)).toEqual(['CPU:48', 'Placa:39.2']);
  });
});
