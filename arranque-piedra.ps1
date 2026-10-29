# Arranque automatico del bot de Somos Piedra (19/10/2026, pedido de Tomas).
#
# Lo corre la tarea programada "Bot Piedra - arranque" al iniciar sesion en Windows
# (3 minutos despues, asi el arranque del bot de iPhone ya levanto Docker y Evolution).
# Solo ARRANCA, en el modo que diga el .env (hoy MODO_ESCUCHA): no manda mensajes ni avisos.
#
# Pasos: 1) si algo ya escucha en el puerto 3002, termina. 2) espera hasta 10 min a que
# Evolution conteste y la instancia somospiedra diga "open" (si no, arranca igual y lo anota).
# 3) abre la ventana "BOT PIEDRA" con npm start y el log en data\consola.log.
# Con -Simular hace los controles y anota lo que haria, sin abrir nada.
# Registro: E:\bot-piedra\arranque-piedra.log
param([switch]$Simular)

$ErrorActionPreference = 'Continue'
$bot = 'E:\bot-piedra'
$registro = "$bot\arranque-piedra.log"

function Anotar($texto) {
  $linea = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $texto"
  Add-Content -Path $registro -Value $linea -Encoding UTF8
}

function LeerEnv($archivo) {
  $h = @{}
  foreach ($linea in [IO.File]::ReadAllLines($archivo)) {
    if ($linea -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $clave = $Matches[1]; $valor = $Matches[2].Trim()
      if ($valor -match '^"(.*)"$' -or $valor -match "^'(.*)'$") { $valor = $Matches[1] }
      else { $valor = ($valor -replace '\s+#.*$', '').Trim() }
      $h[$clave] = $valor
    }
  }
  $h
}
function Valor($h, $clave, $porDefecto) { if ($h[$clave]) { $h[$clave] } else { $porDefecto } }

Anotar "== arranque Piedra (usuario $env:USERNAME)$(if ($Simular) { ', SIMULADO' })"

try { $envBot = LeerEnv "$bot\.env" } catch { Anotar "no pude leer el .env: $($_.Exception.Message)"; exit 1 }
$puerto = Valor $envBot 'PORT' '3002'
$evoUrl = (Valor $envBot 'EVOLUTION_URL' 'http://localhost:8080').TrimEnd('/')
$instancia = Valor $envBot 'EVOLUTION_INSTANCE' 'somospiedra'
$cabeceras = @{ apikey = $envBot['EVOLUTION_APIKEY'] }

# 1. Si ya corre, no se toca nada (se mira el puerto: el bot de iPhone tambien es node src/index.js).
$corriendo = @(Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue)
if ($corriendo.Count) {
  Anotar "Piedra ya corre (puerto $puerto, proceso $(($corriendo | ForEach-Object { $_.OwningProcess }) -join ', ')): no hago nada"
  if (-not $Simular) { exit 0 }
}

# 2. Evolution (lo levanta el arranque del bot de iPhone): esperar a que la instancia diga open.
$estado = 'sin leer'
for ($i = 0; $i -lt 120; $i++) {
  try {
    $estado = (Invoke-RestMethod -Headers $cabeceras "$evoUrl/instance/connectionState/$instancia" -TimeoutSec 10).instance.state
    if ($estado -eq 'open') { break }
  } catch { $estado = 'no responde' }
  if ($Simular) { break }
  Start-Sleep 5
}
Anotar "instancia ${instancia}: $estado"

# 3. El bot, en su ventana.
if ($Simular) { Anotar 'abriria la ventana BOT PIEDRA con npm start'; Anotar '== fin'; exit 0 }
Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "`$host.UI.RawUI.WindowTitle='BOT PIEDRA'; Set-Location $bot; npm start 2>&1 | Tee-Object -FilePath $bot\data\consola.log -Append"
Anotar 'abri la ventana BOT PIEDRA'
Start-Sleep 30
$escucha = @(Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue)
Anotar $(if ($escucha.Count) { "OK: Piedra escucha en el puerto $puerto" } else { "FALLA: a los 30 s nada escucha en el puerto $puerto (mirar la ventana BOT PIEDRA)" })
Anotar '== fin'
