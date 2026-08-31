import { LICENSE_TICKET_PUBLIC_KEY } from './licenseTicketPublicKey';

export const LICENSE_TICKET_ISS = 'luminous-store';

export type LicenseTicketCheck = {
  licenseKey: string;
  ip: string;
  pluginId?: string;
};

function pemToSpkiBytes(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = pad + '='.repeat((4 - (pad.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToHex(digest);
}

type TicketPayload = {
  iss?: unknown;
  aud?: unknown;
  pluginId?: unknown;
  ip?: unknown;
  keyHash?: unknown;
  exp?: unknown;
};

function readPayload(ticket: string): { signingInput: string; signature: Uint8Array; payload: TicketPayload } | undefined {
  const parts = ticket.trim().split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return undefined;
  }
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(parts[1]));
    const payload = JSON.parse(json) as TicketPayload;
    return { signingInput: `${parts[0]}.${parts[1]}`, signature: base64UrlToBytes(parts[2]), payload };
  } catch {
    return undefined;
  }
}

/**
 * Confere assinatura ES256 da loja, IP, hash da chave e prazo.
 * Quem intercepta a rede não consegue forjar este ticket — a URL da loja vem da instalação.
 */
export async function verifyLicenseTicket(
  ticket: string,
  expected: LicenseTicketCheck,
  publicKeyPem = LICENSE_TICKET_PUBLIC_KEY
): Promise<boolean> {
  const parsed = readPayload(ticket);
  if (!parsed) {
    return false;
  }
  const { signingInput, signature, payload } = parsed;
  const pluginId = expected.pluginId ?? 'luminous-topology-panel';
  if (payload.iss !== LICENSE_TICKET_ISS || payload.aud !== pluginId || payload.pluginId !== pluginId) {
    return false;
  }
  if (payload.ip !== expected.ip.trim()) {
    return false;
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000) - 60) {
    return false;
  }
  const keyHash = await sha256Hex(expected.licenseKey.trim());
  if (payload.keyHash !== keyHash) {
    return false;
  }
  try {
    const key = await crypto.subtle.importKey(
      'spki',
      pemToSpkiBytes(publicKeyPem) as BufferSource,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature as BufferSource,
      new TextEncoder().encode(signingInput)
    );
  } catch {
    return false;
  }
}
