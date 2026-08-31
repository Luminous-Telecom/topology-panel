export const TOPOLOGY_PLUGIN_ID = 'luminous-topology-panel';

export type LicenseGate =
  | { status: 'skip' }
  | { status: 'blocked'; message: string }
  | { status: 'ready'; licenseKey: string; apiUrl: string };

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

export function resolveLicenseGate(input: {
  enforced: boolean;
  licenseKey?: string;
  licenseApiUrl?: string;
}): LicenseGate {
  if (!input.enforced) {
    return { status: 'skip' };
  }

  const licenseKey = input.licenseKey?.trim() ?? '';
  if (!licenseKey) {
    return {
      status: 'blocked',
      message: 'Rode o comando de instalação da loja neste Grafana. A chave não vai nas opções do painel.',
    };
  }

  const apiUrl = input.licenseApiUrl?.trim() ?? '';
  if (!apiUrl || !isAllowedLicenseApiUrl(apiUrl)) {
    return {
      status: 'blocked',
      message: 'Rode o comando de instalação da loja neste Grafana. A URL da loja é gravada na instalação.',
    };
  }

  return { status: 'ready', licenseKey, apiUrl };
}

export function licenseRejectMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'not_found':
      return 'Licença não encontrada. Rode de novo o comando de instalação da loja.';
    case 'ip_not_authorized':
      return 'IP não autorizado. Cadastre o IP deste Grafana em Minha conta na loja.';
    case 'expired':
      return 'Licença expirada.';
    case 'status_pending':
      return 'Licença ainda não está ativa. Conclua o pagamento na loja.';
    case 'status_suspended':
      return 'Licença suspensa. Fale com o suporte da loja.';
    case 'status_cancelled':
      return 'Licença cancelada.';
    case 'invalid_payload':
      return 'A loja recusou o pedido de validação. Cadastre o IP em Minha conta na loja.';
    default:
      return 'Licença inválida. Confira a instalação e o IP em Minha conta na loja.';
  }
}
