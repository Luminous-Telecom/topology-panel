import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLicenseValidation, licenseCacheKey } from './licenseClient';
import { TOPOLOGY_PLUGIN_ID } from '../utils/licenseValidation';

describe('fetchLicenseValidation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('aceita resposta válida deste plugin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true, reason: null, pluginId: TOPOLOGY_PLUGIN_ID }),
      })
    );
    const result = await fetchLicenseValidation(
      'https://loja.example/api/license/validate',
      'key-ok',
      '203.0.113.10'
    );
    expect(result).toEqual({ kind: 'valid' });
  });

  it('rejeita chave de outro plugin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true, reason: null, pluginId: 'outro-plugin' }),
      })
    );
    const result = await fetchLicenseValidation(
      'https://loja.example/api/license/validate',
      'key-other',
      '203.0.113.10'
    );
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.retryable).toBe(false);
      expect(result.message).toMatch(/não é do Topology Panel/);
    }
  });

  it('marca falha de rede como retentável', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await fetchLicenseValidation(
      'https://loja.example/api/license/validate',
      'key-net',
      '203.0.113.10'
    );
    expect(result).toEqual({
      kind: 'invalid',
      retryable: true,
      message: 'Não foi possível validar a licença. Confira a URL da loja e a rede deste Grafana.',
    });
  });

  it('chave de cache separa URL, chave e IP', () => {
    expect(licenseCacheKey('https://a', 'k', '1.1.1.1')).not.toBe(licenseCacheKey('https://b', 'k', '1.1.1.1'));
  });
});
