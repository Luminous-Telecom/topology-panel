import { describe, expect, it } from 'vitest';
import {
  isAllowedLicenseApiUrl,
  licenseRejectMessage,
  resolveLicenseGate,
} from './licenseValidation';
import { licenseStatusUrl, maskLicenseKey, parseInstalledLicenseFile, pickAuthorizedIp } from './licenseInstall';

describe('isAllowedLicenseApiUrl', () => {
  it('aceita só http e https', () => {
    expect(isAllowedLicenseApiUrl('https://loja.example/api/license/validate')).toBe(true);
    expect(isAllowedLicenseApiUrl('http://localhost:3001/api/license/validate')).toBe(true);
    expect(isAllowedLicenseApiUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedLicenseApiUrl('/api/license/validate')).toBe(false);
    expect(isAllowedLicenseApiUrl('')).toBe(false);
  });
});

describe('resolveLicenseGate', () => {
  const readyInput = {
    enforced: true,
    licenseKey: 'key-1',
    licenseApiUrl: 'https://loja.example/api/license/validate',
  };

  it('pula a checagem quando a licença não é exigida', () => {
    expect(resolveLicenseGate({ ...readyInput, enforced: false })).toEqual({ status: 'skip' });
  });

  it('bloqueia sem chave ou URL http(s)', () => {
    expect(resolveLicenseGate({ ...readyInput, licenseKey: ' ' }).status).toBe('blocked');
    expect(resolveLicenseGate({ ...readyInput, licenseApiUrl: 'ftp://loja.example' }).status).toBe('blocked');
  });

  it('libera o pedido quando a instalação gravou chave e URL', () => {
    expect(resolveLicenseGate(readyInput)).toEqual({
      status: 'ready',
      licenseKey: 'key-1',
      apiUrl: 'https://loja.example/api/license/validate',
    });
  });
});

describe('licenseRejectMessage', () => {
  it('traduz os motivos conhecidos da loja', () => {
    expect(licenseRejectMessage('ip_not_authorized')).toMatch(/Minha conta na loja/);
    expect(licenseRejectMessage('not_found')).toMatch(/instalação/);
    expect(licenseRejectMessage('desconhecido')).toMatch(/Licença inválida/);
  });
});

describe('licenseInstall', () => {
  it('monta a URL de status a partir da de validate', () => {
    expect(licenseStatusUrl('https://loja.example/api/license/validate')).toBe(
      'https://loja.example/api/license/status'
    );
  });

  it('lê o arquivo gravado na instalação', () => {
    expect(parseInstalledLicenseFile({ licenseKey: ' LUM-1 ', licenseApiUrl: ' https://loja.example/api/license/validate ' })).toEqual({
      licenseKey: 'LUM-1',
      licenseApiUrl: 'https://loja.example/api/license/validate',
    });
    expect(parseInstalledLicenseFile({})).toBeUndefined();
  });

  it('mascara a chave e escolhe o primeiro IPv4 da loja', () => {
    expect(maskLicenseKey('LUM-B5973B4F-5E02AC64-5CDA9387-47CAD0A6')).toMatch(/^LUM-B59…/);
    expect(pickAuthorizedIp(['not-an-ip', '203.0.113.10'])).toBe('203.0.113.10');
  });
});
