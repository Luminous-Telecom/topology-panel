import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLicenseValidation, licenseCacheKey } from './licenseClient';
import { TOPOLOGY_PLUGIN_ID } from '../utils/licenseValidation';

const STORE_VALIDATE = 'https://loja.example/api/license/validate';

const verifyLicenseTicket = vi.hoisted(() => vi.fn());

vi.mock('../utils/licenseTicket', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/licenseTicket')>();
  return {
    ...actual,
    verifyLicenseTicket: (...args: unknown[]) => verifyLicenseTicket(...args),
  };
});

describe('fetchLicenseValidation', () => {
  beforeEach(() => {
    verifyLicenseTicket.mockReset();
    verifyLicenseTicket.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('aceita resposta válida deste plugin com ticket da loja', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        valid: true,
        reason: null,
        pluginId: TOPOLOGY_PLUGIN_ID,
        pluginVersion: '1.9.0',
        ticket: 'signed.ticket.value',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchLicenseValidation(STORE_VALIDATE, 'key-ok', '203.0.113.10');
    expect(result).toEqual({ kind: 'valid', storeVersion: '1.9.0' });
    expect(verifyLicenseTicket).toHaveBeenCalledWith('signed.ticket.value', {
      licenseKey: 'key-ok',
      ip: '203.0.113.10',
      pluginId: TOPOLOGY_PLUGIN_ID,
    });
    const init = fetchMock.mock.calls[0][1] as { body: string };
    const body = JSON.parse(init.body) as { pluginVersion: string };
    expect(body.pluginVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('recusa valid:true sem ticket assinado', async () => {
    verifyLicenseTicket.mockResolvedValue(false);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          valid: true,
          reason: null,
          pluginId: TOPOLOGY_PLUGIN_ID,
          pluginVersion: '1.9.0',
        }),
      })
    );
    const result = await fetchLicenseValidation(STORE_VALIDATE, 'key-unsigned', '203.0.113.10');
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.retryable).toBe(false);
      expect(result.message).toMatch(/não assinou/);
    }
  });

  it('rejeita chave de outro plugin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true, reason: null, pluginId: 'outro-plugin' }),
      })
    );
    const result = await fetchLicenseValidation(STORE_VALIDATE, 'key-other', '203.0.113.10');
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.retryable).toBe(false);
      expect(result.message).toMatch(/não é do Topology Panel/);
    }
  });

  it('marca falha de rede como retentável', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await fetchLicenseValidation(STORE_VALIDATE, 'key-net', '203.0.113.10');
    expect(result).toEqual({
      kind: 'invalid',
      retryable: true,
      message: 'Não foi possível validar a licença. Confira a URL da loja e a rede deste Grafana.',
    });
  });

  it('chave de cache separa URL, chave e IP', () => {
    expect(licenseCacheKey('https://a', 'k', '1.1.1.1', '1.0.0')).not.toBe(
      licenseCacheKey('https://b', 'k', '1.1.1.1', '1.0.0')
    );
  });
});
