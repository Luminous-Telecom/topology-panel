# Topology Panel — instruções do agente

- **Offline sobrepõe tudo.** Lastvalue 0 vence problema Zabbix, alerta e cor de tipo — cor, lista,
  badges, região e piscar. Use `statusFromHostDisplay`; sem lastvalue não pinte alerta.
- **Changelog em toda tarefa.** Mudou produto, correção ou fluxo → bullet em português em
  `CHANGELOG.md` na seção `## [Unreleased]` **antes de encerrar**, mesmo sem o usuário pedir
  commit. Seções: Adicionado, Alterado, Corrigido, Removido. Sem host, IP, key Zabbix nem senha.
- **Versão em todo commit.** `npm run version:bump` (`package.json` + `src/plugin.json`),
  promover `Unreleased` para `## [X.Y.Z] - AAAA-MM-DD`, mensagem termina com `(vX.Y.Z)`.
  Push na `main` publica a GitHub Release. Detalhes em `.cursor/rules/90-workflow.mdc`.
