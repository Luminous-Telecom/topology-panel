# Changelog

Todas as mudanças relevantes do Topology Panel ficam neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). A versão em
`package.json` e `src/plugin.json` sobe **no mesmo commit** que a entrada abaixo.

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
