# Protocolos `winbox://` e `winboxnovo://` (Windows)

| Menu no mapa | Protocolo | Executável |
|--------------|-----------|------------|
| **Winbox** | `winbox://open?h=IP&c=…` | `winbox64.exe` |
| **Winbox Novo** | `winboxnovo://open?h=IP&c=…` | `WinBoxNovo.exe` |

O launcher chama o exe com IP, usuário e senha:

```text
WinBoxNovo.exe "IP" "usuario" "senha"
```

O IP vai em `?h=` (não como host da URI), porque o Chrome transforma `winbox://IP?…` em `winbox://IP/?…` e a `/` aparecia no Connect To.

## Instalar de novo (obrigatório após atualizar)

```powershell
cd extras\winbox-protocol
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Coloque `winbox64.exe` e `WinBoxNovo.exe` nesta pasta.

## Conferir

Após clicar Winbox no mapa, abra `last-launch.txt` — `host=` deve ser só o IP, sem `/`, e `hasPassword=True` se cadastrou senha.
