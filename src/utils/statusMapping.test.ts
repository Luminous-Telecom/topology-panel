import { describe, expect, it } from 'vitest';
import {
  resolveHostStatusDisplay,
  resolveHostStatusFromValue,
  resolveStatusColor,
  statusFromHostDisplay,
  StatusColorOptions,
} from './statusMapping';

const colors: StatusColorOptions = {
  colorOnline: '#2E7D32',
  colorOffline: '#C62828',
  colorAlert: '#F9A825',
};

describe('resolveHostStatusFromValue', () => {
  it('valor não finito (NaN/Infinity) não resolve status', () => {
    expect(resolveHostStatusFromValue(NaN)).toBeUndefined();
    expect(resolveHostStatusFromValue(Infinity)).toBeUndefined();
  });

  it('latência 0 é offline e acima de 0 é online', () => {
    expect(resolveHostStatusFromValue(0)).toBe('offline');
    expect(resolveHostStatusFromValue(0.0006)).toBe('online');
    expect(resolveHostStatusFromValue(1)).toBe('online');
  });

  it('valor negativo não resolve status', () => {
    expect(resolveHostStatusFromValue(-1)).toBeUndefined();
  });
});

describe('statusFromHostDisplay', () => {
  it('lastvalue 0 é offline mesmo se o display ainda disser online', () => {
    expect(statusFromHostDisplay({ value: 0, status: 'online' })).toBe('offline');
  });

  it('sem lastvalue usa o status gravado', () => {
    expect(statusFromHostDisplay({ status: 'online' })).toBe('online');
    expect(statusFromHostDisplay(undefined)).toBeUndefined();
  });
});

describe('resolveStatusColor', () => {
  it('resolve a cor para cada um dos 3 status', () => {
    expect(resolveStatusColor('online', colors)).toBe(colors.colorOnline);
    expect(resolveStatusColor('offline', colors)).toBe(colors.colorOffline);
    expect(resolveStatusColor('alert', colors)).toBe(colors.colorAlert);
  });
});

describe('resolveHostStatusDisplay', () => {
  it('sem valor finito, retorna undefined', () => {
    expect(resolveHostStatusDisplay(NaN, colors)).toBeUndefined();
  });

  it('monta cor e texto a partir da latência', () => {
    expect(resolveHostStatusDisplay(0, colors)).toEqual({
      value: 0,
      status: 'offline',
      color: colors.colorOffline,
      text: 'Offline',
    });
    expect(resolveHostStatusDisplay(0.012, colors)).toEqual({
      value: 0.012,
      status: 'online',
      color: colors.colorOnline,
      text: 'Online',
    });
  });
});
