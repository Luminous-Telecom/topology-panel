export type HostToolId = 'ping' | 'web' | 'winbox' | 'telnet' | 'winboxNovo' | 'ssh';

export interface HostToolDef {
  id: HostToolId;
  label: string;
}

/** Credenciais opcionais (opções do painel) para Winbox / SSH / Telnet. */
export interface HostToolAuth {
  username?: string;
  password?: string;
}

export const HOST_TOOLS: HostToolDef[] = [
  { id: 'ping', label: 'Ping' },
  { id: 'web', label: 'Web' },
  { id: 'winbox', label: 'Winbox' },
  { id: 'telnet', label: 'Telnet' },
  { id: 'winboxNovo', label: 'Winbox Novo' },
  { id: 'ssh', label: 'SSH' },
];

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV4_IN_TEXT = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;

export function hostIp(node: { subtitle?: string }): string | undefined {
  const raw = node.subtitle?.trim();
  if (!raw) {
    return undefined;
  }
  if (IPV4.test(raw)) {
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

/** variant: classic = winbox.exe | novo = "Winbox Novo.exe" via winboxnovo:// */
function winboxUrl(
  ip: string,
  variant: 'classic' | 'novo',
  auth?: HostToolAuth
): string {
  const scheme = variant === 'novo' ? 'winboxnovo' : 'winbox';
  return `${scheme}://${authPrefix(auth)}${ip}`;
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
  tryProtocol(winboxUrl(target, variant, auth));
  const copied = await copyText(target);
  const tip = copied ? ' IP copiado.' : '';
  const who = auth?.username?.trim() ? ` (user ${auth.username.trim()})` : '';
  const app = variant === 'novo' ? 'Winbox Novo' : 'Winbox';
  return (
    `Abrindo ${app} em ${target}${who}…${tip}` +
    ' Se o app não abrir, registre o protocolo — ver README (extras/winbox-protocol).'
  );
}

/** Executa ferramenta de acesso ao host (estilo The Dude). */
export async function runHostTool(
  tool: HostToolId,
  ip: string,
  auth?: HostToolAuth
): Promise<string | undefined> {
  const target = ip.trim();
  if (!IPV4.test(target)) {
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
