import { describe, expect, it } from 'vitest';
import { isLicenseEnforced, isLocalDevelopmentHost } from './licenseValidation';

describe('isLicenseEnforced', () => {
  it('não exige licença em localhost mesmo com build de produção', () => {
    expect(isLocalDevelopmentHost('127.0.0.1')).toBe(true);
    expect(isLocalDevelopmentHost('localhost')).toBe(true);
    expect(isLocalDevelopmentHost('grafana.example')).toBe(false);
    const prev = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...prev, hostname: '127.0.0.1' },
    });
    try {
      expect(isLicenseEnforced()).toBe(false);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: prev });
    }
  });
});
