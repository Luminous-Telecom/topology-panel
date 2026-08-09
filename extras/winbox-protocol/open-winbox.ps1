# Abre Winbox / WinBoxNovo — IP, usuário e senha na linha de comando:
#   winbox.exe <IP> <user> <password>
#
# URI (IP na query — o Chrome injeta "/" se o IP for o host da URI):
#   winbox://open?h=192.168.88.1&c=BASE64URL(user\npass)
#   winboxnovo://open?h=192.168.88.1&c=BASE64URL(user\npass)
# Legado:
#   winbox://192.168.88.1?c=...
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

function Decode-Query([string]$Query) {
  $map = @{}
  if (-not $Query) { return $map }
  foreach ($pair in ($Query.TrimStart('?') -split '&')) {
    if (-not $pair) { continue }
    $kv = $pair -split '=', 2
    $k = [uri]::UnescapeDataString($kv[0])
    $v = if ($kv.Count -gt 1) { [uri]::UnescapeDataString($kv[1]) } else { '' }
    $map[$k] = $v
  }
  return $map
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

# Separa path e query (Chrome pode transformar open?h= em open/?h=)
$query = ''
$pathPart = $raw
if ($raw.Contains('?')) {
  $qi = $raw.IndexOf('?')
  $pathPart = $raw.Substring(0, $qi).TrimEnd('/')
  $query = $raw.Substring($qi)
}

$q = Decode-Query $query

# Formato atual: ?h=IP&c=b64
if ($q.ContainsKey('h') -and $q['h']) {
  $hostPart = ($q['h']).Trim().TrimEnd('/')
  if ($q.ContainsKey('c') -and $q['c']) {
    $decoded = From-B64Url $q['c']
    $nl = $decoded.IndexOf([char]10)
    if ($nl -ge 0) {
      $user = $decoded.Substring(0, $nl)
      $pass = $decoded.Substring($nl + 1)
    } else {
      $user = $decoded
      $pass = ''
    }
  }
}
# Legado: IP?c=b64  (path = IP ou IP/)
elseif ($pathPart -and $q.ContainsKey('c') -and $q['c'] -and $pathPart -ne 'open') {
  $hostPart = $pathPart.Trim().TrimEnd('/')
  $decoded = From-B64Url $q['c']
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
elseif ($pathPart -match '^(?:(?<user>[^:@/]+)(?::(?<pass>[^@/]*))?@)?(?<host>.+)$') {
  $hostPart = $Matches['host'].Split('/')[0].Trim().TrimEnd('/')
  if ($Matches['user']) {
    try { $user = [uri]::UnescapeDataString($Matches['user']) } catch { $user = $Matches['user'] }
  }
  if ($null -ne $Matches['pass']) {
    try { $pass = [uri]::UnescapeDataString($Matches['pass']) } catch { $pass = $Matches['pass'] }
  }
}
elseif ($pathPart -and $pathPart -ne 'open') {
  $hostPart = $pathPart.Trim().TrimEnd('/')
}

if (-not $hostPart) {
  Write-Error "URI invalida: $Uri"
  exit 1
}

# Remove barra residual (ex.: 192.168.88.1/)
$hostPart = $hostPart.Trim().TrimEnd('/')

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

$hasPass = ($null -ne $pass -and $pass -ne '')
Write-LaunchLog -App $wb -HostPart $hostPart -User $(if ($user) { $user } else { '' }) -HasPass $hasPass

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $wb
$psi.UseShellExecute = $false
$psi.WorkingDirectory = Split-Path -Parent $wb

if ($user) {
  $passArg = if ($null -ne $pass) { $pass } else { '' }
  $psi.Arguments = ('"{0}" "{1}" "{2}"' -f $hostPart, $user, $passArg)
} else {
  $psi.Arguments = ('"{0}"' -f $hostPart)
}

[void][System.Diagnostics.Process]::Start($psi)
