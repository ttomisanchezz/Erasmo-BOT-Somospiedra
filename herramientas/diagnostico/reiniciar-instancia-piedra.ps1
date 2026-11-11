# Reinicia SOLO la instancia somospiedra de Evolution (no el contenedor, no somosiphone). 10/11/2026.
# Antes y despues anota que tiene Evolution. Resultado: E:\bot-piedra\data\reinicio-instancia.txt (sin claves).
$ErrorActionPreference = 'Continue'
$bot = 'E:\bot-piedra'; $sal = "$bot\data\reinicio-instancia.txt"; $inst = 'somospiedra'
$h = @{}
foreach ($l in [IO.File]::ReadAllLines("$bot\.env")) { if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $h[$Matches[1]] = $Matches[2].Trim() } }
if ($h['EVOLUTION_INSTANCE'] -ne $inst) { "EVOLUTION_INSTANCE no es ${inst}: no hago nada" | Set-Content $sal; exit 1 }
$url = 'http://localhost:8080'; $cab = @{ apikey = $h['EVOLUTION_APIKEY'] }
$o = New-Object System.Collections.Generic.List[string]
function P($t) { $t = [string]$t; foreach ($s in @($h['EVOLUTION_APIKEY'], $h['WEBHOOK_SECRETO'])) { if ($s) { $t = $t.Replace($s, '<oculto>') } }; $o.Add($t); Write-Host $t }
function Hora($s) { [DateTimeOffset]::FromUnixTimeSeconds([int64]$s).ToLocalTime().ToString('MM-dd HH:mm:ss') }
function Ultimos($titulo) {
  P "`n== $titulo"
  try {
    $desde = [DateTimeOffset]::Now.AddHours(-3).ToUnixTimeSeconds()
    $b = @{ where = @{ messageTimestamp = @{ gte = ([DateTimeOffset]::Now.AddHours(-3).UtcDateTime.ToString('o')) } }; page = 1; offset = 200 } | ConvertTo-Json -Depth 6
    $m = Invoke-RestMethod -Method Post -Headers $cab -ContentType 'application/json' -Body $b "$url/chat/findMessages/$inst" -TimeoutSec 40
    $recs = @($m.messages.records) | Where-Object { [int64]$_.messageTimestamp -ge $desde } | Sort-Object { [int64]$_.messageTimestamp }
    P "mensajes de las ultimas 3 h en Evolution: $($recs.Count) (total que devolvio: $($m.messages.total))"
    foreach ($r in $recs | select -Last 12) { $j = [string]$r.key.remoteJid; P "$(Hora $r.messageTimestamp) fromMe=$($r.key.fromMe) ...$($j.Substring([Math]::Max(0,$j.IndexOf('@')-4))) $($r.messageType)" }
  } catch { P "ERROR findMessages: $($_.Exception.Message)" }
}
function Estado() { try { (Invoke-RestMethod -Headers $cab "$url/instance/connectionState/$inst" -TimeoutSec 15).instance.state } catch { "sin respuesta ($($_.Exception.Message))" } }
P "== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') estado antes: $(Estado)"
Ultimos 'ANTES del reinicio'
P "`n== reinicio de la instancia $inst"
$ok = $false
foreach ($metodo in 'Post', 'Put') {
  try { $r = Invoke-RestMethod -Method $metodo -Headers $cab "$url/instance/restart/$inst" -TimeoutSec 60; P "$metodo /instance/restart: OK $(($r | ConvertTo-Json -Depth 4 -Compress))"; $ok = $true; break }
  catch { P "$metodo /instance/restart: $($_.Exception.Message) $($_.ErrorDetails.Message)" }
}
for ($i = 1; $i -le 9; $i++) { Start-Sleep 10; $e = Estado; P "a los $($i*10) s: $e"; if ($e -eq 'open' -and $i -ge 3) { break } }
try { $s = Invoke-RestMethod "http://localhost:3002/salud" -TimeoutSec 15; P "Erasmo /salud: whatsapp=$($s.whatsapp) modo=$($s.modo) ultimoEntrante=$($s.ultimoEntrante)" } catch { P "Erasmo /salud: $($_.Exception.Message)" }
Start-Sleep 20
Ultimos 'DESPUES del reinicio (50 s)'
try { $s = Invoke-RestMethod "http://localhost:3002/salud" -TimeoutSec 15; P "Erasmo /salud: ultimoEntrante=$($s.ultimoEntrante)" } catch {}
P "`n== fin $(Get-Date -Format 'HH:mm:ss')"
[IO.File]::WriteAllLines($sal, $o, (New-Object System.Text.UTF8Encoding($false)))
