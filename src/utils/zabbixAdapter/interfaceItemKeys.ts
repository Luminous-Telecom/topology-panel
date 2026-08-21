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

export interface InterfaceKeyParseOptions {
  rxKeyword?: string;
  txKeyword?: string;
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

function classifyByCustomKeywords(
  key: string,
  opts?: InterfaceKeyParseOptions
): InterfaceMetricKind | undefined {
  const lower = key.toLowerCase();
  const rx = opts?.rxKeyword?.trim().toLowerCase();
  const tx = opts?.txKeyword?.trim().toLowerCase();
  if (rx && lower.includes(rx)) {
    return 'rx';
  }
  if (tx && lower.includes(tx)) {
    return 'tx';
  }
  return undefined;
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

function isDiscoveryPrototype(token: string): boolean {
  return /\{#/.test(token);
}

function baseKeyFromItemKey(key: string): string | undefined {
  const bracket = key.indexOf('[');
  const base = (bracket > 0 ? key.slice(0, bracket) : key).trim();
  return base || undefined;
}

/** Heurística genérica sobre a parte da key antes de `[`. */
function classifyGenericBaseKey(baseKey: string): InterfaceMetricKind | undefined {
  const k = baseKey.toLowerCase();

  if (
    k.includes('percentile') ||
    k.includes('percentil') ||
    k.includes('optical') ||
    k.includes('rxpower') ||
    k.includes('txpower') ||
    k.includes('temperature') ||
    k.includes('bgp') ||
    k.includes('icmpping')
  ) {
    return undefined;
  }

  if (k.includes('inoctets') || k.includes('ifhcinoctets')) {
    return 'rx';
  }
  if (k.includes('outoctets') || k.includes('ifhcoutoctets')) {
    return 'tx';
  }
  if (k.includes('ifoperstatus')) {
    return 'operStatus';
  }
  if (k.includes('ifadminstatus')) {
    return 'adminStatus';
  }
  if (k.includes('ifspeed')) {
    return 'speed';
  }
  if (k.includes('inerrors') || k.includes('ifinerrors')) {
    return 'errors';
  }
  if (k.includes('outerrors') || k.includes('ifouterrors')) {
    return 'errors';
  }
  if (k.includes('indiscards') || k.includes('ifindiscards')) {
    return 'drops';
  }
  if (k.includes('outdiscards') || k.includes('ifoutdiscards')) {
    return 'drops';
  }

  if (/\.(?:errors?|err)\.(?:in|out)$|(?:in|out)\.(?:errors?|err)$/i.test(k)) {
    return 'errors';
  }
  if (/operstatus($|\.)/.test(k) || /(?:^|\.)oper[\W_]?status($|\.)/.test(k)) {
    return 'operStatus';
  }
  if (/adminstatus($|\.)/.test(k) || /(?:^|\.)admin[\W_]?status($|\.)/.test(k)) {
    return 'adminStatus';
  }

  if (/^modul(?:ation|acao)?$/i.test(k) || /(?:^|\.)bandwidth$/i.test(k)) {
    return 'speed';
  }

  if (/\.rx(?:\.|$)/.test(k)) {
    return 'rx';
  }
  if (/\.tx(?:\.|$)/.test(k)) {
    return 'tx';
  }
  if (/\.in$/.test(k) || /\.input$/.test(k)) {
    return 'rx';
  }
  if (/\.out$/.test(k) || /\.output$/.test(k)) {
    return 'tx';
  }
  if (/\.speed$/.test(k)) {
    return 'speed';
  }
  if (/\.errors$/.test(k) || /\.erros$/.test(k)) {
    return 'errors';
  }
  if (/\.drops$/.test(k) || /\.discards$/.test(k)) {
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
export function parseInterfaceItemKey(
  key: string,
  opts?: InterfaceKeyParseOptions
): ParsedInterfaceKey | undefined {
  const trimmed = key.trim();
  const interfaceToken = extractInterfaceTokenFromKey(trimmed);
  if (!interfaceToken || isDiscoveryPrototype(interfaceToken)) {
    return undefined;
  }

  const baseKey = baseKeyFromItemKey(trimmed);
  const kind =
    classifyByPatterns(trimmed) ??
    (baseKey ? classifyGenericBaseKey(baseKey) : undefined) ??
    classifyByCustomKeywords(trimmed, opts);
  if (!kind) {
    return undefined;
  }

  return {
    kind,
    interfaceToken,
    snmpIndex: snmpIndexFromToken(interfaceToken),
  };
}
