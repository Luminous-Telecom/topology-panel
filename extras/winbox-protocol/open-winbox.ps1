# Abre o Winbox a partir de URI winbox://
# Exemplos:
#   winbox://192.168.88.1
#   winbox://admin@192.168.88.1
#   winbox://admin:senha@192.168.88.1
#   winbox://admin:senha@192.168.88.1:8291

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Uri
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Find-Winbox {
  $candidates = @(
    (Join-Path $here 'winbox64.exe'),
    (Join-Path $here 'winbox.exe'),
    (Join-Path $here 'WinBox.exe'),
    "$env:LOCALAPPDATA\MikroTik\WinBox\WinBox.exe",
    "$env:LOCALAPPDATA\MikroTik\Winbox\winbox64.exe",
    "$env:ProgramFiles\MikroTik\Winbox\winbox64.exe",
    'C:\winbox64.exe',
    'C:\winbox.exe'
  )
  foreach ($p in $candidates) {
    if ($p -and (Test-Path -LiteralPath $p)) {
      return $p
    }
  }
  return $null
}

$raw = $Uri.Trim()
$raw = $raw -replace '^winbox://', '' -replace '^winbox:', ''
$raw = $raw.Split('/')[0]

$user = $null
$pass = $null
$hostPart = $raw

if ($raw -match '^(?:([^:@/]+)(?::([^@/]*))?@)?(.+)$') {
  if ($Matches[1]) { $user = [uri]::UnescapeDataString($Matches[1]) }
  if ($null -ne $Matches[2] -and $Matches[2] -ne '') {
    $pass = [uri]::UnescapeDataString($Matches[2])
  }
  $hostPart = $Matches[3]
}

if (-not $hostPart) {
  Write-Error "URI invalida: $Uri"
  exit 1
}

$wb = Find-Winbox
if (-not $wb) {
  Write-Host "Winbox nao encontrado."
  Write-Host "Copie winbox64.exe para: $here"
  Read-Host "Enter para sair"
  exit 1
}

$argsList = New-Object System.Collections.Generic.List[string]
$argsList.Add($hostPart)
if ($user) {
  $argsList.Add($user)
  if ($null -ne $pass) {
    $argsList.Add($pass)
  }
}

Start-Process -FilePath $wb -ArgumentList $argsList.ToArray()
