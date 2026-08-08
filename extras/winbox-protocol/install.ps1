# Registra winbox:// e winboxnovo:// no Windows (usuario atual — sem admin).
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

function Register-Protocol([string]$Scheme, [string]$Title) {
  $base = "HKCU:\Software\Classes\$Scheme"
  New-Item -Path $base -Force | Out-Null
  Set-ItemProperty -Path $base -Name '(Default)' -Value $Title
  New-ItemProperty -Path $base -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
  New-Item -Path "$base\DefaultIcon" -Force | Out-Null
  Set-ItemProperty -Path "$base\DefaultIcon" -Name '(Default)' -Value 'winbox.exe,0'
  New-Item -Path "$base\shell\open\command" -Force | Out-Null
  Set-ItemProperty -Path "$base\shell\open\command" -Name '(Default)' -Value $command
  Write-Host "Registrado: ${Scheme}://"
}

Register-Protocol -Scheme 'winbox' -Title 'URL:Winbox Protocol'
Register-Protocol -Scheme 'winboxnovo' -Title 'URL:Winbox Novo Protocol'

Write-Host ""
Write-Host "Comando: $command"
Write-Host ""
Write-Host "Coloque na pasta $here :"
Write-Host "  - winbox64.exe          → Tools → Winbox"
Write-Host "  - Winbox Novo.exe       → Tools → Winbox Novo"
Write-Host ""
Write-Host "Teste:"
Write-Host "  winbox://192.168.88.1"
Write-Host "  winboxnovo://192.168.88.1"
Write-Host "  winboxnovo://admin:senha@192.168.88.1"
