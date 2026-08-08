# Topology Panel

Plugin de painel para **Grafana 9+** que exibe mapas de rede no estilo **The Dude**, com status ao vivo via **Zabbix**.

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
- **Menu de contexto** — ferramentas SSH (ping, traceroute, etc.) nos hosts
- **Submapas** — clique abre outro dashboard Grafana

## Requisitos

- Node.js **18+**
- Grafana **9+** (testado em Grafana 11/13)
- Datasource Zabbix (opcional, para cores de status)

## Instalação

```bash
git clone https://github.com/Luminous-Telecom/topology-panel.git
cd topology-panel
npm install
npm run build
```

Copie o build para o servidor Grafana:

```bash
sudo mkdir -p /var/lib/grafana/plugins/luminous-dude-topology-panel
sudo cp -r dist/* /var/lib/grafana/plugins/luminous-dude-topology-panel/
sudo chown -R grafana:grafana /var/lib/grafana/plugins/luminous-dude-topology-panel
```

Em `grafana.ini`:

```ini
[plugins]
allow_loading_unsigned_plugins = luminous-dude-topology-panel
```

Reinicie o Grafana:

```bash
sudo systemctl restart grafana-server
```

## Uso no Grafana

1. Crie um dashboard → adicione painel **Topology Panel**
2. **Query** (opcional): datasource Zabbix, item *Perda de Pacotes*, grupo dos hosts do mapa
3. **Transformations** (recomendado):
   - `Reduce` → *Series to rows*, reducer *Last*
   - Renomeie o campo numérico para `loss`
4. **Opções → Topologia**:
   - Cole ou edite o JSON do mapa (`width`, `height`, `nodes`, `links`)
   - Configure datasource Zabbix, grupo, etc.

### Opções do painel

| Opção | Descrição |
|-------|-----------|
| Mostrar grade | Exibe linhas de alinhamento |
| Tamanho da grade | Passo em pixels (padrão: 10) |
| Alinhar à grade | Snap ao mover hosts e caixas |
| Permitir arrastar mapa | Pan com clique na área vazia |

### Edição no canvas

1. Destrave o mapa (cadeado nas opções ou barra do painel)
2. **Botão direito** — adicionar host, rede, submapa, link
3. Barra superior:
   - **Mapa editável** — hosts e links
   - **Redes livres** — permite arrastar caixas de rede (padrão: travadas)

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
      "submapUid": "dude-plw",
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
  editor/           # Editor JSON / nós / links
  utils/            # Zabbix, mapEdits, hostTools
  types.ts          # Tipos do mapa e opções
  module.ts         # Registro do plugin Grafana
.config/            # Webpack
```

> Mapas de exemplo, dashboards Grafana e scripts de deploy interno **não** fazem parte deste repositório — ficam no ambiente Luminous.

## Licença

Apache-2.0
