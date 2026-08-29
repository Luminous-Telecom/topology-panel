# Plano de refatoração — Topology Panel

Documento de trabalho para melhorar **carregamento**, **edição**, **visualização**, **segurança**, **arquitetura de componentes** e o **sistema visual**. Não é um pedido de reescrita: o painel já tem camadas, lazy-load, recorte de viewport e mutação centralizada. O plano descreve o que falta, o que preservar e a ordem segura de execução.

**Baseline:** `luminous-topology-panel` v1.4.378 · Grafana 10+ · TypeScript 5.5 · React 18 · webpack 5 + `swc-loader` · Vitest 2.

**Régua de bundle (fase A, 2026-08-28, antes do SCSS):** `dist/module.js` = **536 860 bytes** (~524 KiB). Chunks lazy (modais/editores) à parte.

**Após fases C–H:** `dist/module.js` = **607 047 bytes**. O CSS dos overlays (antes Emotion no mesmo chunk) ficou em CSS Modules + `style-loader`. Ping/ICMP saiu para o chunk lazy (`499.js`, ~18 KiB; `script.execute` não está no `module.js`). `webpack-bundle-analyzer` não foi adicionado (dependência nova só com pedido).

**Como usar este documento:** cada fase é um lote entregável, com critério de aceite. Nada entra em produção sem `npm run typecheck`, `npm run test` e `npm run build`. Deploy só quando pedido.

---

## 1. Objetivo

1. **Front mais previsível:** um componente por responsabilidade, reutilizado, sem cópia de JSX, estilo ou lógica.
2. **Primeira pintura mais rápida:** menos JavaScript no `module.js` até o mapa aparecer.
3. **Edição fluida:** arraste, pan, resize, marquee e undo sem o poll do Zabbix “roubar” o frame.
4. **Visualização estável:** poll de status/tráfego não redesenha o SVG inteiro; cabos e hosts fora da vista não existem no DOM.
5. **Segurança:** dado de query, label, IP e JSON do mapa nunca viram HTML cru nem URL sem validação.
6. **Estilos em SCSS**, com **macros (mixins)** para tamanho, espaço, overlay e tipografia. Fonte em `.scss` — não criar `.css` de mão.

O mapa precisa continuar **visualmente idêntico** ao aprovado (geometria de cabo, cores, ícones, grade). Refatorar estilo não é redesenhar o produto.

---

## 2. O que já está certo (não desfazer)

Estas peças são a base. Refatoração que as ignore regride o painel.

| Área | O que já existe | Onde |
|---|---|---|
| Composição do canvas | Camadas SVG + overlays + modais | `TopologyCanvas.tsx` junta; desenho em `components/canvas/` |
| Mutação do mapa | Só três módulos | `mapEdits.ts`, `mapLinkEdits.ts`, `mapBulkEdits.ts` |
| Status | Uma fonte (`QueryIndex`) | `buildZabbixDirectIndex` + `useZabbixDirectIndex` |
| Primeira pintura | Estrutura (`host.get`) sem esperar `ds.query()`; snapshot em cache | `useZabbixDirectIndex`, `zabbixSnapshotCache` |
| Gestos | Um commit por frame; dados congelados no arraste | `useGestureFrame`, `useFrozenCanvasData` |
| Identidade estável | Poll não invalida `React.memo` das formas | `structuralShare` / `useStableIdentity` / `useStableCallback` |
| Recorte | Viewport alinhada a tile (não a cada pixel de pan) | `viewportCulling.ts` |
| Lazy-load | Modais e editores de opções fora do caminho crítico | `lazyModals.tsx`, `lazyPanelEditors.tsx` |
| Tokens visuais (JS) | Overlay, toolbar compacta | `overlayChrome.ts`, `canvasOverlayStyles.ts`, `canvasOverlayLayout.ts` |
| Teste de custo | Conta re-render real das formas no poll e no arraste | `TopologyPanel.perf.test.tsx`, `TopologyCanvas.perf.test.tsx` |

**Não fazer “big bang”.** Cada extração precisa passar nos testes de perf atuais. Se um poll voltar a redesenhar todos os hosts, a fase falhou.

---

## 3. Diagnóstico — pontos reais de atrito

### 3.1 Arquitetura e tamanho

| Arquivo | Linhas | Problema |
|---|---|---|
| `TopologyCanvas.tsx` | ~1593 | Ainda é o orquestrador: dezenas de `useState`, handlers e toggles de overlay. As camadas já saíram; o **estado da sessão de edição** não. |
| `useTopologyDragController.ts` | ~1003 | Máquina de estado única (pan, nó, resize, marquee, waypoint). Intencional, mas difícil de evoluir. |
| `zabbixDatasourceQuery.ts` | ~1360 | Parse de frames Grafana-Zabbix + Metrics + Problems no mesmo módulo. |
| `zabbixApi.ts` | ~852 | JSON-RPC de poll **e** ping/ICMP no mesmo arquivo. O poll importa o módulo inteiro → código de ping entra no `module.js` mesmo com `PingModal` lazy. |
| `LinkLine.tsx` | ~660 | Casca, canais weathermap, setas de fluxo e chip de tráfego no mesmo componente. |
| `TopologyPanel.tsx` | ~550 | Wiring Grafana + persistência + navegação de submapa + índice. Dá para fatiar persistência de overlay. |
| `interSubmapLinks.ts` / `linkMetricsRuntime.ts` | ~469 / ~545 | Lógica densa, mas no lugar certo. Não mover na fase de UI. |

### 3.2 Estilos (o maior gap deste plano)

- **Zero arquivos `.scss` / `.css`.** Webpack não tem loader de estilo.
- Estilo vive em três formas misturadas:
  1. `css` do `@emotion/css` (~20 arquivos, dezenas de blocos).
  2. `style={{ ... }}` inline em ~35 componentes (tamanho, padding, fonte repetidos: 11px / 12px, `padding: 8px 12px`).
  3. Atributos SVG (`fill`, `stroke`, `transform`) — **esses precisam continuar no JSX**, porque cor e posição mudam a cada poll/gesto.
- Tokens já existem em TypeScript (`OVERLAY_RADIUS`, `CANVAS_EDGE_GAP`, `COMPACT_TOUCH_MIN`) e são interpolados no Emotion. Falta uma folha única que o SCSS e o JS compartilhem.

### 3.3 Carregamento

O `module.js` AMD (entry única) carrega **sempre** ao abrir o dashboard:

- Canvas + camadas SVG + toolbar + NOC + legend + busca + minimapa.
- `useZabbixDirectIndex` + `zabbixApi.ts` **inteiro** (incluindo ping).
- `zabbixDatasourceQuery.ts` (parse de frames).
- Todos os SVGs de ícone (`asset/source` em `customIcons.ts`) — 14 arquivos, aceitável.
- `react-icons` só por caminho profundo (já correto).

O que **não** entra no primeiro load (já lazy): propriedades do nó, ping, edição em lote, editores da aba de opções.

**Buracos:** `LinkDetailsDrawer`, `TopologyContextMenu`, `HostHoverPopover` e o chrome NOC/legend/busca ainda viajam no chunk principal. `zabbixApi` de ping também.

### 3.4 Edição e visualização

Já há freeze de dados no gesto e recorte por tile. O que ainda custa:

- `TopologyCanvas` re-executa todos os hooks a cada setState local (abrir busca, hover, marquee).
- `LinkLine` é um SVG pesado por cabo; `React.memo` custom existe, mas o arquivo é um bloco só.
- `useNodeLayouts` mede texto; poll com identidade estável já evita remedir — qualquer extração que quebre essa identidade regride.
- Prop drilling: `options` inteiro desce até cada forma. Um campo irrelevante nas opções invalida memo se o objeto `options` for novo.

### 3.5 Segurança (já forte; restam endurecimentos)

Já existe: JSX para texto, `openDashboardUrl` com allowlist de uid, `noopener,noreferrer`, `getBackendSrv()`, sem `console.*` em produção, `dangerouslySetInnerHTML` só com SVG de build-time, credenciais de Tools com aviso na UI.

Pontos a endurecer:

- Senha de Tools no JSON do dashboard (decisão de produto — não mudar sem pedido).
- Snapshot Zabbix no `localStorage` (payload já compacto; não renderizar como HTML).
- `inlineSvgMarkup` ainda concatena `size` em atributo — só seguro porque `size` é número nosso.
- Editores de JSON do mapa: `validateTopologyMap` já barra estrutura inválida; manter isso na frente de qualquer `JSON.parse`.

### 3.6 Duplicação de UI

Lógica pura está inventariada em `11-anti-duplication.mdc`. A duplicação restante é **visual**:

- Card de overlay reescrito em legend, alertas, NOC, busca, hover, toast, drawer.
- Hint `font-size: 12px; opacity: 0.75` em vários editores.
- Botão de lista (`overlayListButtonStyle`) vs. cópias locais.
- `Field` + `useId()` correto, mas falta um `HintText` / `FieldError` único.

---

## 4. Princípios da refatoração

1. **Preservar o visual do mapa.** Geometria de cabo, weathermap, setas, grade e ícones só mudam com pedido explícito.
2. **Menor diff por fase.** Sem rename/format em massa. Sem arquivo barrel (`index.ts`).
3. **Mutação só nos três módulos de mapa.** Componente não monta `TopologyMap` na mão.
4. **Uma fonte de estilo:** SCSS + mixins. Emotion do **nosso** código some ao fim da fase de estilos. `@grafana/ui` continua usando Emotion por baixo — isso não se toca.
5. **Uma fonte de tokens numéricos** compartilhada entre SCSS e layout JS (ver §6.3).
6. **Dado não confiável** (query, label, IP, JSON) nunca vai para HTML/SVG cru nem para URL sem allowlist.
7. **Medir antes de “otimizar”.** Os testes de perf são a régua. Otimização ilegível só com evidência.
8. **UI em português.** Extração não traduz nem reescreve copy.

---

## 5. Arquitetura-alvo

### 5.1 Camadas (inalteradas na ideia, mais rígidas na prática)

```
Grafana host
  └── TopologyPanel          opções, índice Zabbix, persistência, navegação
        └── TopologyCanvas   composição: hooks + camadas (sem JSX de forma)
              ├── canvas/layers     grid, redes, cabos, hosts, seleção
              ├── canvas/overlays   toolbar, HUD, NOC, busca, toast
              └── canvas/modals    lazy
utils/          lógica pura
hooks/          estado + efeitos
services/       QueryIndex, cache, snapshot
styles/         tokens + mixins SCSS (novo)
```

`TopologyCanvas` deve ficar perto de **composição**: chamar hooks, passar props, montar a árvore. Estado de sessão (ferramenta, busca, drawer, blueprint, hover, link pendente) sai para hooks nomeados.

### 5.2 Árvore de componentes (reuso, sem barrels)

Cada peça importa o arquivo de origem. Pastas novas só quando o arquivo já existe e a mudança é daquela fase.

```
src/
  styles/                          ← novo (fase B)
    _tokens.scss
    _mixins.scss
    plugin.scss                    ← custom properties no root do painel
  components/
    chrome/                        ← OverlayCard, HintText, FieldError, Toast
    forms/                         ← FieldReadout, NumberField, selects
    canvas/
      layers/                      ← Grid, NodeLayers, LinksLayer, Selection
      overlays/                    ← Toolbar, HUD, NOC, legend, search, alerts
      nodes/                       ← HostNodeShape, NetworkNodeShape
      links/                       ← LinkLine (casca / fluxo / chip)
    nodeEdit/                      ← já existe
    editors/                       ← editores hoje em components/ (mover na fase C)
```

Não mover tudo no primeiro commit. A pasta `styles/` entra na fase B; os moves de pasta entram na C, arquivo a arquivo, com o teste daquela peça verde.

### 5.3 Catálogo a extrair (uma vez, reusar sempre)

| Componente | Substitui | Usado em |
|---|---|---|
| `OverlayCard` | `overlayCardStyle` + header/body/footer copiados | legend, alertas, NOC, busca, hover, toast, minimapa |
| `OverlayListButton` | `overlayListButtonStyle` e clones | menu, NOC, busca, alertas |
| `HintText` | `fontSize: 12` + opacity | editores, modais, pickers |
| `FieldError` | `modalErrorStyle` | todo modal |
| `MetricRow` | `overlayMetricRowStyle` | hover, drawer, info do host |
| `ToolbarIconButton` | padding/min-height da toolbar | toolbar, navegação, compact |
| `TopologyModal` | já existe — **obrigatório** em modal novo | todos os `*Modal.tsx` |
| `FieldReadout` | já existe | bloco que não é um único input |

Regra: se um bloco JSX se repetir em 2+ arquivos, a extração entra **na mesma tarefa** que mexeu no segundo uso. Não deixar “depois”.

### 5.4 `TopologyCanvas` — fatiar estado, não o SVG

Hooks novos (nomes sugeridos; só criar quando o código sair de fato):

| Hook | Sai de `TopologyCanvas` |
|---|---|
| `useCanvasOverlayToggles` | override local de legenda e lista de alertas |
| `useCanvasSession` | `tool`, `searchOpen`, `detailsLink`, `blueprintOpen`, `pingTarget`, `pendingLink`, `linkFromId` |
| `useCanvasDerivedView` | `legendItems`, empty hint, `viewEditable`, locks |
| (já existem) | viewport, drag, selection, menus, layouts, culling, keyboard |

Meta: `TopologyCanvas.tsx` abaixo de ~400 linhas de composição. O drag controller **não** se parte nesta fase.

### 5.5 `useTopologyDragController` — fase tardia e testada

Hoje é uma máquina só, com `dragRef` compartilhado (um gesto por vez). Partir cedo demais gera bug de pointer.

Fase E, só depois dos testes de gesto cobrirem pan, drag de host, resize de rede, marquee e waypoint:

- helpers puros já em `dragState.ts` / `dragMove.ts` — continuar assim;
- o hook vira **coordenador** + módulos internos (`nodeDrag.ts`, `marqueeDrag.ts`, …) **sem** exportar API nova para o canvas;
- um gesto por vez permanece.

### 5.6 Dados — não duplicar o índice

Continua proibido:

- varrer `data.series` para status;
- segundo laço de poll;
- `item.get` de status por grupo;
- `array.find` dentro de `.map()` de nós/links.

`QueryIndex` permanece a única leitura de status. Extração de `zabbixApi` (ping vs poll) é **só** para o bundle, não para criar outra fonte de verdade.

---

## 6. Estilos: SCSS, tokens e macros

### 6.1 Decisão

| Escrever | Não escrever |
|---|---|
| `*.scss` e `*.module.scss` | `.css` de fonte |
| Mixins (`@mixin`) como macros | Estilo novo em Emotion no código nosso |
| CSS Modules com prefixo do plugin | Folha global que vaze no Grafana |
| Custom properties no root do painel | `style={{ fontSize: 11, padding: ... }}` para layout estático |

**Exceção permanente:** atributo SVG dinâmico (`fill`, `stroke`, `transform`, `d`, `stroke-width` de banda, `data-link-flow-*`). Isso é dado de runtime, não skin.

**Exceção Grafana:** componentes `@grafana/ui` (`Button`, `Input`, `Select`, `Modal`) trazem o tema do host. Não reestilizar o chrome do Grafana; só o chrome **nosso** (mapa, overlay, toolbar).

### 6.2 Webpack (devDependencies de build)

Hoje não há loader de CSS. Incluir **somente** no build (não vão como pacote runtime do Grafana):

- `sass` (Dart Sass)
- `sass-loader`
- `css-loader`
- `style-loader`

`style-loader` injeta `<style>` no documento. Grafana já faz o mesmo com Emotion (`unsafe-inline` no `style-src`). Não usar `MiniCssExtractPlugin`: o Grafana **não** carrega um `module.css` extra do painel.

Regra de segurança de dependência: estas libs **não** entram no AMD do painel como `node_modules`; o webpack empacota só o CSS compilado. Mesmo assim, a inclusão precisa de **aprovação** antes do `npm install` (regra do repositório).

Config sugerida:

```javascript
{
  test: /\.module\.scss$/,
  use: [
    'style-loader',
    {
      loader: 'css-loader',
      options: {
        modules: {
          localIdentName: 'luminous-topology__[local]__[hash:base64:6]',
        },
      },
    },
    'sass-loader',
  ],
},
{
  test: /\.scss$/,
  exclude: /\.module\.scss$/,
  use: ['style-loader', 'css-loader', 'sass-loader'],
},
```

Tipagem (`src/scss.d.ts`):

```typescript
declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
```

Vitest: habilitar CSS modules no Vite (Vitest já usa Vite). Sem isso os testes de componente quebram no `import styles from './x.module.scss'`.

### 6.3 Uma fonte de tokens (SCSS + JS)

Números usados em **layout JS** (`minimapBottomOffset`, gutter da scrollbar, `fitOverlayBesideAnchor`) não podem viver só no Sass: o TypeScript precisa deles em runtime.

**Fonte canônica:** `src/styles/tokens.ts` (ou manter `canvasOverlayLayout.ts` + `overlayChrome.ts` como origem numérica).

No mount do painel, o root recebe custom properties:

```tsx
<div
  className={pluginRoot}
  style={{
    ['--topology-gap' as string]: `${CANVAS_EDGE_GAP}px`,
    ['--topology-radius' as string]: `${OVERLAY_RADIUS}px`,
    ['--topology-scrollbar' as string]: `${MAP_NATIVE_SCROLLBAR_PX}px`,
    ['--topology-touch-min' as string]: `${COMPACT_TOUCH_MIN}px`,
  }}
>
```

O SCSS usa `var(--topology-gap)` nos mixins que precisam bater com o JS. Cores de overlay, tipografia e z-index que **não** entram em conta matemática podem ser só Sass.

Não gerar SCSS a partir de TS com script extra nesta fase — duas fontes geram drift. Custom properties no root são o contrato.

### 6.4 Arquivo de tokens (`src/styles/_tokens.scss`)

Macros de valor: mapas Sass, não números mágicos nos componentes.

```scss
$font-xs: 11px;
$font-sm: 12px;
$font-md: 14px;

$space-1: 4px;
$space-2: 8px;
$space-3: 12px;
$space-4: 16px;

$radius: var(--topology-radius, 8px);
$gap: var(--topology-gap, 8px);
$touch-min: var(--topology-touch-min, 36px);

$z-svg: 1;
$z-overlay: 5;
$z-modal: 20;
$z-toast: 30;

$color-map-bg: #111217;
$color-overlay-text: #f2f4f7;
$color-overlay-muted: rgba(255, 255, 255, 0.68);
$color-overlay-hover: rgba(79, 195, 247, 0.18);
$color-link-select: #4fc3f7;
$color-link-hover: #81d4fa;
$color-channel: #0d0f14;

$bp-compact: 640px;
$bp-medium: 900px;
```

Cores de **status do host** continuam nas opções do painel + `resolvePanelColor`. Não hardcodar online/offline/alerta no SCSS.

### 6.5 Macros (`src/styles/_mixins.scss`)

“Macro” neste projeto = **`@mixin` + `@include`**. Também `@function` para cálculo e `%placeholder` só se o CSS gerado não inflar.

```scss
@use 'tokens' as *;

@mixin overlay-card {
  border-radius: $radius;
  background: rgba(13, 17, 23, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  color: $color-overlay-text;
  overflow: hidden;
}

@mixin overlay-header {
  padding: $space-2 $space-3;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  font-size: $font-xs;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: $color-overlay-muted;
}

@mixin type-xs-muted {
  font-size: $font-xs;
  line-height: 1.35;
  color: $color-overlay-muted;
}

@mixin type-hint {
  font-size: $font-sm;
  line-height: 1.4;
  opacity: 0.8;
}

@mixin compact {
  @media (max-width: $bp-compact) {
    @content;
  }
}

@mixin touch-target {
  @include compact {
    min-height: $touch-min;
    min-width: $touch-min;
  }
}

@mixin overlay-list-button {
  display: flex;
  align-items: center;
  gap: $space-2;
  width: 100%;
  padding: 6px $space-3;
  border: 0;
  background: transparent;
  color: $color-overlay-text;
  font-size: $font-sm;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: $color-overlay-hover;
  }

  @include touch-target;
}

@mixin map-scrollbar {
  scrollbar-gutter: stable;

  &::-webkit-scrollbar {
    width: var(--topology-scrollbar);
    height: var(--topology-scrollbar);
  }
}
```

Todo componente de overlay **inclui** o mixin. Proibido copiar o bloco de `border-radius` / `box-shadow` de novo.

### 6.6 CSS Modules por componente

Um `.module.scss` ao lado do TSX, mesmo stem:

```
TopologyToolbar.tsx
TopologyToolbar.module.scss
```

```scss
@use '../../styles/mixins' as *;

.group {
  display: flex;
  align-items: center;
  gap: $space-1;
  pointer-events: auto;
}

.button {
  @include overlay-list-button; // ou mixin específico de toolbar
  @include touch-target;
}

.label {
  line-height: 1;

  @include compact {
    display: none;
  }
}
```

```tsx
import styles from './TopologyToolbar.module.scss';

<button type="button" className={styles.button}>
```

Classes geradas: `luminous-topology__button__a1b2c3` — não colidem com Grafana nem com outro plugin.

### 6.7 Ordem de migração dos estilos (visual freeze)

1. Infra: loaders, `scss.d.ts`, `plugin.scss` (custom properties), mixins vazios + um consumidor piloto (`TopologyToast` — superfície pequena).
2. Chrome de overlay: `overlayChrome.ts` → mixins; `TopologyModal`, cards, listas.
3. Toolbar, navegação, badges, busca, NOC, legend, alertas, hover, drawer.
4. Canvas wrap / scroll / fullscreen (`canvasStyles.ts`).
5. Editores da aba de opções (hints, lock bar) — sem lutar com `@grafana/ui`.
6. Remover `@emotion/css` **dos nossos arquivos**. O external no webpack permanece (Grafana UI ainda precisa).

**Comparação visual:** screenshot do mapa (toolbar, overlay, cabo selecionado, host offline) antes e depois de cada lote. Qualquer pixel de cabo/ícone/grade diferente = reverter o lote.

### 6.8 O que não vai para SCSS

- `fill` / `stroke` de host e cabo (status, degradação, tema Grafana `light-green` resolvido em JS).
- `transform` do `<g>` de pan/zoom.
- `width`/`height` do `scrollSizer` (bounds do mapa).
- Animação de fluxo: hoje é `offset-path` + `data-link-flow-speed` via `linkFlow.ts`. Pode ganhar um mixin para o **fallback** de dash, mas a velocidade continua atributo.

---

## 7. Carregamento rápido

### 7.1 Estado atual do caminho crítico

```
module.js
  ├── TopologyPanel + TopologyCanvas + camadas SVG
  ├── overlays (toolbar, NOC, legend, search, alerts, minimap, menu)
  ├── useZabbixDirectIndex + zabbixApi (poll + ping)
  ├── zabbixDatasourceQuery
  └── ícones SVG inline
```

Lazy já: modais de edição, ping UI, editores de opções.

### 7.2 Ações

1. **Fatiar `zabbixApi.ts`**
   - `zabbixApi/client.ts` — `zabbixCall`, abort, timeout (usado pelo poll).
   - `zabbixApi/poll.ts` — metadata, lastvalue, signal inventory.
   - `zabbixApi/ping.ts` — `executeHostPingScript`, `fetchHostIcmpStatus`.
   - `PingModal` (já lazy) importa só `ping.ts`. Webpack corta ping do `module.js`.
   - Tipos (`ZabbixInterfaceItem`, …) em `zabbixApi/types.ts` para o índice não puxar ping.

2. **Lazy do chrome que só abre com clique**
   - `LinkDetailsDrawer`, `TopologyBlueprintModal` (este já é lazy).
   - Menu de contexto: manter no principal (clique direito precisa ser instantâneo) **ou** prefetch no `pointerdown`.
   - `HostHoverPopover`: avaliar se o chunk extra no hover vale; se o ficheiro for pequeno, deixar.

3. **Não lazy-load do SVG do mapa.** Recorte já evita montar nós fora da vista; code-split das formas quebraria o primeiro frame.

4. **Prefetch já existente:** `prefetchZabbixDatasource` em paralelo com a primeira pintura. Não adicionar outro prefetch de API.

5. **Snapshot cache:** manter TTL e payload compacto. Primeiro F5 deve pintar status sem esperar a rede. Não inflar o snapshot.

6. **Medir o bundle**
   - `webpack-bundle-analyzer` (devDependency, sob demanda: `npm run build -- --analyze` ou script `analyze`).
   - Meta: `module.js` sem ping, sem editores, sem `HostIconPicker`.
   - Não adicionar o analyzer no build de deploy contínuo.

7. **Ícones `react-icons`:** continuar import profundo. Auditoria: nenhum `from 'react-icons'`.

8. **Grafana externals:** não embutir `react` / `@grafana/*` / `@emotion/css`. SCSS compilado é o único CSS nosso no bundle.

### 7.3 Primeira pintura (dados)

Já está no desenho certo: caixas cinza → snapshot se houver → cor + tráfego no snapshot completo. A refatoração **não** pode:

- esperar `ds.query()` para mostrar nós;
- remontar o poll ao editar interface de cabo;
- varrer sinal com `meta.hosts` (só extremos dos cabos).

---

## 8. Performance nas edições

### 8.1 Regras que qualquer extração tem de respeitar

- Pointermove / wheel / pan / resize: `ref` + `requestAnimationFrame`, nunca `setState` por evento.
- `useGestureFrame`: um por canvas.
- `flush` / `cancel` no `pointerup` / `pointercancel`; `cancelAnimationFrame` no cleanup.
- `useFrozenCanvasData` durante o gesto — refresh não troca cor/posição no meio do drag.
- Sem `JSON.parse(JSON.stringify(map))`. Mutação imutável nos módulos de mapa; `structuredClone` só no histórico (`useMapHistory`).

### 8.2 Ações

1. **Extrair sessão de edição** (§5.4) para o `TopologyCanvas` não recriar callbacks soltos. Handlers para camadas: `useStableCallback` (já o padrão).
2. **`options` estável para as formas.** Passar `Pick` (fonte, cores já resolvidas, flags de edição), não o objeto inteiro de opções do painel, se um campo irrelevante estiver a invalidar memo. Medir com o teste de perf antes de fatiar tipos.
3. **Preview de drag** já flui para `useNodeLayouts`. Não voltar a clonar o mapa no pointermove.
4. **Undo/redo:** `useMapHistory` já clona no commit, não no frame. Não copiar o mapa no render.
5. **Editores laterais (Grafana):** já são lazy. Evitar `onOptionsChange` a cada tecla no JSON grande — debounce só se houver evidência de jank (hoje o editor de JSON é seção à parte).
6. **Marquee / guias:** estado local; não persistir até o `pointerup`. Manter.

### 8.3 Critério

`TopologyCanvas.perf.test.tsx` (300 hosts): durante o arraste, `HostNodeShape` / `LinkLine` **não** disparam re-render em massa. Número atual do teste é a linha de base; a fase não pode piorar.

---

## 9. Performance nas visualizações (NOC / poll / cabos)

### 9.1 Re-render no poll

Já coberto: identidade estrutural + `React.memo` nas formas + teste em `TopologyPanel.perf.test.tsx`. Extrações novas **têm** de manter props estáveis (`NO_BADGES`, `useStableIdentity` nas listas recortadas).

Ações:

1. **`LinkLine` em três peças memoizadas** (mesmo arquivo ou `canvas/links/`):
   - casca + canaleta (status / seleção);
   - setas de fluxo (atributos `data-link-flow-*`);
   - chip de tráfego.
   - O comparador custom de `LinkLine` hoje é a referência — cada peça precisa de comparador igualmente estrito.
2. **Não recalcular geometria de cabo** se waypoints, layouts dos extremos e bundle offset não mudaram. `computeLinkGeometry` já é puro; `useMemo` por link na layer, chaveado por identidade.
3. **Culling:** manter tile 512 + margem. Não recortar “a cada pixel” (isso re-monta o DOM no pan).
4. **Minimapa:** já usa as mesmas cores via `useMinimapColors`. Não desenhar o SVG grande de novo no minimapa.
5. **Fluxo dos cabos:** laço em `linkFlow.ts` (DOM direto, pausa com `document.hidden`). Não passar velocidade para React state por frame.
6. **contain / content-visibility** nos overlays (NOC, listas) — não no SVG do mapa (quebra hit-testing).
7. **Proibido Canvas 2D nesta etapa.** Trocar SVG por canvas é outro produto (seleção, acessibilidade, setas). Só reavaliar com mapa realmente lento **depois** das fases A–D e com medição.

### 9.2 Listas NOC / alertas / busca

Listas longas: virtualizar só se o perfil mostrar custo (dezenas de hosts na lista, não no mapa). Preferir filtro já existente. Não puxar `react-window` sem aprovação e sem evidência.

---

## 10. Segurança do código

### 10.1 Manter (não relaxar)

- Texto de host/label/IP como filho JSX (`<text>{label}</text>`).
- `HostIconImage`: só SVG importado em build-time.
- URL de dashboard: allowlist `[A-Za-z0-9_-]+` + `encodeURIComponent` no slug.
- `window.open(..., 'noopener,noreferrer')`.
- Sem `fetch`/`XHR` solto — só `getBackendSrv()`.
- Sem log de payload Zabbix, mapa ou credencial.
- Erro de UI: ação que falhou, sem stack, sem URL interna, sem body.
- `try/catch/finally` em async; `loading` nunca preso em `true`.

### 10.2 Ações desta refatoração

1. **Auditoria pontual** (checklist na fase F, sem inventário de ambiente):
   - nenhum `innerHTML` / `dangerouslySetInnerHTML` novo;
   - nenhum `window.location` além de `openDashboardUrl`;
   - `inlineSvgMarkup` só interpola números já validados.
2. **Fatiar ping** (§7.2) reduz superfície no chunk inicial (menos JSON-RPC de `script.execute` disponível antes do clique).
3. **CSS:** modules com hash — um plugin vizinho não estiliza o nosso mapa; nós não estilizamos o Grafana.
4. **SCSS:** nunca interpolar label/IP na folha. Classe estática + texto no React.
5. **localStorage do snapshot:** chave com `encodeURIComponent`; não ler o cache para o DOM como HTML.
6. **JSON do mapa / childMaps:** `validateTopologyMap` antes do canvas; mapa inválido = erro explícito (já existe). Extrações não introduzem fallback silencioso.
7. **Tools:** não criar clipboard/export/log da senha. `type="password"` permanece.
8. **Dependências novas:** só as de SCSS no build; `npm audit` antes de commitar o lockfile.

### 10.3 O que este plano não muda

Criptografar senha de Tools, tirar credencial do JSON, ou proxy de Winbox. São produto, não refatoração.

### 10.4 Checklist da fase F (2026-08-28)

- `dangerouslySetInnerHTML`: só `HostIconImage` com SVG importado em build-time (`inlineSvgMarkup` interpola `size` numérico).
- Navegação: `openDashboardUrl` com allowlist `[A-Za-z0-9_-]+`; `window.open` com `noopener,noreferrer`.
- `window.location.href` só em `openDashboardUrl` (uid validado).
- `script.execute` / script Ping: chunk lazy do `PingModal`, ausente do `module.js`.
- Sem `console.*` em produção em `src/` (só testes de perf).
- Sem `.css` de fonte; `npm audit --omit=dev` = 0 vulnerabilidades.
- Snapshot: continua a não ser renderizado como HTML; `validateTopologyMap` na frente do canvas.

---

## 11. Front — qualidade de componente

Além do catálogo (§5.3):

- Modal novo: só `TopologyModal` + `Field`/`Input` + `ButtonRow` (Cancelar + primária).
- `useId()` em todo controle; em `.map()`, índice no sufixo.
- Conteúdo que não é um input: `FieldReadout`.
- `Stack` com `gap` numérico; sem `VerticalGroup`/`HorizontalGroup`.
- Sem `any`, `@ts-ignore`, `console.*` novo, fallback mágico (`??` mascarando dado ausente).
- Função > ~80 linhas: passos nomeados. Máx. 3 níveis de `if`.
- Teste ao lado do fonte; fixture `host-a` / `10.0.0.1` / `vendor.metric.rx[10]`.

Atualizar `11-anti-duplication.mdc` **depois** de cada extração real (o rule tem de apontar para símbolo que existe).

---

## 12. Fases de execução

Ordem pensada para risco crescente. Não pular a B para “já separar componente com estilo inline novo”.

| Fase | Nome | Entrega | Risco | Depende de | Estado |
|---|---|---|---|---|---|
| **A** | Baseline e régua | Documentar tamanho atual do `module.js`; garantir perf tests verdes; lista de `css`/inline | Baixo | — | Feita (`module.js` 536 860 B) |
| **B** | Infra SCSS + tokens + mixins | Loaders, tokens, `plugin.scss`, um piloto (`TopologyToast`) | Médio (webpack/CSP) | Aprovação das deps | Feita |
| **C** | Chrome em SCSS + componentes chrome | Overlay em mixins/CSS Modules; Emotion some dos overlays | Médio (pixel) | B | Feita |
| **D** | Canvas orquestrador magro | Hooks de sessão/toggles; `TopologyCanvas` só compõe | Médio | — (pode paralelo a C) | Feita |
| **E** | Bundle e API | Fatiar `zabbixApi`; lazy drawer; analyzer | Médio | D ajuda, não bloqueia | Feita (analyzer omitido — deps novas só com pedido) |
| **F** | Segurança e higiene | Checklist XSS/URL; remover inline restante; audit | Baixo | C, E | Feita |
| **G** | LinkLine + drag interno | Peças do cabo; opcional split interno do drag | Alto | C, D, testes de gesto | Feita (cabo partido; drag **não** partido — um gesto por vez, risco de pointer) |
| **H** | Pastas finais | Mover `editors/`, `chrome/`, `links/` sem mudar comportamento | Baixo se git mv | C–G estáveis | Feita |

Cada fase: typecheck + test + build. Fase C/G: comparar visual do mapa (toolbar, cabo, host). Deploy só se pedido.

Estimativa relativa (não horas): A pequena; B média; C a mais longa (muitos arquivos de estilo); D média; E média; F pequena; G grande e opcional se C–F já entregarem o ganho; H cosmética.

---

## 13. Critérios de aceite globais

Uma fase só fecha se:

1. `npm run typecheck` — zero erros.
2. `npm run test` — verde, incluindo `TopologyPanel.perf.test.tsx` e `TopologyCanvas.perf.test.tsx`.
3. `npm run build` — plugin AMD gera; chunks lazy ainda existem.
4. Nenhum `any`, `@ts-ignore`, `console.*` de produção, barrel novo.
5. Nenhum `.css` de fonte; estilo novo em `.scss` / `.module.scss` ou atributo SVG dinâmico.
6. Mixins usados de verdade: overlay/hint/toolbar não reimplementados no arquivo.
7. Mapa: cabos retos, weathermap, setas, grade, ícones — iguais.
8. Sem segredo, host real, key Zabbix ou IP de ambiente no diff.
9. UI em português, `useId` nos forms tocados.

---

## 14. O que não fazer

- Reescrever o painel em Canvas 2D / WebGL nesta refatoração.
- Introduzir CSS-in-JS novo (styled-components, another emotion wrapper).
- Arquivos `.css` “para ser mais simples”.
- `import *` de `react-icons` ou de runtime.
- Barrel `index.ts`.
- `dangerouslySetInnerHTML` com string do mapa.
- Deep clone no render.
- Segundo poll Zabbix.
- Mudar geometria de cabo, cor default ou ícone “aproveitando a refatoração”.
- Adicionar lint script, Prettier em massa, ou dependência de UI (`@grafana/ui` já cobre Form).
- Virtualizar o SVG do mapa (o culling por tile já é o modelo certo).

---

## 15. Dependências novas (aprovação)

| Pacote | Tipo | Por quê |
|---|---|---|
| `sass` | dev | Compilador Dart Sass |
| `sass-loader` | dev | Webpack |
| `css-loader` | dev | CSS Modules |
| `style-loader` | dev | Injetar no Grafana |
| `webpack-bundle-analyzer` | dev, opcional | Só script `analyze`, não no deploy |

Nada disso vira `peerDependency`. Não adicionar `clsx` / `classnames` se a concatenação for no máximo 2 classes — template string basta.

Antes do install: `npm audit` no lockfile novo.

---

## 16. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| CSP do Grafana bloquear `<style>` do `style-loader` | Piloto na fase B em homolog; Emotion já injeta estilo — o perfil é o mesmo |
| Hash de CSS Module quebrar teste que busca classe | Testar por `role` / `aria-label` / texto, não por nome de classe |
| Extração quebrar `React.memo` no poll | Perf tests obrigatórios; `useStableCallback` / identidades compartilhadas |
| Drift token JS vs SCSS | Custom properties no root; um módulo TS de números |
| Split do drag gerar pointer “preso” | Fase G; testes de pointer; rollback fácil (um PR) |
| Sass `@import` deprecated | Só `@use` / `@forward` |
| Volume da fase C | Um overlay por PR (toast → legend → NOC…) |

---

## 17. Mapa rápido “hoje → depois”

| Tema | Hoje | Depois |
|---|---|---|
| Estilo | Emotion + inline | SCSS modules + mixins + CSS variables |
| `TopologyCanvas` | 1593 linhas de orquestração | Composição ~400 linhas + hooks de sessão |
| `zabbixApi` | Um arquivo no chunk principal | Poll no principal; ping no chunk do modal |
| Overlay | Classes Emotion repetidas | `OverlayCard` + mixins |
| Cabo | `LinkLine.tsx` monolito | Casca / fluxo / chip memoizados |
| Segurança | Já alinhada às rules | Checklist + menos API no first load |
| Duplicação | Inventário de **utils** | Idem + catálogo de **componentes chrome** |

---

## 18. Próximo passo recomendado

Fases **A–H** feitas. Emotion saiu do código nosso; ping fora do `module.js`; cabo em `canvas/links/`. Deploy só se pedido.
