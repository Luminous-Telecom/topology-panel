# Protocolos `winbox://` e `winboxnovo://` (Windows)

| Menu no mapa | Protocolo | Executável |
|--------------|-----------|------------|
| **Winbox** | `winbox://IP?c=…` | `winbox64.exe` |
| **Winbox Novo** | `winboxnovo://IP?c=…` | `WinBoxNovo.exe` |

O launcher chama o exe **como o The Dude**:

```text
WinBoxNovo.exe "IP" "usuario" "senha"
```

Credenciais vão em `?c=` (Base64), para o Windows **não corromper** a senha no protocolo.

## Instalar de novo (obrigatório após atualizar)

```powershell
cd extras\winbox-protocol
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Coloque `winbox64.exe` e `WinBoxNovo.exe` nesta pasta.

## Conferir se a senha chegou

Após clicar Winbox no mapa, abra `extras/winbox-protocol/last-launch.txt` — deve mostrar `host=`, `user=` e `hasPassword=True`.
