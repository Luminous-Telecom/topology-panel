import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LICENSE_REFRESH_MS, useLicenseValidation } from './useLicenseValidation';
import { fetchPluginLicense } from '../services/pluginBackend';

vi.mock('../services/pluginBackend', () => ({
  fetchPluginLicense: vi.fn(),
}));

vi.mock('../utils/licenseValidation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/licenseValidation')>();
  return { ...actual, isLicenseEnforced: () => true };
});

describe('useLicenseValidation', () => {
  it('expõe o estado válido do backend Go', async () => {
    vi.mocked(fetchPluginLicense).mockResolvedValue({
      status: 'valid',
      storeVersion: '1.9.0',
      grafanaIp: '203.0.113.10',
    });
    const { result } = renderHook(() => useLicenseValidation());
    await waitFor(() => expect(result.current.status).toBe('valid'));
    expect(result.current).toEqual({ status: 'valid', storeVersion: '1.9.0' });
  });

  it('bloqueia o mapa quando a loja deixa de autorizar o IP, sem recarregar a página', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetchPluginLicense)
        .mockResolvedValueOnce({
          status: 'valid',
          storeVersion: '1.9.0',
          grafanaIp: '203.0.113.10',
        })
        .mockResolvedValue({
          status: 'blocked',
          message: 'O IP deste Grafana (203.0.113.10) não está na licença. Cadastre esse IP em Minha conta.',
        });
      const { result } = renderHook(() => useLicenseValidation());
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.status).toBe('valid');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LICENSE_REFRESH_MS);
      });
      expect(result.current.status).toBe('blocked');
      if (result.current.status === 'blocked') {
        expect(result.current.message).toMatch(/não está na licença/);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
