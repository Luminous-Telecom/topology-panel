# Abre Winbox / WinBoxNovo — mesmo estilo The Dude:
#   winbox.exe <IP> <user> <password>
#
# URI (sem % — o Windows corrompe %XX no handler):
#   winbox://192.168.88.1?c=BASE64URL(user\npass)
#   winboxnovo://192.168.88.1?c=BASE64URL(user\npass)
# Legado:
#   winbox://user:pass@192.168.88.1

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

function From-B64Url([string]$s) {
  $p = $s.Replace('-', '+').Replace('_', '/')
  while ($p.Length % 4 -ne 0) { $p += '=' }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p))
}

function Write-LaunchLog([string]$App, [string]$HostPart, [string]$User, [bool]$HasPass) {
  $log = Join-Path $here 'last-launch.txt'
  @"
time=$([DateTime]::Now.ToString('s'))
app=$App
host=$HostPart
user=$User
hasPassword=$HasPass
uri=$Uri
"@ | Set-Content -LiteralPath $log -Encoding UTF8
}

$uriTrim = $Uri.Trim()
$variant = 'classic'
if ($uriTrim -match '^(?i)winboxnovo:') {
  $variant = 'novo'
  $raw = $uriTrim -replace '^(?i)winboxnovo://', '' -replace '^(?i)winboxnovo:', ''
} else {
  $raw = $uriTrim -replace '^(?i)winbox://', '' -replace '^(?i)winbox:', ''
}

$user = $null
$pass = $null
$hostPart = $null

# Formato novo: IP?c=b64  ou  IP:port?c=b64
if ($raw -match '^(?<host>[^?]+)\?c=(?<c>[A-Za-z0-9_-]+)$') {
  $hostPart = $Matches['host']
  $decoded = From-B64Url $Matches['c']
  $nl = $decoded.IndexOf([char]10)
  if ($nl -ge 0) {
    $user = $decoded.Substring(0, $nl)
    $pass = $decoded.Substring($nl + 1)
  } else {
    $user = $decoded
    $pass = ''
  }
}
# Legado: user:pass@host
elseif ($raw -match '^(?:(?<user>[^:@/]+)(?::(?<pass>[^@/]*))?@)?(?<host>.+)$') {
  $hostPart = $Matches['host'].Split('/')[0]
  if ($Matches['user']) {
    try { $user = [uri]::UnescapeDataString($Matches['user']) } catch { $user = $Matches['user'] }
  }
  if ($null -ne $Matches['pass']) {
    try { $pass = [uri]::UnescapeDataString($Matches['pass']) } catch { $pass = $Matches['pass'] }
  }
}

if (-not $hostPart) {
  Write-Error "URI invalida: $Uri"
  exit 1
}

if ($variant -eq 'novo') {
  $wb = Find-App @('WinBoxNovo.exe', 'Winbox Novo.exe', 'WinboxNovo.exe')
  $label = 'WinBoxNovo'
} else {
  $wb = Find-App @('winbox64.exe', 'winbox.exe', 'WinBox.exe')
  $label = 'Winbox'
}

if (-not $wb) {
  $log = Join-Path $here 'winbox-launcher-error.txt'
  @"
$label nao encontrado.
Copie o executavel para: $here
URI: $Uri
"@ | Set-Content -LiteralPath $log -Encoding UTF8
  exit 1
}

$hasPass = ($null -ne $pass)
Write-LaunchLog -App $wb -HostPart $hostPart -User $(if ($user) { $user } else { '' }) -HasPass $hasPass

# Igual The Dude: winbox.exe <IP> <user> <password>
# ProcessStartInfo evita bugs do Start-Process -ArgumentList no PowerShell 5
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $wb
$psi.UseShellExecute = $false
$psi.WorkingDirectory = Split-Path -Parent $wb

if ($user) {
  # Aspas protegem senha com espacos; "" = senha vazia (doc MikroTik)
  $passArg = if ($hasPass) { $pass } else { '' }
  $psi.Arguments = ('"{0}" "{1}" "{2}"' -f $hostPart, $user, $passArg)
} else {
  $psi.Arguments = ('"{0}"' -f $hostPart)
}

[void][System.Diagnostics.Process]::Start($psi)
