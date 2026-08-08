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

export function hostIp(node: { subtitle?: string }): string | undefined {
  const ip = node.subtitle?.trim();
  if (ip && IPV4.test(ip)) {
    return ip;
  }
  return undefined;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function openUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function tryProtocol(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Executa ferramenta de acesso ao host (estilo The Dude). */
export async function runHostTool(tool: HostToolId, ip: string): Promise<string | undefined> {
  const target = ip.trim();
  if (!IPV4.test(target)) {
    return 'IP inválido ou indisponível';
  }

  switch (tool) {
    case 'ping': {
      const cmd = `ping ${target}`;
      const ok = await copyText(cmd);
      return ok ? `Comando copiado: ${cmd}` : `Execute: ${cmd}`;
    }
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
