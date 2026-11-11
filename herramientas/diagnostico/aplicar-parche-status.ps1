# Aplica el parche de Baileys (ack de <status>) ADENTRO del contenedor evolution_api y lo reinicia.
# Corta a los dos bots (Piedra e iPhone) mientras reinicia, cerca de 1 minuto. No toca .env ni el bot de iPhone.
# Resultado: E:\bot-piedra\data\parche-status.txt
$ErrorActionPreference = 'Continue'
$bot = 'E:\bot-piedra'; $sal = "$bot\data\parche-status.txt"; $cont = 'evolution_api'
$h = @{}
foreach ($l in [IO.File]::ReadAllLines("$bot\.env")) { if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $h[$Matches[1]] = $Matches[2].Trim() } }
$url = 'http://localhost:8080'; $cab = @{ apikey = $h['EVOLUTION_APIKEY'] }
$o = New-Object System.Collections.Generic.List[string]
function P($t) { $t = [string]$t; $o.Add($t); Write-Host $t }
function Guardar() { [IO.File]::WriteAllLines($sal, [string[]]@($o), (New-Object System.Text.UTF8Encoding($false))) }
function Estado($i) { try { (Invoke-RestMethod -Headers $cab "$url/instance/connectionState/$i" -TimeoutSec 10).instance.state } catch { 'sin respuesta' } }
P "== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') parche de status en $cont"
docker cp "$PSScriptRoot\patch-status.cjs" "${cont}:/tmp/patch-status.cjs" 2>&1 | ForEach-Object { P "cp> $_" }
$r = docker exec -u 0 $cont node /tmp/patch-status.cjs /evolution/node_modules/baileys 2>&1 | ForEach-Object { [string]$_ }
foreach ($l in $r) { P "parche> $l" }
$texto = ($r -join ' ')
if ($texto -notmatch 'PARCHE-OK|YA-PARCHEADO') { P 'NO se aplico el parche: no reinicio nada.'; Guardar; exit 1 }
P "`n== reinicio del contenedor $cont"
docker restart $cont 2>&1 | ForEach-Object { P "restart> $_" }
for ($i = 1; $i -le 24; $i++) {
  Start-Sleep 10
  $a = Estado 'somospiedra'; $b = Estado 'somosiphone'
  P "a los $($i*10) s -> somospiedra=$a somosiphone=$b"
  if ($a -eq 'open' -and $b -eq 'open' -and $i -ge 3) { break }
}
Start-Sleep 45
$log = docker logs --since 3m $cont 2>&1 | ForEach-Object { [string]$_ }
P "`n== 3 min de log: renglones=$(@($log).Count) 'stream errored out'=$(@($log | Where-Object { $_ -match 'stream errored out' }).Count) 'acking status'=$(@($log | Where-Object { $_ -match 'acking status' }).Count)"
try { $s = Invoke-RestMethod "http://localhost:3002/salud" -TimeoutSec 15; P "Erasmo: whatsapp=$($s.whatsapp) ultimoEntrante=$($s.ultimoEntrante)" } catch { P "Erasmo /salud no responde" }
P "== fin $(Get-Date -Format 'HH:mm:ss')"
Guardar
