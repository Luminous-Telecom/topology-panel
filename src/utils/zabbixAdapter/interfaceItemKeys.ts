/** Classificação de keys Zabbix para métricas de interface de rede. */

export type InterfaceMetricKind =
  | 'rx'
  | 'tx'
  | 'operStatus'
  | 'adminStatus'
  | 'speed'
  | 'errors'
  | 'drops';

export interface ParsedInterfaceKey {
  kind: InterfaceMetricKind;
  interfaceToken: string;
  snmpIndex?: string;
}

const RX_PATTERNS = [
  /^net\.if\.in\[/i,
  /^vfs\.net\.if\.in\[/i,
  /^ifhcinoctets\[/i,
  /^ifinoctets\[/i,
];

const TX_PATTERNS = [
  /^net\.if\.out\[/i,
  /^vfs\.net\.if\.out\[/i,
  /^ifhcoutoctets\[/i,
  /^ifoutoctets\[/i,
];

const OPER_STATUS_PATTERNS = [/^net\.if\.status\[/i, /^ifoperstatus\[/i];
const ADMIN_STATUS_PATTERNS = [/^net\.if\.adminstatus\[/i, /^ifadminstatus\[/i];
const SPEED_PATTERNS = [/^net\.if\.speed\[/i, /^ifspeed\[/i];
const ERRORS_PATTERNS = [/^net\.if\.in\.errors\[/i, /^net\.if\.out\.errors\[/i, /^ifinerrors\[/i, /^ifouterrors\[/i];
const DROPS_PATTERNS = [/^net\.if\.in\.dropped\[/i, /^net\.if\.out\.dropped\[/i, /^ifindiscards\[/i, /^ifoutdiscards\[/i];

function matchesAny(key: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(key));
}

/** Extrai o token da interface entre colchetes da key Zabbix. */
export function extractInterfaceTokenFromKey(key: string): string | undefined {
  const trimmed = key.trim();
  const open = trimmed.indexOf('[');
  const close = trimmed.lastIndexOf(']');
  if (open < 0 || close <= open) {
    return undefined;
  }
  const inner = trimmed.slice(open + 1, close).trim();
  if (!inner) {
    return undefined;
  }
  return inner;
}

function classifyByPatterns(key: string): InterfaceMetricKind | undefined {
  if (matchesAny(key, RX_PATTERNS)) {
    return 'rx';
  }
  if (matchesAny(key, TX_PATTERNS)) {
    return 'tx';
  }
  if (matchesAny(key, OPER_STATUS_PATTERNS)) {
    return 'operStatus';
  }
  if (matchesAny(key, ADMIN_STATUS_PATTERNS)) {
    return 'adminStatus';
  }
  if (matchesAny(key, SPEED_PATTERNS)) {
    return 'speed';
  }
  if (matchesAny(key, ERRORS_PATTERNS)) {
    return 'errors';
  }
  if (matchesAny(key, DROPS_PATTERNS)) {
    return 'drops';
  }
  return undefined;
}

/** SNMP index numérico quando o token da key é só dígitos. */
export function snmpIndexFromToken(token: string): string | undefined {
  const t = token.trim();
  if (/^\d+$/.test(t)) {
    return t;
  }
  const prefixed = t.match(/^(?:ifHCInOctets|ifHCOutOctets|ifInOctets|ifOutOctets|ifOperStatus|ifAdminStatus|ifSpeed)\.(\d+)$/i);
  if (prefixed) {
    return prefixed[1];
  }
  return undefined;
}

/** Classifica uma key Zabbix e extrai identificador da interface. */
export function parseInterfaceItemKey(key: string): ParsedInterfaceKey | undefined {
  const kind = classifyByPatterns(key);
  const interfaceToken = extractInterfaceTokenFromKey(key);
  if (!kind || !interfaceToken) {
    return undefined;
  }
  return {
    kind,
    interfaceToken,
    snmpIndex: snmpIndexFromToken(interfaceToken),
  };
}
