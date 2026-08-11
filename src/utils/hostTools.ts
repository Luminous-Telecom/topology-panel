import { isIpv4 } from './ipv4';

export type HostToolId = 'ping' | 'web' | 'winbox' | 'telnet' | 'winboxNovo' | 'ssh';

export interface HostToolDef {
  id: HostToolId;
  label: string;
}

export interface HostToolAuth {
  username?: string;
  password?: string;
}

/** Credenciais do host (prioridade) ou padrão do painel. */
export function resolveToolAuth(
  node: { toolUsername?: string; toolPassword?: string },
  panel?: { toolUsername?: string; toolPassword?: string }
): HostToolAuth {
  const username = node.toolUsername?.trim() || panel?.toolUsername?.trim() || undefined;
  const password =
    node.toolPassword != null && node.toolPassword !== ''
      ? node.toolPassword
      : panel?.toolPassword != null && panel.toolPassword !== ''
        ? panel.toolPassword
        : undefined;
  return { username, password };
}

export const HOST_TOOLS: HostToolDef[] = [
  { id: 'ping', label: 'Ping' },
  { id: 'web', label: 'Web' },
  { id: 'winbox', label: 'Winbox' },
  { id: 'telnet', label: 'Telnet' },
  { id: 'winboxNovo', label: 'Winbox Novo' },
  { id: 'ssh', label: 'SSH' },
];

/** Extrai um IPv4 solto de texto livre (ex.: "10.0.0.5 - core") — regex distinta de `isIpv4`. */
const IPV4_IN_TEXT = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;

export function hostIp(node: { subtitle?: string }): string | undefined {
  const raw = node.subtitle?.trim();
  if (!raw) {
    return undefined;
  }
  if (isIpv4(raw)) {
    return raw;
  }
  const match = raw.match(IPV4_IN_TEXT);
  return match?.[1];
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

export async function copyPingCommand(ip: string): Promise<string> {
  const cmd = `ping ${ip.trim()}`;
  const ok = await copyText(cmd);
  return ok ? 'Comando copiado para a área de transferência' : `Copie manualmente: ${cmd}`;
}

function openUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Abre esquema customizado (winbox://, winboxnovo://, ssh://, …).
 * Não usa window.open+close: isso abre/fecha uma guia e cancela o diálogo do protocolo.
 */
function tryProtocol(url: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'display:none;width:0;height:0;border:0;position:fixed;left:-9999px';
  document.body.appendChild(iframe);
  try {
    if (iframe.contentWindow) {
      iframe.contentWindow.location.href = url;
    } else {
      iframe.src = url;
    }
  } catch {
    iframe.src = url;
  }
  window.setTimeout(() => iframe.remove(), 4000);

  const a = document.createElement('a');
  a.href = url;
  a.style.cssText = 'display:none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Base64 URL-safe (sem % — o handler do Windows corrompe %XX no %1). */
function toB64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function authPrefix(auth?: HostToolAuth): string {
  const user = auth?.username?.trim();
  if (!user) {
    return '';
  }
  const pass = auth?.password;
  if (pass != null && pass !== '') {
    return `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`;
  }
  return `${encodeURIComponent(user)}@`;
}

/**
 * Winbox/WinBoxNovo — IP e credenciais na query (o Chrome coloca "/" após o host
 * em winbox://IP?… e isso ia parar no Connect To).
 *   winbox://open?h=IP&c=BASE64URL(user\\npass)
 */
function winboxUrl(ip: string, variant: 'classic' | 'novo', auth?: HostToolAuth): string {
  const scheme = variant === 'novo' ? 'winboxnovo' : 'winbox';
  const user = auth?.username?.trim();
  const pass = auth?.password;
  const h = encodeURIComponent(ip.trim());
  if (user && pass != null && pass !== '') {
    return `${scheme}://open?h=${h}&c=${toB64Url(`${user}\n${pass}`)}`;
  }
  if (user) {
    return `${scheme}://open?h=${h}&c=${toB64Url(`${user}\n`)}`;
  }
  return `${scheme}://open?h=${h}`;
}

function sshUrl(ip: string, auth?: HostToolAuth): string {
  return `ssh://${authPrefix(auth)}${ip}`;
}

function telnetUrl(ip: string, auth?: HostToolAuth): string {
  return `telnet://${authPrefix(auth)}${ip}`;
}

async function openWinbox(
  target: string,
  variant: 'classic' | 'novo',
  auth?: HostToolAuth
): Promise<string> {
  const user = auth?.username?.trim();
  const pass = auth?.password;
  const app = variant === 'novo' ? 'WinBoxNovo' : 'Winbox';
  tryProtocol(winboxUrl(target, variant, auth));

  if (!user || pass == null || pass === '') {
    const copied = await copyText(target);
    const tip = copied ? ' IP copiado.' : '';
    return (
      `Abrindo ${app} em ${target}…${tip}` +
      ' Cadastre usuário e senha no host (Propriedades) para login automático.'
    );
  }
  return `Abrindo ${app} em ${target} como ${user} (login automático)…`;
}

/** Executa ferramenta de acesso ao host (Winbox, SSH, Telnet, etc.). */
export async function runHostTool(
  tool: HostToolId,
  ip: string,
  auth?: HostToolAuth
): Promise<string | undefined> {
  const target = ip.trim();
  if (!isIpv4(target)) {
    return 'IP inválido ou indisponível';
  }

  switch (tool) {
    case 'ping':
      return copyPingCommand(target);
    case 'web':
      openUrl(`http://${target}`);
      return undefined;
    case 'winbox':
      return openWinbox(target, 'classic', auth);
    case 'winboxNovo':
      return openWinbox(target, 'novo', auth);
    case 'telnet': {
      tryProtocol(telnetUrl(target, auth));
      const who = auth?.username?.trim() ? ` (user ${auth.username.trim()})` : '';
      return `Abrindo Telnet em ${target}${who}…`;
    }
    case 'ssh': {
      tryProtocol(sshUrl(target, auth));
      const who = auth?.username?.trim() ? ` (user ${auth.username.trim()})` : '';
      return `Abrindo SSH em ${target}${who}…`;
    }
    default:
      return undefined;
  }
}
