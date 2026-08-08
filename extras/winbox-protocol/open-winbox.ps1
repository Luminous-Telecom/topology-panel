# Abre Winbox / Winbox Novo a partir da URI:
#   winbox://192.168.88.1
#   winbox://admin:senha@192.168.88.1
#   winboxnovo://192.168.88.1
#   winboxnovo://admin:senha@192.168.88.1

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Uri
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Find-App([string[]]$Names) {
  $dirs = @(
    $here,
    "$env:LOCALAPPDATA\MikroTik\WinBox",
    "$env:LOCALAPPDATA\MikroTik\Winbox",
    "$env:ProgramFiles\MikroTik\Winbox",
    'C:\'
  )
  foreach ($dir in $dirs) {
    if (-not $dir -or -not (Test-Path -LiteralPath $dir)) { continue }
    foreach ($name in $Names) {
      $p = Join-Path $dir $name
      if (Test-Path -LiteralPath $p) { return $p }
    }
  }
  return $null
}

$uriTrim = $Uri.Trim()
$variant = 'classic'
if ($uriTrim -match '^(?i)winboxnovo:') {
  $variant = 'novo'
  $raw = $uriTrim -replace '^(?i)winboxnovo://', '' -replace '^(?i)winboxnovo:', ''
} else {
  $raw = $uriTrim -replace '^(?i)winbox://', '' -replace '^(?i)winbox:', ''
}
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

if ($variant -eq 'novo') {
  $wb = Find-App @(
    'Winbox Novo.exe',
    'WinboxNovo.exe',
    'winbox novo.exe',
    'WinBox Novo.exe'
  )
  $label = 'Winbox Novo'
} else {
  $wb = Find-App @(
    'winbox64.exe',
    'winbox.exe',
    'WinBox.exe'
  )
  $label = 'Winbox'
}

if (-not $wb) {
  Write-Host "$label nao encontrado."
  if ($variant -eq 'novo') {
    Write-Host "Copie o executavel 'Winbox Novo.exe' para: $here"
  } else {
    Write-Host "Copie winbox64.exe para: $here"
  }
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
