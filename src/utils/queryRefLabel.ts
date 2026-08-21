const ZABBIX_GROUP_HINT_PREFIX = 'Grupo Zabbix: ';

/** Rótulo curto para badge (APD, FCO…) — refIds longos usam o último segmento do caminho. */
export function queryRefBadgeLabel(refId: string): string {
  const normalized = refId.trim();
  if (!normalized) {
    return '?';
  }
  const slash = normalized.lastIndexOf('/');
  if (slash >= 0 && slash < normalized.length - 1) {
    return normalized.slice(slash + 1);
  }
  if (normalized.length <= 4) {
    return normalized;
  }
  return `${normalized.slice(0, 3)}…`;
}

/** Título legível da linha no editor de queries/grupos. */
export function queryRefRowTitle(refId: string, hint?: string): string {
  const trimmedHint = hint?.trim();
  if (trimmedHint?.startsWith(ZABBIX_GROUP_HINT_PREFIX)) {
    const groupName = trimmedHint.slice(ZABBIX_GROUP_HINT_PREFIX.length).trim();
    if (groupName) {
      return groupName;
    }
  }
  return `Consulta ${refId.trim()}`;
}
