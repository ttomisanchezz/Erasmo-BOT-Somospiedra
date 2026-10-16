# conectar-piedra.ps1
# Crea la instancia "somospiedra" en el Evolution que ya corre, deja el webhook apuntando a este bot
# (puerto 3002), muestra el QR para escanear y, cuando conecta, arranca el bot en MODO ESCUCHA.
# No toca la instancia "somosiphone" ni el bot de Somos iPhone.
# Uso (PowerShell):  powershell -ExecutionPolicy Bypass -File E:\bot-piedra\conectar-piedra.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Leer-Env($ruta) {
  $h = @{}
  Get-Content $ruta | ForEach-Object {
    if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$') { $h[$matches[1]] = $matches[2].Trim('"').Trim("'") }
  }
  return $h
}
function Paso($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Llamar($metodo, $ruta, $cuerpo) {
  $args2 = @{ Method = $metodo; Uri = "$script:url$ruta"; Headers = $script:h; ContentType = 'application/json' }
  if ($cuerpo) { $args2.Body = ($cuerpo | ConvertTo-Json -Depth 8) }
  return Invoke-RestMethod @args2
}
function Mostrar-Error($e) {
  $d = $e.ErrorDetails.Message
  if ($d) { Write-Host "   Respuesta de Evolution: $d" -ForegroundColor Yellow } else { Write-Host "   $($e.Exception.Message)" -ForegroundColor Yellow }
}

$e = Leer-Env '.env'
$script:url = if ($e.EVOLUTION_URL) { $e.EVOLUTION_URL.TrimEnd('/') } else { 'http://localhost:8080' }
$inst = $e.EVOLUTION_INSTANCE
$puerto = $e.PORT
$secreto = $e.WEBHOOK_SECRETO
if (-not $e.EVOLUTION_APIKEY) { throw 'Falta EVOLUTION_APIKEY en .env' }
if (-not $inst -or -not $puerto -or -not $secreto) { throw 'Faltan EVOLUTION_INSTANCE, PORT o WEBHOOK_SECRETO en .env' }
if ($inst -eq 'somosiphone') { throw 'La instancia no puede llamarse somosiphone: es la del otro bot.' }
$script:h = @{ apikey = $e.EVOLUTION_APIKEY }
$webhookUrl = "http://host.docker.internal:$puerto/webhook/$secreto"

Paso '1. Dependencias del bot (npm install)'
npm install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install fallo' }

Paso '2. Evolution responde?'
try { $lista = Llamar 'Get' '/instance/fetchInstances' $null } catch { Mostrar-Error $_; throw "No llego a Evolution en $script:url. Esta Docker Desktop encendido?" }
$existe = @($lista) | Where-Object { $_.name -eq $inst -or $_.instanceName -eq $inst -or $_.instance.instanceName -eq $inst }
Write-Host "   Instancias: $((@($lista) | ForEach-Object { if ($_.name) { $_.name } else { $_.instance.instanceName } }) -join ', ')"

if ($existe) {
  Write-Host "   La instancia $inst ya existe: se reutiliza." -ForegroundColor Yellow
} else {
  Paso "3. Crear la instancia $inst (sin QR todavia)"
  try {
    $null = Llamar 'Post' '/instance/create' @{ instanceName = $inst; integration = 'WHATSAPP-BAILEYS'; qrcode = $false }
    Write-Host '   Creada.'
  } catch { Mostrar-Error $_; throw 'No se pudo crear la instancia.' }

  Paso '4. Ajustes: traer el historial al vincular, no marcar como leido'
  try {
    $null = Llamar 'Post' "/settings/set/$inst" @{ rejectCall = $false; msgCall = ''; groupsIgnore = $false; alwaysOnline = $false; readMessages = $false; readStatus = $false; syncFullHistory = $true }
    Write-Host '   Listo.'
  } catch { Mostrar-Error $_; Write-Host '   (No es grave: sigo. Avisame con el texto de arriba.)' -ForegroundColor Yellow }
}

Paso '5. Webhook de la instancia hacia este bot'
$eventos = @('MESSAGES_UPSERT', 'CONNECTION_UPDATE')
try {
  $null = Llamar 'Post' "/webhook/set/$inst" @{ webhook = @{ enabled = $true; url = $webhookUrl; byEvents = $false; webhookByEvents = $false; base64 = $false; webhookBase64 = $false; events = $eventos } }
  $w = Llamar 'Get' "/webhook/find/$inst" $null
  $u = if ($w.url) { $w.url } else { $w.webhook.url }
  if ($u -and $u -like "*:$puerto/webhook/*") { Write-Host "   Webhook OK -> puerto $puerto" -ForegroundColor Green }
  else { Write-Host '   El webhook no quedo como esperaba. Respuesta:' -ForegroundColor Yellow; $w | ConvertTo-Json -Depth 5 }
} catch { Mostrar-Error $_; throw 'No se pudo dejar el webhook. No sigo: sin webhook el bot no recibe nada.' }

Paso '6. QR: escanealo con el WhatsApp de Somos Piedra (Dispositivos vinculados > Vincular dispositivo)'
$qrArchivo = Join-Path $PSScriptRoot 'qr-piedra.png'
function Traer-Qr {
  $q = Llamar 'Get' "/instance/connect/$inst" $null
  if ($q.base64) {
    $b = $q.base64 -replace '^data:image/[a-z]+;base64,', ''
    [IO.File]::WriteAllBytes($qrArchivo, [Convert]::FromBase64String($b))
    return $true
  }
  return $false
}
function Estado { try { $s = Llamar 'Get' "/instance/connectionState/$inst" $null; if ($s.instance.state) { return $s.instance.state } else { return $s.state } } catch { return 'desconocido' } }

if ((Estado) -ne 'open') {
  $hayQr = $false
  for ($i = 0; $i -lt 6 -and -not $hayQr; $i++) { try { $hayQr = Traer-Qr } catch {}; if (-not $hayQr) { Start-Sleep -Seconds 3 } }
  if ($hayQr) { Start-Process $qrArchivo; Write-Host "   QR abierto ($qrArchivo). Se renueva solo cada 20 segundos: si vence, cerra la imagen y abrila de nuevo." }
  else { Write-Host '   No vino un QR. Respuesta de Evolution:' -ForegroundColor Yellow }
  $limite = (Get-Date).AddMinutes(6); $ultimo = Get-Date
  while ((Get-Date) -lt $limite -and (Estado) -ne 'open') {
    Start-Sleep -Seconds 3
    if (((Get-Date) - $ultimo).TotalSeconds -ge 20) { try { $null = Traer-Qr } catch {}; $ultimo = Get-Date }
  }
}
if ((Estado) -ne 'open') { throw 'El QR vencio sin conectar. Volve a correr el script.' }
Write-Host '   CONECTADO.' -ForegroundColor Green
Remove-Item $qrArchivo -ErrorAction SilentlyContinue

Paso '7. Cuanto historial llego (puede tardar unos minutos en terminar de bajar)'
Start-Sleep -Seconds 20
try {
  $ch = Llamar 'Post' "/chat/findChats/$inst" @{}
  Write-Host "   Chats: $(@($ch).Count)"
} catch { Mostrar-Error $_ }
try {
  $m = Llamar 'Post' "/chat/findMessages/$inst" @{ where = @{}; page = 1; offset = 1 }
  $tot = if ($m.messages.total) { $m.messages.total } elseif ($m.total) { $m.total } else { '?' }
  Write-Host "   Mensajes guardados: $tot"
} catch { Mostrar-Error $_ }

Paso '8. Primer commit local (para ver despues que se cambia)'
try {
  if (-not (Test-Path '.git')) { git init -q; git add -A; git -c user.name='Tomas' -c user.email='tomas@local' commit -q -m 'Base: copia del bot de Somos iPhone para Somos Piedra (modo escucha)'; Write-Host '   Hecho.' }
  else { Write-Host '   Ya habia repo.' }
} catch { Write-Host '   (git no pudo: no es grave)' -ForegroundColor Yellow }

Paso '9. Arrancar el bot en MODO ESCUCHA (no manda nada)'
Start-Process cmd.exe -ArgumentList '/k', 'title Bot Somos Piedra (escucha) && node src\index.js' -WorkingDirectory $PSScriptRoot
Write-Host ''
Write-Host 'Listo. Copia lo que dice arriba (chats y mensajes) y pegaselo a Claude.' -ForegroundColor Green
