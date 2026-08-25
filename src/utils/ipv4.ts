/**
 * Regex canônica de IPv4 — módulo folha sem dependências, para evitar import circular
 * (`utils.ts` importa de `hostTools.ts`, que também precisa validar IPv4).
 */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIpv4(value: string): boolean {
  const match = IPV4.exec(value.trim());
  if (!match) {
    return false;
  }
  // Só o formato não basta: `999.1.1.1` casava a regex e virava alvo de Winbox/SSH/HTTP.
  return match.slice(1).every((octet) => Number(octet) <= 255);
}
