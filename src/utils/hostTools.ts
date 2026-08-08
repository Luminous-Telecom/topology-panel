export type HostToolId = 'ping' | 'web' | 'winbox' | 'telnet' | 'winboxNovo' | 'ssh';

export interface HostToolDef {
  id: HostToolId;
  label: string;
}

export const HOST_TOOLS: HostToolDef[] = [
  { id: 'ping', label: 'Ping' },
  { id: 'web', label: 'Web' },
  { id: 'winbox', label: 'Winbox' },
  { id: 'telnet', label: 'Telnet' },
  { id: 'winboxNovo', label: 'WinboxNovo' },
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
 * Abre esquema customizado (winbox://, ssh://, …).
 * Dentro do iframe do painel Grafana, <a>.click() costuma ser ignorado —
 * por isso tentamos janela top-level e iframe oculto.
 */
function tryProtocol(url: string): void {
  // 1) Nova janela top-level (preserva user-gesture fora do iframe do painel)
  let opened: Window | null = null;
  try {
    opened = window.open(url, '_blank');
  } catch {
    opened = null;
  }
  if (opened) {
    window.setTimeout(() => {
      try {
        opened.close();
      } catch {
        /* ignore */
      }
    }, 800);
    return;
  }

  // 2) iframe oculto — comum para URI handlers registrados no SO
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
  window.setTimeout(() => iframe.remove(), 2500);

  // 3) Fallback <a>
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Executa ferramenta de acesso ao host (estilo The Dude). */
export async function runHostTool(tool: HostToolId, ip: string): Promise<string | undefined> {
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
      tryProtocol(`winbox://${target}`);
      return `Abrindo Winbox em ${target}…`;
    case 'winboxNovo':
      tryProtocol(`winbox://${target}:8291`);
      return `Abrindo WinboxNovo em ${target}…`;
    case 'telnet':
      tryProtocol(`telnet://${target}`);
      return `Abrindo Telnet em ${target}…`;
    case 'ssh':
      tryProtocol(`ssh://${target}`);
      return `Abrindo SSH em ${target}…`;
    default:
      return undefined;
  }
}
