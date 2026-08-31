import { describe, expect, it } from 'vitest';
import {
  isAllowedLicenseApiUrl,
  licenseRejectMessage,
  resolveLicenseGate,
  resolveLicenseIp,
} from './licenseValidation';

describe('isAllowedLicenseApiUrl', () => {
  it('aceita só http e https', () => {
    expect(isAllowedLicenseApiUrl('https://loja.example/api/license/validate')).toBe(true);
    expect(isAllowedLicenseApiUrl('http://localhost:3001/api/license/validate')).toBe(true);
    expect(isAllowedLicenseApiUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedLicenseApiUrl('/api/license/validate')).toBe(false);
    expect(isAllowedLicenseApiUrl('')).toBe(false);
  });
});

describe('resolveLicenseIp', () => {
  it('prefere o IP das opções quando é IPv4 válido', () => {
    expect(resolveLicenseIp('203.0.113.10', 'grafana.example')).toBe('203.0.113.10');
  });

  it('usa o hostname da página quando ele já é IPv4', () => {
    expect(resolveLicenseIp('', '10.0.0.1')).toBe('10.0.0.1');
  });

  it('não aceita hostname que não é IPv4', () => {
    expect(resolveLicenseIp('', 'grafana.example')).toBeUndefined();
    expect(resolveLicenseIp('999.1.1.1', '10.0.0.1')).toBe('10.0.0.1');
  });
});

describe('resolveLicenseGate', () => {
  const readyInput = {
    enforced: true,
    licenseKey: 'key-1',
    licenseApiUrl: 'https://loja.example/api/license/validate',
    licenseIp: '203.0.113.10',
    pageHostname: 'grafana.example',
  };

  it('pula a checagem quando a licença não é exigida', () => {
    expect(resolveLicenseGate({ ...readyInput, enforced: false })).toEqual({ status: 'skip' });
  });

  it('bloqueia sem chave, URL http(s) ou IP', () => {
    expect(resolveLicenseGate({ ...readyInput, licenseKey: ' ' }).status).toBe('blocked');
    expect(resolveLicenseGate({ ...readyInput, licenseApiUrl: 'ftp://loja.example' }).status).toBe('blocked');
    expect(resolveLicenseGate({ ...readyInput, licenseIp: '', pageHostname: 'grafana.example' }).status).toBe(
      'blocked'
    );
  });

  it('libera o pedido quando chave, URL e IP estão ok', () => {
    expect(resolveLicenseGate(readyInput)).toEqual({
      status: 'ready',
      licenseKey: 'key-1',
      apiUrl: 'https://loja.example/api/license/validate',
      ip: '203.0.113.10',
    });
  });
});

describe('licenseRejectMessage', () => {
  it('traduz os motivos conhecidos da loja', () => {
    expect(licenseRejectMessage('ip_not_authorized')).toMatch(/IP não autorizado/);
    expect(licenseRejectMessage('not_found')).toMatch(/não encontrada/);
    expect(licenseRejectMessage('desconhecido')).toMatch(/Licença inválida/);
  });
});
