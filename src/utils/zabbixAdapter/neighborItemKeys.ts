/** Classificação de keys Zabbix para vizinhança LLDP/CDP (via templates/LLD do host). */

export type NeighborProtocol = 'lldp' | 'cdp';

export type NeighborFieldKind =
  | 'localInterface'
  | 'remoteSysName'
  | 'remotePort'
  | 'remotePortDesc'
  | 'remoteMac'
  | 'remoteChassis';

export interface ParsedNeighborKey {
  protocol: NeighborProtocol;
  kind: NeighborFieldKind;
  /** Partes entre colchetes da key (índices SNMP, ifName, macros LLD). */
  tokens: string[];
}

function keyTokens(key: string): string[] {
  const open = key.indexOf('[');
  const close = key.lastIndexOf(']');
  if (open < 0 || close <= open) {
    return [];
  }
  return key
    .slice(open + 1, close)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function detectProtocol(key: string, name?: string): NeighborProtocol | undefined {
  const hay = `${key} ${name ?? ''}`.toLowerCase();
  if (hay.includes('cdp')) {
    return 'cdp';
  }
  if (hay.includes('lldp')) {
    return 'lldp';
  }
  return undefined;
}

function classifyKind(key: string, name?: string): NeighborFieldKind | undefined {
  const hay = `${key} ${name ?? ''}`.toLowerCase();
  if (
    hay.includes('remotesysname') ||
    hay.includes('rem.sysname') ||
    hay.includes('lldpremsysname') ||
    hay.includes('cdpcachedeviceid') ||
    hay.includes('deviceid') ||
    hay.includes('sysname')
  ) {
    return 'remoteSysName';
  }
  if (
    hay.includes('remoteportdesc') ||
    hay.includes('rem.port.desc') ||
    hay.includes('portdesc') ||
    hay.includes('portdescription')
  ) {
    return 'remotePortDesc';
  }
  if (
    hay.includes('remoteport') ||
    hay.includes('rem.port') ||
    hay.includes('portid') ||
    hay.includes('cdpcachedeviceport') ||
    hay.includes('deviceport')
  ) {
    return 'remotePort';
  }
  if (hay.includes('remotemac') || hay.includes('chassisid') || hay.includes('mac')) {
    return hay.includes('chassis') ? 'remoteChassis' : 'remoteMac';
  }
  if (hay.includes('localport') || hay.includes('localif') || hay.includes('ifname')) {
    return 'localInterface';
  }
  return undefined;
}

/** Classifica item Zabbix de vizinhança (LLDP/CDP) — depende do template do host. */
export function parseNeighborItemKey(key: string, name?: string): ParsedNeighborKey | undefined {
  const protocol = detectProtocol(key, name);
  if (!protocol) {
    return undefined;
  }
  const kind = classifyKind(key, name);
  if (!kind) {
    return undefined;
  }
  return { protocol, kind, tokens: keyTokens(key) };
}
