# Topology Panel

Plugin de painel para **Grafana 9+** que exibe mapas de topologia de rede, com status ao vivo via **Zabbix**.

Repositório: [github.com/Luminous-Telecom/topology-panel](https://github.com/Luminous-Telecom/topology-panel)

## Funcionalidades

- **Hosts** coloridos por status (ICMP / Perda de Pacotes do Zabbix)
- **Links** entre equipamentos, com tipos:
  - **Fibra** — linha contínua
  - **Rádio** — linha tracejada
- **Caixas de rede** (agrupamento), hosts, submapas e rótulos estáticos
- **Grade** configurável com snap ao mover/redimensionar
- **Pan/zoom** no mapa; seleção de links com destaque visual
- **Travas** separadas: mapa editável e caixas de rede (arrastar rede só quando destravada)
- **Menu Tools** — Ping, Web, Winbox, Telnet, SSH (botão direito no host)
- **Usuário/senha** nas opções do painel — pré-preenche Winbox, SSH e Telnet
- **Submapas** — clique abre outro dashboard Grafana
- **Tela cheia** e pause do tráfego nas linhas

## Requisitos

- Node.js **18+**
- Grafana **9+** (testado em Grafana 11/13)
- Datasource Zabbix (opcional, para cores de status)
- Windows + Winbox (para abrir Winbox a partir do navegador)

## Instalação do plugin (Grafana)

```bash
git clone https://github.com/Luminous-Telecom/topology-panel.git
cd topology-panel
npm install
npm run build
```

Copie o build para o servidor Grafana:

```bash
sudo mkdir -p /var/lib/grafana/plugins/luminous-topology-panel
sudo cp -r dist/* /var/lib/grafana/plugins/luminous-topology-panel/
sudo chown -R grafana:grafana /var/lib/grafana/plugins/luminous-topology-panel
```

Em `grafana.ini`:

```ini
[plugins]
allow_loading_unsigned_plugins = luminous-topology-panel
```

Reinicie o Grafana:

```bash
sudo systemctl restart grafana-server
```

## Abrir Winbox a partir do mapa (Windows)

O navegador só consegue abrir o Winbox se o protocolo `winbox://` estiver registrado no PC.
O MikroTik **não faz isso sozinho**.

### 1. Baixar os arquivos

- Abra: [extras/winbox-protocol](https://github.com/Luminous-Telecom/topology-panel/tree/main/extras/winbox-protocol)
- Ou baixe o ZIP do repositório: **Code → Download ZIP** e extraia a pasta `extras/winbox-protocol`
- Ou clone o repo e entre em `extras/winbox-protocol`

Arquivos necessários:

| Arquivo | Função |
|---------|--------|
| `install.ps1` | Registra `winbox://` e `winboxnovo://` no Windows |
| `open-winbox.vbs` | Abre o app **sem** janela do PowerShell |
| `open-winbox.ps1` | Lê a URI e chama o executável |
| `open-winbox.bat` | Atalho para o `.vbs` |
| `winbox64.exe` | **Você copia** — Tools → Winbox |
| `WinBoxNovo.exe` | **Você copia** — Tools → Winbox Novo |

### 2. Copiar os executáveis

Nesta pasta `extras/winbox-protocol`:

- `winbox64.exe` → menu **Winbox**
- `WinBoxNovo.exe` → menu **Winbox Novo**

### 3. Registrar o protocolo (uma vez por PC)

Abra o **PowerShell** na pasta `extras/winbox-protocol` e rode:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Deve aparecer: `Registrado: winbox://` e `Registrado: winboxnovo://`.

### 4. Testar

Na barra de endereços do Chrome/Edge:

```text
winbox://192.168.88.1
winboxnovo://192.168.88.1
winboxnovo://admin:senha@192.168.88.1
```

Na primeira vez, permita abrir o aplicativo e marque para lembrar.

### 5. Usar no Grafana

1. Botão direito no host → **Tools** → **Winbox** ou **Winbox Novo**
2. Se pediu permissão no navegador, confirme

### Remover o registro

```powershell
Remove-Item -Recurse -Force HKCU:\Software\Classes\winbox
Remove-Item -Recurse -Force HKCU:\Software\Classes\winboxnovo
```

## Usuário e senha (Winbox / SSH / Telnet)

### Por host (recomendado)

1. Modo edição do dashboard → **Propriedades** no host (botão direito ou duplo-clique)
2. Preencha **Usuário (Tools)** e **Senha (Tools)**
3. Salve o dashboard

Ao clicar em **Winbox** / **WinBoxNovo**, o launcher Windows chama o exe com IP, usuário e senha:

`WinBoxNovo.exe "IP" "usuario" "senha"` — login automático.

> Após atualizar o `extras/winbox-protocol`, rode `install.ps1` de novo no PC.
> Se não logar, confira `last-launch.txt` na mesma pasta (`hasPassword=True`).

### Padrão do painel (fallback)

Opções do painel → **Acesso remoto**: usuário/senha usados quando o host não tem credencial própria.

> **Segurança:** senhas ficam no JSON do dashboard/mapa (visíveis a quem edita). Prefira contas de operação, não a senha master.

## Uso no Grafana

1. Crie um dashboard → adicione painel **Topology Panel**
2. **Opções → Zabbix**: UID do datasource (status ICMP via API)
3. **Opções → Topologia**: edite o mapa (hosts, links, redes)
4. **Opções → Acesso remoto**: usuário/senha padrão das Tools (opcional)
5. Modo edição do dashboard (lápis) para mover hosts; **Save dashboard** para gravar

### Opções do painel

| Opção | Descrição |
|-------|-----------|
| Mostrar grade | Exibe linhas de alinhamento |
| Tamanho da grade | Passo em pixels (padrão: 10) |
| Alinhar à grade | Snap ao mover hosts e caixas |
| Permitir arrastar mapa | Pan com clique na área vazia |
| Usuário / Senha (Tools) | Credenciais para Winbox, SSH e Telnet |

### Edição no canvas

1. Entre no **modo edição** do dashboard (ícone lápis)
2. Destrave o mapa (**Mapa editável**)
3. **Botão direito** — adicionar host, rede, submapa, link
4. Barra superior (só no modo edição): Desfazer, Refazer, travas de mapa/redes
5. Sempre visíveis: Pausar tráfego, Tela cheia

## Formato JSON do mapa

```json
{
  "width": 1200,
  "height": 800,
  "locked": true,
  "networksLocked": true,
  "nodes": [
    {
      "id": "swv01",
      "label": "SWV01-SWITCH",
      "subtitle": "10.255.1.145",
      "zabbixHost": "SWV01-SWITCH-S6730H",
      "type": "host",
      "x": 400,
      "y": 300
    },
    {
      "id": "net-core",
      "label": "CORE",
      "type": "network",
      "x": 25,
      "y": 25,
      "width": 350,
      "height": 250
    },
    {
      "id": "sub-plw",
      "label": "PORTALEGRE",
      "type": "submap",
      "submapUid": "topo-plw",
      "x": 700,
      "y": 200
    }
  ],
  "links": [
    { "from": "swv01", "to": "sub-plw", "medium": "fiber" },
    { "from": "swv01", "to": "liteap-01", "medium": "radio" }
  ]
}
```

### Tipos de nó

| `type` | Descrição |
|--------|-----------|
| `host` | Equipamento (Zabbix ou manual) |
| `network` | Retângulo de agrupamento |
| `submap` | Link para outro dashboard |
| `static` | Texto fixo |

### Tipos de link

| `medium` | Visual |
|----------|--------|
| `fiber` | Linha reta contínua (padrão) |
| `radio` | Linha tracejada |

## Desenvolvimento

```bash
npm run dev        # build em watch
npm run typecheck  # TypeScript
npm run build      # produção → dist/
```

## Estrutura do repositório

```
src/
  components/     # TopologyCanvas, TopologyPanel, modais
  editor/         # Editor JSON / nós / links
  utils/          # Zabbix, mapEdits, hostTools
  types.ts        # Tipos do mapa e opções
  module.ts       # Registro do plugin Grafana
extras/
  winbox-protocol/  # Registrar winbox:// no Windows
.config/            # Webpack
```

> Mapas de exemplo, dashboards Grafana e scripts de deploy interno **não** fazem parte deste repositório — ficam no ambiente Luminous.

## Licença

Apache-2.0
