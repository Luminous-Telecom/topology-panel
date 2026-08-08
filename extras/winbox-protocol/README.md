# Protocolos `winbox://` e `winboxnovo://` (Windows)

| Menu no mapa | Protocolo | Executável |
|--------------|-----------|------------|
| **Winbox** | `winbox://IP` | `winbox64.exe` |
| **Winbox Novo** | `winboxnovo://IP` | `WinBoxNovo.exe` |

O launcher usa um `.vbs` para **não abrir a janela do PowerShell**.

## Baixar

https://github.com/Luminous-Telecom/topology-panel/tree/main/extras/winbox-protocol

## Instalar (uma vez por PC)

1. Copie para esta pasta:
   - `winbox64.exe`
   - `WinBoxNovo.exe`
2. PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

3. No Chrome, permita abrir o app na primeira vez.

## Teste

```text
winbox://192.168.88.1
winboxnovo://admin:senha@192.168.88.1
```

## Remover

```powershell
Remove-Item -Recurse -Force HKCU:\Software\Classes\winbox
Remove-Item -Recurse -Force HKCU:\Software\Classes\winboxnovo
```
