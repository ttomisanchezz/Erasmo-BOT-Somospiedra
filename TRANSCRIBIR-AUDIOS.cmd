@echo off
rem Solo el paso 2 de REVISAR-VENTAS: transcribe los audios de los chats de anuncios.
rem Lo que muestra queda tambien en data\historial\transcribir-audios.log (para que Claude lo lea).
cd /d E:\bot-piedra
powershell -NoProfile -ExecutionPolicy Bypass -Command "node herramientas\anuncios\transcribir-audios.js 2>&1 | Tee-Object -FilePath data\historial\transcribir-audios.log"
echo.
echo Listo. Avisale a Claude.
pause
