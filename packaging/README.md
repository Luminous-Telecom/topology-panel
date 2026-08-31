# ZIP para distribuição

Há dois pacotes. A loja usa **só** o ZIP genérico (`pack:store`). O ZIP privado
fica para entrega manual, fora da Luminous Store.

## ZIP da loja (`pack:store`)

Um arquivo por versão, sem `MANIFEST.txt` de `root_url`. O Grafana do cliente
precisa de `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=luminous-topology-panel`.
Reinicie o Grafana depois de instalar — o backend Go sobe junto com o servidor.
A chave de licença entra nas opções do painel; o plugin chama a loja.

```bash
npm run pack:store
```

O arquivo sai em `packaging/out/luminous-topology-panel-<versão>.zip` (a pasta
`out/` é limpa a cada pack — só fica esse ZIP). O GitHub Actions anexa esse
ZIP na Release ao fazer push na `main`.

`SKIP_BUILD=1` reusa um `dist/` já compilado. **Não** rode `npm run build`
depois de assinar um ZIP privado no mesmo `dist/` — o webpack limpa a pasta.

## ZIP privado por `root_url` (`pack:private`)

Cada cliente recebe um ZIP **assinado só para o `root_url` do Grafana dele**. Noutra instância o Grafana recusa o plugin (assinatura private). Isso não substitui a EULA: a revenda continua proibida por contrato. **Não anexe este ZIP na GitHub Release nem na loja.**

Revise `EULA.md` com advogado antes de vender.

## Gerar o ZIP

1. Token Grafana Cloud com scope `plugins:write` (a org do Cloud deve ser o prefixo do plugin id, hoje `luminous`).
2. Peça ao cliente o `root_url` **igual** ao `grafana.ini` (`[server] root_url`) e à URL do navegador (esquema, host **ou IP**, porta, caminho). IP vale: `http://10.0.0.1:3000`. Sem `http://`, o script assume `http://` em IPv4 (`10.0.0.1:3000`). Se o cliente entra por nome **e** por IP, coloque os dois no mesmo ZIP.
3. Na raiz do repositório:

```bash
export GRAFANA_ACCESS_POLICY_TOKEN='…'
npm run pack:private -- https://grafana.cliente.example
npm run pack:private -- http://10.0.0.1:3000
npm run pack:private -- 10.0.0.1:3000
```

Vários endereços no mesmo ZIP (vírgula):

```bash
npm run pack:private -- https://grafana.cliente.example,http://10.0.0.1:3000
```

O arquivo sai em `packaging/out/luminous-topology-panel-<versão>-<host>.zip`
(pasta ignorada pelo git; `out/` é limpa a cada pack).

`SKIP_BUILD=1` reusa um `dist/` já compilado. **Não** rode `npm run build` depois de assinar: o webpack limpa o `dist/` e apaga o `MANIFEST.txt`.

## Entrega

- Envie o ZIP e o `EULA.md`.
- Oriente: extrair para `/var/lib/grafana/plugins/luminous-topology-panel/` (ou o caminho de plugins do Grafana), `chown` do usuário do Grafana, **sem** `allow_loading_unsigned_plugins` se o MANIFEST for válido.
- Instância nova ou `root_url` diferente = **novo ZIP**, não reencaminhar o arquivo de outro cliente.
