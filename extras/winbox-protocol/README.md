# Protocolo `winbox://` (Windows)

O MikroTik **não registra** `winbox://` sozinho. O painel abre links como:

- `winbox://192.168.88.1`
- `winbox://admin@192.168.88.1`
- `winbox://admin:senha@192.168.88.1`

## Baixar

No repositório:

https://github.com/Luminous-Telecom/topology-panel/tree/main/extras/winbox-protocol

Ou clone/baixe o ZIP do projeto e abra a pasta `extras/winbox-protocol`.

## Instalar (uma vez por PC)

1. Copie `winbox64.exe` (ou WinBox.exe) **para esta pasta**, ou use a instalação padrão MikroTik.
2. PowerShell **nesta pasta**:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

3. No Chrome/Edge, ao abrir o primeiro link, permita o aplicativo.

## Teste

```text
winbox://192.168.88.1
winbox://admin:senha@192.168.88.1
```

## Remover

```powershell
Remove-Item -Recurse -Force HKCU:\Software\Classes\winbox
```
