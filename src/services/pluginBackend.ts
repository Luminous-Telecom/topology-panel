import { TOPOLOGY_PLUGIN_ID } from '../utils/licenseValidation';
import { grafanaFetch } from './grafanaFetch';

export const PLUGIN_RESOURCES = `/api/plugins/${TOPOLOGY_PLUGIN_ID}/resources`;

export type PluginLicenseState =
  | { status: 'valid'; storeVersion?: string; grafanaIp?: string }
  | { status: 'blocked'; message: string; retryable?: boolean; grafanaIp?: string };

type PluginLicenseResponse = {
  valid?: boolean;
  message?: string;
  retryable?: boolean;
  storeVersion?: string;
  grafanaIp?: string;
};

function mapLicense(body: PluginLicenseResponse): PluginLicenseState {
  if (body.valid) {
    return {
      status: 'valid',
      storeVersion: body.storeVersion,
      grafanaIp: body.grafanaIp,
    };
  }
  return {
    status: 'blocked',
    message:
      body.message?.trim() ||
      'Licença inválida. Confira a instalação e o IP em Minha conta na loja.',
    retryable: body.retryable,
    grafanaIp: body.grafanaIp,
  };
}

function licenseFetchError(err: unknown): PluginLicenseState {
  const status = (err as { status?: number }).status;
  if (status === 404) {
    return {
      status: 'blocked',
      retryable: true,
      message: 'Reinicie o Grafana depois de atualizar o plugin. O backend ainda não está no ar.',
    };
  }
  return {
    status: 'blocked',
    retryable: true,
    message: 'Não foi possível validar a licença. Confira a URL da loja e a rede deste Grafana.',
  };
}

export async function fetchPluginLicense(pageHost = ''): Promise<PluginLicenseState> {
  const host = pageHost.trim();
  try {
    const body = await grafanaFetch<PluginLicenseResponse>({
      url: `${PLUGIN_RESOURCES}/license`,
      params: host ? { host } : undefined,
    });
    return mapLicense(body ?? {});
  } catch (err) {
    return licenseFetchError(err);
  }
}
