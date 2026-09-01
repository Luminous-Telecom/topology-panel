# Changelog

Todas as mudanças relevantes do Topology Panel ficam neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). A versão em
`package.json` e `src/plugin.json` sobe **no mesmo commit** que a entrada abaixo.

## [Unreleased]

## [1.4.403] - 2026-08-31

### Alterado

- `npm run dev` observa o JS (webpack development) e o backend Go (só a plataforma local) e grava na pasta do plugin no Grafana; não precisa de `npm run build` a cada save.
- Toda consulta Zabbix passa pelo backend Go (`/poll`, `/groups`, `/item-names`, `/interfaces`, `/ping`); o painel só desenha o JSON devolvido.

### Removido

- Cache de lastvalue no navegador, gate de poll no front e verificação de ticket da loja no browser (fica no processo Go).
- Scripts `watch:plugin`, `sign` e `deploy` do `package.json`.
- Rotas GET `/snapshot` e POST `/snapshot/lookup` — a leitura é `POST /snapshot` só com a chave.

### Corrigido

- O backend Go reencaminha a sessão do Grafana (`Cookie`, `X-Grafana-Id`) ao proxy do datasource Zabbix; sem isso o poll voltava 401 e o mapa mostrava “Falha na fonte de dados”.
- Abrir o mapa com snapshot quente não consulta o Zabbix — hidrata por `POST /snapshot` e o `POST /poll` só entra no intervalo.
- Desenvolvimento local sem `license.json` não bloqueia o mapa; com instalação da loja a validação continua obrigatória.
- Status, tráfego e problemas saem do backend Go (`POST /poll`); o front só desenha o mapa com o snapshot retornado.
- O painel deixa de ficar 1–2 s em “Carregando painel do plug-in…”: o `TopologyPanel` carrega em chunk assíncrono e o `npm run dev` deixa de empurrar ~9 MB no entry.
- O mapa pinta no primeiro frame com o lastvalue do snapshot do backend; o Go reconcilia em seguida sem cinza nem espera de ~2 s.
- O snapshot do lastvalue grava em disco na pasta do plugin (7 dias) — após reiniciar o Grafana o F5 já pinta sem esperar o Zabbix.
- Abrir o mapa pai pinta o lastvalue da RAM do Grafana (POST `/snapshot` só com a chave). Query string, path extra, abort de 2 s e `item.get` na hora (savedAt velho) faziam o badge “Consultando status no Zabbix” aparecer antes da cor.
- Enquanto o snapshot hidrata, as caixas não pintam `colorUnknown` — o primeiro preenchimento já é o status.
- A chave com todos os grupos da árvore passava de 512 bytes e o GET 404; o teto vai a 8 KiB.
- Gravar o lastvalue na RAM do Grafana não exige mais `license.json`; o POST 403 impedia o cache no `npm run dev`.
- A consulta de status começa enquanto a licença ainda valida — não espera o ticket da loja para hidratar o mapa.

## [1.4.402] - 2026-08-31

### Alterado

- Recarregar o painel pinta o lastvalue do backend Go; o Zabbix só entra se o snapshot não estiver quente.

## [1.4.401] - 2026-08-31

### Alterado

- O mapa abre na hora; o aviso de licença só aparece se a loja recusar a chave.

## [1.4.400] - 2026-08-31

### Alterado

- Licença reconsulta a loja a cada 30 s. Tirar o IP em Minha conta bloqueia o mapa sem reiniciar o Grafana.

## [1.4.399] - 2026-08-31

### Adicionado

- Backend Go no plugin: valida a licença na loja (ticket ES256) e guarda o lastvalue em memória.
  Reabrir o mapa pinta na hora; o intervalo do Zabbix continua no painel.

### Alterado

- `pack:store` e `pack:private` apagam ZIPs e a pasta de staging antigos; em `packaging/out` fica só o pacote da vez.

## [1.4.398] - 2026-08-31

### Alterado

- Aviso de licença (IP não cadastrado, chave ausente, validando) fica centralizado no painel, no visual dos overlays.

### Adicionado

- Licença só vale com ticket ES256 da loja. A URL continua a da instalação (`license.json`).

## [1.4.397] - 2026-08-31

### Alterado

- Número da versão do plugin fica nas opções (Licença), não no mapa.
- A licença só valida se o IP deste Grafana for o mesmo cadastrado na licença (Minha conta), não o IP do servidor da loja.

### Corrigido

- Erro `Post "": unsupported protocol scheme ""` vira aviso para preencher a URL do datasource Zabbix.

## [1.4.396] - 2026-08-31

### Alterado

- Opções do painel mostram só o IP do Grafana; chave e URL da loja não aparecem.

## [1.4.395] - 2026-08-31

### Alterado

- Opções de Licença no Grafana mostram só chave, URL e IP, sem textos de ajuda.

### Corrigido

- Painel novo com `map: {}` do Grafana abre o mapa padrão em vez de "Mapa de topologia inválido".

## [1.4.394] - 2026-08-31

### Adicionado

- Número da versão do plugin na barra do mapa e aviso quando a loja tem uma versão mais nova.
- A instalação grava chave e URL da loja; o painel só mostra o IP cadastrado em Minha conta.

### Alterado

- Opções de Licença no Grafana são somente leitura (chave, URL e IP não se editam no painel).

## [1.4.393] - 2026-08-31

### Corrigido

- Abrir um painel novo não quebra mais o editor de Layout quando o Grafana ainda não gravou `options.map`.

## [1.4.392] - 2026-08-31

### Adicionado

- ZIP genérico da `dist/` (`pack:store`) anexado na GitHub Release para a Luminous Store.
- Validação de licença da loja no painel (chave, URL e IP nas opções); build de produção bloqueia o mapa sem chave válida.

### Alterado

- `pack:store` gera o zip com Python quando o comando `zip` não está instalado.

## [1.4.391] - 2026-08-30

### Alterado

- Rules do Cursor passam a exigir bullet no changelog em toda tarefa e bump de versão em todo commit.

## [1.4.390] - 2026-08-30

### Adicionado

- Push na `main` publica GitHub Release `vX.Y.Z` com as notas do changelog.

## [1.4.389] - 2026-08-30

### Adicionado

- Changelog versionado e bump de patch em todo commit (`package.json`, `src/plugin.json` e `CHANGELOG.md`).
- Checagem no GitHub Actions para a entrada do changelog coincidir com a versão do plugin.

## [1.4.388] - 2026-08-30

### Corrigido

- Evita remontar o canvas ao entrar e sair da edição do dashboard (tamanho 0×0 e `querySelector` no SVG).
- Restaura trava e destrava do mapa: a detecção de edição não para mais na Nav toolbar vazia.

## [1.4.387] - 2026-08-30

### Alterado

- Licença EULA proprietária e ZIP privado por `root_url` (host ou IP).

## [1.4.386] - 2026-08-30

### Corrigido

- Evita travar o tráfego ao travar ou destravar mapa e redes.
