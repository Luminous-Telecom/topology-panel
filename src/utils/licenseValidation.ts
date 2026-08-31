import { isIpv4 } from './ipv4';

export const TOPOLOGY_PLUGIN_ID = 'luminous-topology-panel';

export type LicenseGate =
  | { status: 'skip' }
  | { status: 'blocked'; message: string }
  | { status: 'ready'; licenseKey: string; apiUrl: string; ip: string };

export function isLicenseEnforced(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isAllowedLicenseApiUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function resolveLicenseIp(licenseIp: string | undefined, pageHostname: string): string | undefined {
  const fromOption = licenseIp?.trim() ?? '';
  if (fromOption && isIpv4(fromOption)) {
    return fromOption;
  }
  const host = pageHostname.trim();
  if (isIpv4(host)) {
    return host;
  }
  return undefined;
}

export function resolveLicenseGate(input: {
  enforced: boolean;
  licenseKey?: string;
  licenseApiUrl?: string;
  licenseIp?: string;
  pageHostname: string;
}): LicenseGate {
  if (!input.enforced) {
    return { status: 'skip' };
  }

  const licenseKey = input.licenseKey?.trim() ?? '';
  if (!licenseKey) {
    return {
      status: 'blocked',
      message: 'Informe a chave de licença nas opções do painel (Licença).',
    };
  }

  const apiUrl = input.licenseApiUrl?.trim() ?? '';
  if (!apiUrl || !isAllowedLicenseApiUrl(apiUrl)) {
    return {
      status: 'blocked',
      message: 'Informe a URL de validação da loja nas opções do painel (Licença).',
    };
  }

  const ip = resolveLicenseIp(input.licenseIp, input.pageHostname);
  if (!ip) {
    return {
      status: 'blocked',
      message: 'Informe o IP público deste Grafana nas opções do painel (Licença), igual ao cadastrado na loja.',
    };
  }

  return { status: 'ready', licenseKey, apiUrl, ip };
}

export function licenseRejectMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'not_found':
      return 'Licença não encontrada. Confira a chave nas opções do painel.';
    case 'ip_not_authorized':
      return 'IP não autorizado. Cadastre este IP na loja (Minha conta) e use o mesmo valor no painel.';
    case 'expired':
      return 'Licença expirada.';
    case 'status_pending':
      return 'Licença ainda não está ativa. Conclua o pagamento na loja.';
    case 'status_suspended':
      return 'Licença suspensa. Fale com o suporte da loja.';
    case 'status_cancelled':
      return 'Licença cancelada.';
    case 'invalid_payload':
      return 'A loja recusou o pedido de validação. Confira chave e IP.';
    default:
      return 'Licença inválida. Confira chave, URL da loja e IP nas opções do painel.';
  }
}
