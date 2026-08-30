# Topology Panel — instruções do agente

- **Changelog em toda tarefa.** Mudou produto, correção ou fluxo → bullet em português em
  `CHANGELOG.md` na seção `## [Unreleased]` **antes de encerrar**, mesmo sem o usuário pedir
  commit. Seções: Adicionado, Alterado, Corrigido, Removido. Sem host, IP, key Zabbix nem senha.
- **Versão em todo commit.** `npm run version:bump` (`package.json` + `src/plugin.json`),
  promover `Unreleased` para `## [X.Y.Z] - AAAA-MM-DD`, mensagem termina com `(vX.Y.Z)`.
  Push na `main` publica a GitHub Release. Detalhes em `.cursor/rules/90-workflow.mdc`.
