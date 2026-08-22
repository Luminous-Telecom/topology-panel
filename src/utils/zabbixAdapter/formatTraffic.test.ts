import { describe, expect, it } from 'vitest';
import { formatLinkMapTrafficLabel, formatPluginRefreshInterval, formatRelativeUpdate } from './formatTraffic';

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

describe('formatRelativeUpdate', () => {
  it('mostra segundos abaixo de um minuto', () => {
    expect(formatRelativeUpdate(1_000, 11_000)).toBe('10 segundo(s) atrás');
  });

  it('mostra minutos a partir de 60s', () => {
    expect(formatRelativeUpdate(0, 41 * 60_000)).toBe('41 minuto(s) atrás');
  });
});
