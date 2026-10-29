# Registra la tarea "Bot Piedra - arranque": al iniciar sesion, 3 minutos despues, corre
# arranque-piedra.ps1. Correr UNA vez en PowerShell:
#   powershell -ExecutionPolicy Bypass -File E:\bot-piedra\registrar-arranque-piedra.ps1
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File E:\bot-piedra\arranque-piedra.ps1'
$yo = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name   # DOMINIO\usuario (solo 'PC' no lo acepta)
$disparo = New-ScheduledTaskTrigger -AtLogOn -User $yo
$disparo.Delay = 'PT3M'
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName 'Bot Piedra - arranque' -Action $accion -Trigger $disparo -Settings $ajustes -Description 'Arranca el bot de Somos Piedra (escucha) al iniciar sesion' -Force -ErrorAction Stop | Out-Null
Write-Host "Tarea 'Bot Piedra - arranque' registrada para $yo." -ForegroundColor Green
Write-Host 'Prueba sin abrir nada:' -ForegroundColor Cyan
powershell -NoProfile -ExecutionPolicy Bypass -File E:\bot-piedra\arranque-piedra.ps1 -Simular
Get-Content E:\bot-piedra\arranque-piedra.log -Tail 6
