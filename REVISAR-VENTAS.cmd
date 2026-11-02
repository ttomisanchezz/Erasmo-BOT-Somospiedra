@echo off
rem Revisa las ventas por anuncio (02/11/2026): exporta el historial de Evolution (solo lee) y transcribe
rem los audios de los chats que vinieron por anuncio. No manda nada a nadie. Al terminar, avisale a Claude.
cd /d E:\bot-piedra
echo == 1/2 Exportando el historial desde el 13/10 (solo lectura) ==
node herramientas\historial\exportar-historial.js --desde=2026-10-13
echo.
echo == 2/2 Transcribiendo los audios de los chats de anuncios (usa Gemini) ==
node herramientas\anuncios\transcribir-audios.js
echo.
echo Listo. Avisale a Claude "ya termino".
pause
