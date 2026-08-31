# Changelog

Todas as mudanças relevantes do Topology Panel ficam neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). A versão em
`package.json` e `src/plugin.json` sobe **no mesmo commit** que a entrada abaixo.

## [Unreleased]

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
