# Diagnostico de SOLO LECTURA de Evolution para Erasmo (10/11/2026). No cambia nada.
# Deja el resultado en E:\bot-piedra\data\diagnostico-evolution.txt, sin claves ni secretos.
$ErrorActionPreference = 'Continue'
$bot = 'E:\bot-piedra'
$sal = "$bot\data\diagnostico-evolution.txt"
$h = @{}
foreach ($l in [IO.File]::ReadAllLines("$bot\.env")) { if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $h[$Matches[1]] = $Matches[2].Trim() } }
$url = 'http://localhost:8080'; $cab = @{ apikey = $h['EVOLUTION_APIKEY'] }
$secretos = @($h['EVOLUTION_APIKEY'], $h['WEBHOOK_SECRETO'], $h['ANTHROPIC_API_KEY']) | Where-Object { $_ }
function Limpio($t) {
  $t = [string]$t
  foreach ($s in $secretos) { $t = $t.Replace($s, '<oculto>') }
  $t = $t -replace '(/webhook/)[A-Za-z0-9_\-]{6,}', '$1<secreto>'
  $t = $t -replace '(?i)("?(apikey|api_key|authorization|token|password|secret)[A-Za-z_]*"?\s*[:=]\s*"?)[^",\s}]+', '$1<oculto>'
  $t
}
$o = New-Object System.Collections.Generic.List[string]
function P($t) { $o.Add((Limpio $t)) }
P "== diagnostico $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
P "`n== puertos"
foreach ($p in 3001, 3002, 8080) { $c = @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue); P "puerto $p escucha: $($c.Count -gt 0) (proceso $(($c | % OwningProcess | select -Unique) -join ','))" }
P "`n== instancias"
try { $i = Invoke-RestMethod -Headers $cab "$url/instance/fetchInstances" -TimeoutSec 20; foreach ($x in @($i)) { P "$($x.name) estado=$($x.connectionStatus) numero=$($x.ownerJid) mensajes=$($x._count.Message) actualizado=$($x.updatedAt)" } } catch { P "ERROR fetchInstances: $($_.Exception.Message)" }
foreach ($inst in 'somospiedra', 'somosiphone') {
  P "`n== webhook de $inst"
  try { $w = Invoke-RestMethod -Headers $cab "$url/webhook/find/$inst" -TimeoutSec 20; P ($w | ConvertTo-Json -Depth 6 -Compress) } catch { P "ERROR: $($_.Exception.Message)" }
}
P "`n== ultimos mensajes del tester que tiene Evolution (somospiedra)"
try {
  $b = @{ where = @{ key = @{ remoteJid = '5492994295806@s.whatsapp.net' } }; page = 1; offset = 8 } | ConvertTo-Json -Depth 6
  $m = Invoke-RestMethod -Method Post -Headers $cab -ContentType 'application/json' -Body $b "$url/chat/findMessages/somospiedra" -TimeoutSec 30
  $recs = if ($m.messages.records) { $m.messages.records } else { $m }
  P "total: $($m.messages.total)"
  foreach ($r in @($recs) | select -First 8) { $t = [DateTimeOffset]::FromUnixTimeSeconds([int64]$r.messageTimestamp).ToLocalTime().ToString('MM-dd HH:mm:ss'); $tx = [string]$r.message.conversation; if ($tx.Length -gt 50) { $tx = $tx.Substring(0, 50) }; P "$t fromMe=$($r.key.fromMe) jid=$($r.key.remoteJid) tipo=$($r.messageType) texto=$tx" }
} catch { P "ERROR findMessages: $($_.Exception.Message)" }
P "`n== docker"
$ps = docker ps --format '{{.Names}} | {{.Image}} | {{.Status}}' 2>&1; foreach ($l in $ps) { P $l }
$cont = (docker ps --format '{{.Names}} {{.Image}}' 2>$null | Where-Object { $_ -match 'evolution' -and $_ -notmatch 'postgres|redis' } | select -First 1)
if ($cont) {
  $nombre = $cont.Split(' ')[0]
  P "`n== variables WEBHOOK / version del contenedor $nombre"
  $envs = docker inspect $nombre --format '{{range .Config.Env}}{{println .}}{{end}}' 2>&1
  foreach ($l in $envs) { if ($l -match '^(WEBHOOK_|SERVER_URL|CACHE_|DATABASE_SAVE|LOG_LEVEL|DEL_INSTANCE|CONFIG_SESSION)') { if ($l -match '^WEBHOOK_GLOBAL_URL=') { P ($l -replace '(https?://[^/]+/[^/]*/?).*', '$1<resto oculto>') } else { P $l } } }
  P "imagen: $(docker inspect $nombre --format '{{.Config.Image}} iniciado {{.State.StartedAt}} reinicios {{.RestartCount}}')"
  P "`n== log de Evolution, ultimos 90 min: renglones de webhook / error / reintento (ultimos 120)"
  $log = docker logs --since 90m $nombre 2>&1 | ForEach-Object { [string]$_ }
  P "renglones en 90 min: $(@($log).Count)"
  $f = $log | Where-Object { $_ -match '(?i)webhook|retry|tentativa|error|ECONN|timeout|prisma|falha|failed' }
  P "renglones que coinciden: $(@($f).Count)"
  foreach ($l in @($f) | select -Last 120) { $x = ($l -replace '\x1b\[[0-9;]*m', ''); if ($x.Length -gt 420) { $x = $x.Substring(0, 420) }; P $x }
  P "`n== log de Evolution: ultimos 25 renglones tal cual"
  foreach ($l in @($log) | select -Last 25) { $x = ($l -replace '\x1b\[[0-9;]*m', ''); if ($x.Length -gt 300) { $x = $x.Substring(0, 300) }; P $x }
} else { P 'no encontre el contenedor de Evolution' }
P "`n== fin"
[IO.File]::WriteAllLines($sal, $o, (New-Object System.Text.UTF8Encoding($false)))
