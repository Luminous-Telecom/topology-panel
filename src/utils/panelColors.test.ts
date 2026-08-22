import { createTheme } from '@grafana/data';
import { describe, expect, it } from 'vitest';
import {
  hostTypeFillColor,
  normalizeStoredPanelColors,
  panelColorWithAlpha,
  resolvePanelColor,
} from './panelColors';
import { TopologyPanelOptions } from '../types';

const theme = createTheme({ colors: { mode: 'dark' } });

describe('resolvePanelColor', () => {
  it('hex passa direto', () => {
    expect(resolvePanelColor(theme, '#FF0000')).toBe('#FF0000');
  });

  it('rgb() passa direto; hsl() vira hex', () => {
    expect(resolvePanelColor(theme, 'rgb(10, 20, 30)')).toBe('rgb(10, 20, 30)');
    expect(resolvePanelColor(theme, 'hsl(0, 100%, 50%)')).toBe('#ff0000');
  });

  it('nome de tema Grafana resolve via theme.visualization.hues', () => {
    const resolved = resolvePanelColor(theme, 'green');
    expect(resolved).toMatch(/^#/);
    expect(resolved).not.toBe('green');
  });

  it('extrai fixedColor/color/value de objetos de cor do Grafana', () => {
    expect(resolvePanelColor(theme, { fixedColor: '#123456' })).toBe('#123456');
    expect(resolvePanelColor(theme, { color: '#654321' })).toBe('#654321');
  });

  it('sem cor definida, retorna string vazia (sem fallback mágico)', () => {
    expect(resolvePanelColor(theme, undefined)).toBe('');
    expect(resolvePanelColor(theme, '')).toBe('');
  });
});

describe('panelColorWithAlpha', () => {
  it('converte hex de 6 dígitos para rgba', () => {
    expect(panelColorWithAlpha('#FF0000', 0.5)).toBe('rgba(255,0,0,0.5)');
  });

  it('converte hex de 3 dígitos para rgba', () => {
    expect(panelColorWithAlpha('#0F0', 0.2)).toBe('rgba(0,255,0,0.2)');
  });

  it('lança erro para cor inválida em vez de usar um valor de emergência', () => {
    expect(() => panelColorWithAlpha('rgb(1,2,3)', 0.5)).toThrow();
    expect(() => panelColorWithAlpha('not-a-color', 0.5)).toThrow();
  });
});

describe('hostTypeFillColor', () => {
  it('sem ícone ou sem hostTypeColors configurado, retorna undefined', () => {
    expect(hostTypeFillColor(undefined, { switch_managed: '#111' })).toBeUndefined();
    expect(hostTypeFillColor('switch_managed', undefined)).toBeUndefined();
  });

  it('retorna a cor configurada para o ícone, ignorando entradas vazias', () => {
    expect(hostTypeFillColor('switch_managed', { switch_managed: '#ABCDEF', router: '  ' })).toBe('#ABCDEF');
    expect(hostTypeFillColor('router', { switch_managed: '#ABCDEF', router: '  ' })).toBeUndefined();
  });

  it('nuvem nova usa a cor de network quando cloud ainda não tem cor própria', () => {
    expect(hostTypeFillColor('cloud', { network: '#ffffff' })).toBe('#ffffff');
    expect(hostTypeFillColor('cloud', { cloud: '#eeeeee', network: '#ffffff' })).toBe('#eeeeee');
  });
});

describe('normalizeStoredPanelColors', () => {
  const baseOptions = {
    colorOnline: 'green',
    colorOffline: '#C62828',
    colorAlert: '#F9A825',
    colorUnknown: '#9E9E9E',
    colorStatic: '#616161',
    colorSubmap: '#455A64',
    colorLink: '#90A4AE',
    colorLinkDownload: '#4FC3F7',
    colorLinkUpload: '#FFB74D',
    colorNetworkFill: 'rgba(0,0,0,0.2)',
    colorNetworkBorder: '#FFFFFF',
  } as unknown as TopologyPanelOptions;

  it('converte nomes de tema salvos (ex.: "green") para hex e marca changed=true', () => {
    const { options, changed } = normalizeStoredPanelColors(baseOptions, theme);
    expect(changed).toBe(true);
    expect(options.colorOnline).toMatch(/^#/);
    expect(options.colorOffline).toBe('#C62828');
  });

  it('já normalizado (tudo hex/rgb), não muda nada e changed=false', () => {
    const normalized = normalizeStoredPanelColors(baseOptions, theme).options;
    const { changed } = normalizeStoredPanelColors(normalized, theme);
    expect(changed).toBe(false);
  });
});
