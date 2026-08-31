import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLicenseValidation } from './useLicenseValidation';
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
});
