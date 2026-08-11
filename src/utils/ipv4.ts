/**
 * Regex canônica de IPv4 — módulo folha sem dependências, para evitar import circular
 * (`utils.ts` importa de `hostTools.ts`, que também precisa validar IPv4).
 */
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isIpv4(value: string): boolean {
  return IPV4.test(value.trim());
}
