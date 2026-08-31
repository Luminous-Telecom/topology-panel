import { createHash, createPrivateKey, generateKeyPairSync, sign as cryptoSign } from 'crypto';
import { describe, expect, it } from 'vitest';
import { LICENSE_TICKET_PUBLIC_KEY } from './licenseTicketPublicKey';
import { verifyLicenseTicket } from './licenseTicket';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signTicket(privatePem: string, claims: { pluginId: string; ip: string; licenseKey: string; exp?: number }): string {
  const key = createPrivateKey(privatePem);
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
  const payload = base64url(
    Buffer.from(
      JSON.stringify({
        iss: 'luminous-store',
        aud: claims.pluginId,
        pluginId: claims.pluginId,
        ip: claims.ip,
        keyHash: createHash('sha256').update(claims.licenseKey, 'utf8').digest('hex'),
        iat: now,
        exp: claims.exp ?? now + 3600,
      })
    )
  );
  const data = `${header}.${payload}`;
  const signature = cryptoSign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
  return `${data}.${base64url(signature)}`;
}

describe('verifyLicenseTicket', () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const expected = { licenseKey: 'LUM-TEST', ip: '203.0.113.10', pluginId: 'luminous-topology-panel' };

  it('aceita ticket ES256 válido', async () => {
    const ticket = signTicket(privatePem, expected);
    expect(await verifyLicenseTicket(ticket, expected, publicPem)).toBe(true);
  });

  it('recusa ticket de outra chave, IP ou chave de licença', async () => {
    const ticket = signTicket(privatePem, expected);
    expect(await verifyLicenseTicket(ticket, expected, LICENSE_TICKET_PUBLIC_KEY)).toBe(false);
    expect(await verifyLicenseTicket(ticket, { ...expected, ip: '10.0.0.1' }, publicPem)).toBe(false);
    expect(await verifyLicenseTicket(ticket, { ...expected, licenseKey: 'outra' }, publicPem)).toBe(false);
    expect(await verifyLicenseTicket('nao-e-jwt', expected, publicPem)).toBe(false);
  });

  it('recusa ticket expirado', async () => {
    const ticket = signTicket(privatePem, { ...expected, exp: Math.floor(Date.now() / 1000) - 120 });
    expect(await verifyLicenseTicket(ticket, expected, publicPem)).toBe(false);
  });
});
