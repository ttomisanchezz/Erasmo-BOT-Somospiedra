# SOLO LECTURA: que dice el log de Evolution de los ultimos 15 min. Resultado: E:\bot-piedra\data\log-reciente.txt
$ErrorActionPreference = 'Continue'
$bot = 'E:\bot-piedra'; $sal = "$bot\data\log-reciente.txt"
$h = @{}
foreach ($l in [IO.File]::ReadAllLines("$bot\.env")) { if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $h[$Matches[1]] = $Matches[2].Trim() } }
$secretos = @($h['EVOLUTION_APIKEY'], $h['WEBHOOK_SECRETO']) | Where-Object { $_ }
$o = New-Object System.Collections.Generic.List[string]
function P($t) { $t = [string]$t; foreach ($s in $secretos) { $t = $t.Replace($s, '<oculto>') }; $t = $t -replace '(/webhook/)[A-Za-z0-9_\-]{6,}', '$1<secreto>'; $o.Add($t) }
P "== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
try { $s = Invoke-RestMethod "http://localhost:3002/salud" -TimeoutSec 15; P "Erasmo: whatsapp=$($s.whatsapp) ultimoEntrante=$($s.ultimoEntrante) ultimoMensaje=$($s.ultimoMensaje) llamadasHoy=$($s.cerebro.llamadasHoy) lidSinTraducir=$($s.chatsViejos.lidSinTraducir)" } catch { P "salud: $($_.Exception.Message)" }
$log = docker logs --since 15m evolution_api 2>&1 | ForEach-Object { ([string]$_) -replace '\x1b\[[0-9;]*m', '' }
P "renglones en 15 min: $(@($log).Count)"
P "con instanceId de somospiedra (d18761f2): $(@($log | Where-Object { $_ -match 'd18761f2' }).Count)"
P "con instanceId de somosiphone (e851689b): $(@($log | Where-Object { $_ -match 'e851689b' }).Count)"
P "`n== renglones con hora o con error (sin los Bad Request)"
$ant = ''
foreach ($l in $log) {
  if ($l -match "error: 'Bad Request'") { continue }
  if ($l -match '^\[Evolution API\]|^\{"level"|(?i)stream|pre-key|prekey|timed out|conflict|logout|close|connection|decrypt|bad mac|session|local:|message:|status' ) {
    if ($l -eq $ant) { continue }; $ant = $l
    if ($l.Length -gt 700) { $l = $l.Substring(0, 700) }
    P $l
  }
}
[IO.File]::WriteAllLines($sal, [string[]]@($o | select -Last 260), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Listo: $sal"
