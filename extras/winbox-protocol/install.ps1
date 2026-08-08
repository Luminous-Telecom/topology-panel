# Registra o protocolo winbox:// no Windows (usuario atual — sem admin).
# Uso:
#   cd extras\winbox-protocol
#   powershell -ExecutionPolicy Bypass -File .\install.ps1

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ps1 = Join-Path $here 'open-winbox.ps1'

if (-not (Test-Path $ps1)) {
  Write-Error "Arquivo nao encontrado: $ps1"
}

$ps1Esc = $ps1.Replace('"', '\"')
$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ps1Esc`" `"%1`""

$base = 'HKCU:\Software\Classes\winbox'
New-Item -Path $base -Force | Out-Null
Set-ItemProperty -Path $base -Name '(Default)' -Value 'URL:Winbox Protocol'
New-ItemProperty -Path $base -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$base\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$base\DefaultIcon" -Name '(Default)' -Value 'winbox.exe,0'
New-Item -Path "$base\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$base\shell\open\command" -Name '(Default)' -Value $command

Write-Host "Protocolo winbox:// registrado."
Write-Host "Comando: $command"
Write-Host ""
Write-Host "Teste no navegador:"
Write-Host "  winbox://192.168.88.1"
Write-Host "  winbox://admin:senha@192.168.88.1"
Write-Host ""
Write-Host "Copie winbox64.exe para esta pasta (recomendado):"
Write-Host "  $here"
