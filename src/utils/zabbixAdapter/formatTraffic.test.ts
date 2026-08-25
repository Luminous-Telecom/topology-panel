import { describe, expect, it } from 'vitest';
import { formatEndpointTrafficPair, formatLinkMapTrafficLabel, formatPluginRefreshInterval, formatRelativeUpdate, formatSignalDbm, parseSignedLastValue } from './formatTraffic';

describe('formatPluginRefreshInterval', () => {
  it('usa o intervalo do plugin, com o mínimo de 5s', () => {
    expect(formatPluginRefreshInterval(30)).toBe('a cada 30s');
    expect(formatPluginRefreshInterval(2)).toBe('a cada 5s');
  });

  it('sem intervalo configurado é busca manual', () => {
    expect(formatPluginRefreshInterval(null)).toBe('manual');
    expect(formatPluginRefreshInterval(0)).toBe('manual');
  });
});

describe('formatLinkMapTrafficLabel', () => {
  it('mostra TX e RX com unidade real', () => {
    expect(formatLinkMapTrafficLabel(2_970_000_000, 543_800_000)).toBe('↑2.97 Gbps ↓543.8 Mbps');
  });

  it('omite a direção sem valor', () => {
    expect(formatLinkMapTrafficLabel(1_000_000, undefined)).toBe('↑1 Mbps');
  });
});

describe('formatEndpointTrafficPair', () => {
  it('origem mostra TX depois RX', () => {
    expect(formatEndpointTrafficPair('10 Mbps', '20 Mbps', 'from')).toEqual({
      label: 'TX / RX',
      value: '20 Mbps / 10 Mbps',
    });
  });

  it('destino mostra RX depois TX', () => {
    expect(formatEndpointTrafficPair('10 Mbps', '20 Mbps', 'to')).toEqual({
      label: 'RX / TX',
      value: '10 Mbps / 20 Mbps',
    });
  });

  it('aceita rótulos de sinal', () => {
    expect(formatEndpointTrafficPair('-8.5 dBm', '-2 dBm', 'from', { from: 'Sinal TX / RX', to: 'Sinal RX / TX' })).toEqual({
      label: 'Sinal TX / RX',
      value: '-2 dBm / -8.5 dBm',
    });
  });
});

describe('formatRelativeUpdate', () => {
  it('mostra segundos abaixo de um minuto', () => {
    expect(formatRelativeUpdate(1_000, 11_000)).toBe('10 segundo(s) atrás');
  });

  it('mostra minutos a partir de 60s', () => {
    expect(formatRelativeUpdate(0, 41 * 60_000)).toBe('41 minuto(s) atrás');
  });
});

describe('formatSignalDbm', () => {
  it('formata potência negativa em dBm', () => {
    expect(formatSignalDbm(-8.54)).toBe('-8.54 dBm');
    expect(formatSignalDbm(1.2)).toBe('1.2 dBm');
  });

  it('ignora valor não finito', () => {
    expect(formatSignalDbm(undefined)).toBeUndefined();
    expect(formatSignalDbm(Number.NaN)).toBeUndefined();
  });
});

describe('parseSignedLastValue', () => {
  it('aceita lastvalue negativo de sinal', () => {
    expect(parseSignedLastValue('-8.5')).toBe(-8.5);
    expect(parseSignedLastValue('0')).toBe(0);
  });

  it('ignora texto vazio ou não numérico', () => {
    expect(parseSignedLastValue(undefined)).toBeUndefined();
    expect(parseSignedLastValue('')).toBeUndefined();
    expect(parseSignedLastValue('n/a')).toBeUndefined();
  });
});
