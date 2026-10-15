'use strict';
require('dotenv').config();

/**
 * Las claves no son obligatorias para arrancar: sin ellas el bot funciona en
 * modo degradado (extractor local, sin planilla) y se puede probar por consola.
 * Lo que sí falla es intentar mandar un mensaje real sin EVOLUTION_APIKEY.
 */
function opt(nombre, porDefecto = '') {
  return process.env[nombre] || porDefecto;
}

/**
 * Una lista de números del .env: coma entre números, se ignora todo lo que no sea
 * dígito, con o sin el 9 de celular. Es el mismo parseo para todas las listas.
 */
function lista(nombre) {
  return (process.env[nombre] || '')
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter(Boolean);
}

// NUMEROS_TESTER reemplaza a NUMEROS_PRUEBA (Pendientes 1, Parte C, decisión de
// Tomás del 18/09/2026). Si NUMEROS_TESTER está vacía y NUMEROS_PRUEBA tiene
// contenido, NUMEROS_PRUEBA se lee como tester, para no romper el .env que ya está
// andando, y el bot lo avisa al arrancar (`numerosPruebaViejo`).
const numerosTester = lista('NUMEROS_TESTER');
const numerosPruebaViejos = lista('NUMEROS_PRUEBA');

/** CEREBRO_MODO (cerebro Sonnet, fases 1 y 2). Lo que no es uno de los cinco cuenta como apagado. */
const MODOS_DEL_CEREBRO = ['apagado', 'sombra', 'tester', 'nuevos', 'todos'];
function modoDelCerebro(valor) {
  const v = String(valor || '').trim().toLowerCase();
  return MODOS_DEL_CEREBRO.includes(v) ? v : 'apagado';
}

/** STOCK_APP_MODO (el stock de la app en la planilla, 08/10/2026). Lo que no es uno de los tres cuenta como apagado. */
const MODOS_DEL_STOCK = ['apagado', 'sombra', 'vivo'];
function modoDelStock(valor) {
  const v = String(valor || '').trim().toLowerCase();
  return MODOS_DEL_STOCK.includes(v) ? v : 'apagado';
}

module.exports = {
  puerto: parseInt(process.env.PORT || '3001', 10),
  // Vacío (lo normal): escucha en todas las interfaces, como siempre. Con HOST,
  // solo en esa dirección (por ejemplo 127.0.0.1). No está probado que Evolution,
  // desde Docker en Windows, llegue al bot por 127.0.0.1: ver README.
  host: process.env.HOST || '',
  estadoPath: process.env.ESTADO_PATH || '',
  // Modo solo lectura del estado (bloque 4, A7): carga y migra en memoria, pero
  // no escribe nunca, ni al salir. Para las herramientas que solo miran el
  // estado real (`npm run resumen`, `npm run destino`) mientras el bot corre.
  estadoSoloLectura: /^(1|true|si)$/i.test(process.env.ESTADO_SOLO_LECTURA || ''),
  aprendizajePath: process.env.APRENDIZAJE_PATH || '',
  descartadosPath: process.env.DESCARTADOS_PATH || '',
  agruparClienteMs: parseInt(process.env.AGRUPAR_CLIENTE_MS || '1200', 10),

  evolution: {
    url: process.env.EVOLUTION_URL || 'http://localhost:8080',
    instancia: process.env.EVOLUTION_INSTANCE || 'somosiphone',
    apikey: opt('EVOLUTION_APIKEY'),
  },

  // El webhook que llama Evolution (auditoría del 15/09/2026, A1).
  webhook: {
    // Con valor, solo se acepta POST /webhook/<secreto>. Vacío, /webhook como
    // siempre, y el bot lo avisa al arrancar. Letras y números, sin barras.
    secreto: opt('WEBHOOK_SECRETO'),
    // Tope de pedidos aceptados por minuto, en memoria. Alto a propósito: el uso
    // normal son unos pocos por minuto.
    maxPorMinuto: parseInt(process.env.WEBHOOK_MAX_POR_MINUTO || '600', 10),
    // Un messages.upsert trae un solo mensaje y sin archivos (WEBHOOK_BASE64 no
    // está prendido en docker-compose): 5 MB sobra.
    limiteCuerpo: '5mb',
  },

  gemini: {
    apikey: opt('GEMINI_API_KEY'),
    // Decisión de Claude del 30/09/2026, con las páginas de precios y de bajas de Google de
    // ese día: el principal es gemini-3.5-flash-lite (US$0,30 / US$2,50 por millón de tokens,
    // sin fecha de baja) y el respaldo gemini-3.1-flash-lite (US$0,25 / US$1,50, baja el
    // 07/05/2027): es el más barato y tiene su propio cupo. gemini-2.5-flash-lite sale: Google
    // lo limita a quienes ya lo usaban. La próxima vez se cambia en el .env.
    modelo: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    // Al que se pasa cuando el principal está saturado, no responde, no existe (404) o se
    // quedó sin cupo del día (429 por día). Es otro modelo, con su propio cupo.
    modeloRespaldo: process.env.GEMINI_MODEL_RESPALDO || 'gemini-3.1-flash-lite',
  },

  // CEREBRO SONNET (decisión de Tomás del 01/10/2026): Claude Sonnet 5.5 decide qué contestar.
  // Fase 1, en sombra: piensa con cada tanda real y lo anota (`propuesta-sonnet` en el registro de
  // aprendizaje), pero no manda nada. Ver src/cerebro.js. Tope de gasto: USD 60 por mes, puesto en
  // la cuenta de Anthropic.
  cerebro: {
    apikey: opt('ANTHROPIC_API_KEY'),
    // `apagado` (lo normal) no llama nunca a la API. `sombra`: piensa y anota, sin mandar nada.
    // Fase 2 (02/10/2026): `tester` (Sonnet le contesta de verdad al tester), `nuevos` (al tester y
    // a los chats nuevos) y `todos` (a todos los que contesta el bot); los demás, en sombra. Ver
    // `cerebro.quienAtiende`. Cualquier otro valor cuenta como apagado.
    modo: modoDelCerebro(process.env.CEREBRO_MODO),
    modelo: process.env.CEREBRO_MODELO || 'claude-sonnet-5-5',
    // Cada pedido a la API (una vuelta de herramientas). Si tarda más, ese turno es un error.
    timeoutMs: parseInt(process.env.CEREBRO_TIMEOUT_MS || '20000', 10) || 20000,
    // Cuánto piensa: low, medium o high. Para chat y con apuro, Anthropic recomienda empezar en
    // medium o low (el default de la API es high, más lento y más caro).
    esfuerzo: (process.env.CEREBRO_ESFUERZO || 'medium').trim().toLowerCase(),
    // Precios por millón de tokens, para estimar el gasto (los de Sonnet 5.5 al 02/10/2026).
    usdPorMillon: {
      entrada: parseFloat(process.env.CEREBRO_USD_ENTRADA || '2'),
      salida: parseFloat(process.env.CEREBRO_USD_SALIDA || '10'),
      cacheLeida: parseFloat(process.env.CEREBRO_USD_CACHE_LEIDA || '0.20'),
      cacheEscrita: parseFloat(process.env.CEREBRO_USD_CACHE_ESCRITA || '2.50'),
    },
    // Sombra donde atiende una persona (decisión de Tomás del 03/10/2026, por 7 días): con una fecha
    // AAAA-MM-DD, hasta ese día de Argentina inclusive Sonnet también piensa en sombra en los chats
    // que atiende una persona (los SILENCIO_TRAS_HUMANO_MIN, #pausa) y en los escalados que callan,
    // SIN MANDAR NADA. Vacía, con otro formato o vencida: nada. Tope por día en USD (en memoria).
    // Ver src/sombra-persona.js.
    sombraPersonaHasta: (process.env.CEREBRO_SOMBRA_PERSONA_HASTA || '').trim(),
    sombraPersonaTopeUsd: parseFloat(process.env.CEREBRO_SOMBRA_PERSONA_TOPE_USD || '1.5') || 1.5,
    // El tope del mes en USD (bloque Ninjo 2, 06/10/2026), para verlo en /salud (`cerebro.gastoMes`) y
    // para el aviso al grupo al pasar el 80%. El tope de verdad está puesto en la cuenta de Anthropic:
    // esto no corta nada. Desde el 08/10/2026 es el único (también el del panel): si no está, vale
    // CHIARA_TOPE_MES_USD (la del panel, la de antes); si no, 60. Ilegible o en cero, 60.
    topeMesUsd: (() => {
      const tope = parseFloat(process.env.CEREBRO_TOPE_MES_USD || process.env.CHIARA_TOPE_MES_USD || '60');
      return tope > 0 ? tope : 60;
    })(),
  },

  sheets: {
    id: opt('SHEET_ID'),
    credencialesPath: process.env.GOOGLE_CREDENTIALS_PATH || './credenciales.json',
    cacheSegundos: parseInt(process.env.SHEET_CACHE_SEGUNDOS || '300', 10),
  },

  // JID del grupo interno donde llegan los avisos. Formato: 1203...@g.us
  grupoAvisos: process.env.GRUPO_AVISOS_JID || '',

  // Ritmo humano: el bot nunca contesta al instante.
  ritmo: {
    esperaMinMs: parseInt(process.env.ESPERA_MIN_MS || '20000', 10),
    esperaMaxMs: parseInt(process.env.ESPERA_MAX_MS || '45000', 10),
    entreMensajesMs: parseInt(process.env.ENTRE_MENSAJES_MS || '1800', 10),
    maxMensajesPorTanda: parseInt(process.env.MAX_MENSAJES_TANDA || '4', 10),
  },

  // Carpeta con las fotos de los equipos, nombradas por modelo:
  // 13.jpg, 14-pro.jpg, 15-pro-max.png ... Si no existe, el bot no habla de fotos.
  fotosDir: process.env.FOTOS_DIR || './fotos',

  // Seguimiento: si el cliente no contesta, se le escribe UNA vez.
  seguimiento: {
    activo: String(process.env.SEGUIMIENTO_ACTIVO || 'true').toLowerCase() === 'true',
    minutos: parseInt(process.env.SEGUIMIENTO_MINUTOS || '45', 10),
    maxHoras: parseInt(process.env.SEGUIMIENTO_MAX_HORAS || '24', 10),
    maxPorBarrido: parseInt(process.env.SEGUIMIENTO_MAX_POR_BARRIDO || '2', 10),
    horaDesde: parseInt(process.env.SEGUIMIENTO_HORA_DESDE || '9', 10),
    horaHasta: parseInt(process.env.SEGUIMIENTO_HORA_HASTA || '22', 10),
    // Bloque Ninjo 1b (decisión de Tomás del 05/10/2026): el seguimiento sale solo después de una
    // tanda del bot con montos, hasta 2 veces. El 1º, SEGUIMIENTO_HORAS_1 después (3) y dentro de la
    // franja (10 a 21, hora de Argentina); el 2º, el día siguiente entre la apertura de la franja y
    // SEGUIMIENTO_MANANA_HASTA (12). La franja es aparte de SEGUIMIENTO_HORA_DESDE / _HASTA, que
    // siguen siendo del guardián y los recordatorios. Ver index.js `revisarSeguimientos`.
    horas1: parseFloat(process.env.SEGUIMIENTO_HORAS_1 || '3') || 3,
    franjaDesde: parseInt(process.env.SEGUIMIENTO_FRANJA_DESDE || '10', 10),
    franjaHasta: parseInt(process.env.SEGUIMIENTO_FRANJA_HASTA || '21', 10),
    mananaHasta: parseInt(process.env.SEGUIMIENTO_MANANA_HASTA || '12', 10),
  },

  // Cuando vence el silencio de una persona (bloque Ninjo 1b, decisión de Tomás del 05/10/2026): una
  // línea del cliente que llegó mientras atendía una persona y nadie contestó la atiende Sonnet, si
  // tiene menos de SILENCIO_MAX_HORAS (72). Hasta SILENCIO_MAX_POR_BARRIDO chats por barrido (3),
  // así no sale una ráfaga cuando el bot arranca. Ver index.js `revisarSilencios`.
  silencio: {
    maxHoras: parseFloat(process.env.SILENCIO_MAX_HORAS || '72') || 72,
    maxPorBarrido: parseInt(process.env.SILENCIO_MAX_POR_BARRIDO || '3', 10) || 3,
  },

  // Mensajes más viejos que esto se descartan sin mirarlos. Es la defensa
  // contra la sincronización de historial que WhatsApp manda al vincular.
  ignorarAnterioresSeg: parseInt(process.env.IGNORAR_ANTERIORES_SEG || '120', 10),

  // Resumen de la mañana al grupo interno: qué hay que contestar hoy.
  // Sale solo, a la hora fijada. No lee los mensajes del grupo: solo escribe.
  resumen: {
    // Arranca APAGADO a propósito: manda un mensaje solo, sin que nadie lo
    // dispare, y ya se fue una vez al destino equivocado. Se enciende a mano.
    activo: String(process.env.RESUMEN_ACTIVO || 'false').toLowerCase() === 'true',
    hora: parseInt(process.env.RESUMEN_HORA || '9', 10),
    diasFrio: parseInt(process.env.RESUMEN_DIAS_FRIO || '3', 10),
  },

  // Recordatorios manuales al grupo interno: #recordar <texto> y #hecho en el
  // chat del cliente. Suenan a la hora en punto desde `hora` hasta antes de
  // SEGUIMIENTO_HORA_HASTA. El arranque NO es SEGUIMIENTO_HORA_DESDE a
  // propósito: esto va al grupo interno, no a un cliente.
  recordatorio: {
    hora: parseInt(process.env.RECORDATORIO_HORA || '8', 10),
    // Después de tantos avisos sin #hecho, avisa una vez y deja de repetir.
    maxRepeticiones: parseInt(process.env.RECORDATORIO_MAX_REPETICIONES || '10', 10),
  },

  // Si un humano contestó en el chat, el bot se calla por este rato.
  silencioTrasHumanoMin: parseInt(process.env.SILENCIO_TRAS_HUMANO_MIN || '45', 10),

  // Chat escalado (auditoría del 15/09/2026, bloque 2): queda callado hasta que
  // alguien de la cuenta le escriba o pase ESCALADO_REANUDAR_HORAS sin que nadie
  // lo tome. Ver src/control.js.
  escalado: {
    // Un solo recordatorio al grupo si el cliente escribió algo después de escalar
    // y nadie de la cuenta lo tomó en estos minutos.
    recordatorioMin: parseInt(process.env.ESCALADO_RECORDATORIO_MIN || '30', 10),
    // Pasadas estas horas sin que nadie lo tome, un mensaje nuevo del cliente se
    // atiende como consulta nueva.
    reanudarHoras: parseInt(process.env.ESCALADO_REANUDAR_HORAS || '24', 10),
  },

  // DATOS VIEJOS POR TIEMPO (Pendientes 1, B3, decisión de Tomás del 18/09/2026).
  // Si un cliente vuelve a escribir después de tantas horas sin actividad en el
  // chat (el mensaje más nuevo del historial, de cualquiera de los dos lados), se
  // lo atiende como consulta nueva, haya escalado o no: se borran el modelo, el
  // monto, la forma de pago, la permuta y las marcas de "esto ya se dijo" de la
  // charla vieja. Quedan el nombre, la zona, las notas, el historial y los temas
  // explicados. Sin esto, una consulta nueva arrancaba con el modelo y el monto de
  // hace semanas.
  //
  // 72 horas por defecto: tres días cubren el "lo pienso y te escribo" de una
  // misma compra (el seguimiento es a los 45 minutos y el resumen enfría a los 3
  // días), y más que eso ya es otra consulta. Se cambia en el .env.
  datosViejosHoras: parseInt(process.env.DATOS_VIEJOS_HORAS || '72', 10),

  // GUARDIÁN DE EVOLUTION (decisión de Tomás del 21/09/2026). Tres cortes en tres
  // días con el mismo cuadro: el bot vivo y escribiendo el estado, pero sin que le
  // llegue ningún mensaje de Evolution, y nadie se enteró en el momento. El guardián
  // avisa al grupo interno; NO reinicia nada. Ver src/guardian.js.
  guardian: {
    // Prendido por defecto: solo le escribe al grupo interno, nunca a un cliente, y
    // pasa por las guardas de siempre (en modo escucha no sale nada). `false` apaga
    // los dos controles; reemplazó a la alerta de desconexión que había en index.js,
    // así que apagado no queda ninguna.
    activo: String(process.env.GUARDIAN_ACTIVO || 'true').toLowerCase() === 'true',
    // Cada cuántos minutos mira. 5, como los demás barridos: una consulta liviana a
    // Evolution, y un corte se conoce a los pocos minutos. Un valor ilegible o en
    // cero vuelve a 5: si quedara NaN, el barrido correría sin pausa.
    min: Math.max(1, parseInt(process.env.GUARDIAN_MIN || '5', 10) || 5),
    // Con la instancia en `open`, cuántos minutos sin que llegue NINGÚN mensaje por
    // el webhook (de clientes, propios, de grupos o estados) antes de avisar. Solo
    // se mira entre SEGUIMIENTO_HORA_DESDE y SEGUIMIENTO_HORA_HASTA, y el silencio
    // se cuenta desde que abrió la franja de hoy: de madrugada no llegan mensajes y
    // eso no es una falla. 45 porque en horario comercial la cuenta del negocio no
    // pasa tanto rato sin recibir nada. Ojo: el corte del 17/09 duró unos 40 minutos
    // y volvió solo, con 45 no habría avisado; el del 18/09 (desde las 21:17, con la
    // franja cerrando a las 22) habría avisado a las 9:45 de la mañana siguiente. Si
    // en una tarde tranquila avisa de más, se sube; para enterarse antes, se baja. Se
    // cambian en el .env.
    sinMensajesMin: parseInt(process.env.GUARDIAN_SIN_MENSAJES_MIN || '45', 10) || 45,
  },

  // MODO ESCUCHA: el bot lee todo y aprende, pero NO manda un solo mensaje.
  // Ni al cliente ni al grupo. Sirve para que aprenda de conversaciones reales
  // sin ningún riesgo mientras ustedes siguen atendiendo a mano.
  modoEscucha: String(process.env.MODO_ESCUCHA || 'false').toLowerCase() === 'true',

  // Modo borrador: no le manda nada al cliente, solo avisa al grupo qué habría respondido.
  modoBorrador: String(process.env.MODO_BORRADOR || 'true').toLowerCase() === 'true',

  // Cuántos mensajes seguidos SIN ninguna señal de venta se le contestan a un
  // chat antes de dejarlo. Es un crédito, no un filtro: un cliente nuevo que
  // escribe "hola" todavía no dijo nada de venta y no lo podemos perder.
  // Cualquier señal (un modelo, un monto) lo devuelve a cero.
  mensajesSinVenta: parseInt(process.env.MENSAJES_SIN_VENTA || '5', 10),

  // NOTAS DE VOZ. Se transcriben con Gemini, pidiéndole el archivo a Evolution.
  // Se apaga sola con AUDIO_ACTIVO=false, sin tocar el resto del bot. Con
  // --offline tampoco transcribe, porque ahí Gemini queda en modo solo-local.
  audio: {
    activo: String(process.env.AUDIO_ACTIVO || 'true').toLowerCase() === 'true',
  },

  // LISTAS BLANCAS DE PRUEBA (Pendientes 1, Parte C). Con alguna de las dos con
  // contenido, el bot SOLO le puede escribir a esos números (tester y piloto); a
  // cualquier otro lo trata como si MODO_BORRADOR siguiera en true (el borrador va
  // al grupo y al cliente no le llega nada). Las dos VACÍAS (lo normal) no cambian
  // absolutamente nada del comportamiento.
  //
  // TESTER: el celular de prueba. Además de recibir los envíos, puede mandar
  // comandos `#` desde su chat (#reset y sus typos reinician; cualquier otro `#` se
  // descarta), sus leads van a la pestaña LEADS_PRUEBA y no sale en el resumen.
  // Formato: coma entre números, se ignora todo lo que no sea dígito.
  //   NUMEROS_TESTER=5491100000000,54 9 11 0000-0001
  // Hasta el 18/09/2026 se llamaba NUMEROS_PRUEBA: si NUMEROS_TESTER está vacía y
  // NUMEROS_PRUEBA tiene contenido, se lee esa (y se avisa al arrancar).
  numerosTester: numerosTester.length ? numerosTester : numerosPruebaViejos,
  numerosPruebaViejo: !numerosTester.length && numerosPruebaViejos.length > 0,

  // PILOTO: clientes reales de la prueba. Reciben los envíos como el tester, pero
  // para todo lo demás son clientes: un "#reset" es un mensaje común, el lead va a
  // LEADS y aparecen en el resumen.
  //   NUMEROS_PILOTO=5492995550003
  // Con NUMEROS_PILOTO=todos (27/09/2026, decisión de Tomás: el bot atiende a todos
  // los clientes) cualquier chat recibe los envíos; el tester sigue siendo tester
  // (comandos #, LEADS_PRUEBA, fuera del resumen). `numerosPiloto` queda vacía.
  numerosPiloto: lista('NUMEROS_PILOTO'),
  pilotoTodos: (process.env.NUMEROS_PILOTO || '').trim().toLowerCase() === 'todos',
  // Solo chats nuevos (28/09/2026; definición del 29/09/2026): el bot solo le escribe a un chat
  // que empezó desde cero con él mirando y donde nunca escribió nadie de la cuenta. A un chat
  // viejo (lista de chats-viejos.js, o donde escribió una persona) no le escribe aunque sea
  // piloto o "todos" (va como borrador); sin la lista al día, a ninguno. El tester no cambia.
  // En la reproducción de chats reales, casi todo lo que salía mal eran chats que ya llevaba
  // una persona. Apagado si no está en el .env.
  soloChatsNuevos: (process.env.SOLO_CHATS_NUEVOS || '').trim().toLowerCase() === 'true',

  // LISTA NEGRA DE CONTACTOS PERSONALES. Familia, amigos, proveedores: gente
  // que escribe al mismo número que los clientes pero no es una venta.
  //
  // Un chat de esta lista se ignora ENTERO, lo más temprano posible: no se
  // procesa, no se guarda, no va a Gemini, no se le transcriben los audios, no
  // sale en el resumen y nunca se le contesta.
  //
  // VACÍA (lo normal) no cambia nada. Formato: coma entre números, se ignora
  // todo lo que no sea dígito, con o sin el 9 de celular.
  //   CONTACTOS_PERSONALES=5492995550001,5492995550002
  contactosPersonales: lista('CONTACTOS_PERSONALES'),

  // PRECIOS DE TECHSUR (01/10/2026). El bot lee el grupo Avisos de la comunidad TechSur y guarda
  // los precios en la app de ventas (panel Cotización). Solo lee: nunca le escribe al grupo.
  // Ver src/techsur.js.
  techsur: {
    activo: (process.env.TECHSUR_ACTIVO || 'true').trim().toLowerCase() !== 'false',
    // Vacío (lo normal): se busca el grupo por nombre. Con uno o más JID (coma), solo esos.
    grupoJid: process.env.TECHSUR_GRUPO_JID || '',
    nombre: process.env.TECHSUR_GRUPO_NOMBRE || 'techsur',
    // El Supabase de la app de ventas (los mismos valores que su .env.local).
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    diasMax: 7,
    logPath: process.env.TECHSUR_LOG_PATH || '',
  },

  // PANEL CHIARA (06/10/2026). Cada 1 minuto el bot sube al Supabase de la app de ventas (el mismo de
  // arriba: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY) su estado, los leads, los números del día y las
  // noticias, y lee las órdenes del panel. CHIARA_PANEL_ACTIVO=false lo apaga entero (no cuenta ni sube).
  // El gasto del mes y su tope son los de cerebro (CEREBRO_TOPE_MES_USD, con CHIARA_TOPE_MES_USD de
  // respaldo, 08/10/2026). Ver src/panel-chiara.js.
  panel: {
    activo: (process.env.CHIARA_PANEL_ACTIVO || 'true').trim().toLowerCase() !== 'false',
  },

  // EL STOCK DE LA APP EN LA PLANILLA (08/10/2026, decisiones de Tomás; parte 2 del diseño de escritorio).
  // La planilla del Cotizador es donde vive todo: la app la cambia por medio del bot y Chiara la sigue
  // leyendo. Cada 1 minuto el bot lee `v_stock_chiara` del Supabase de la app (el mismo de arriba) y escribe
  // la pestaña USADOS (lo del local); aplica los pedidos `planilla_ordenes` (SÍ/NO en la columna STOCK de
  // LISTA y LISTA 85-93, lo del depósito) y el espejo copia STOCK a la app. Ver src/stock-app.js.
  //   apagado (lo normal): nada de esto corre; Chiara contesta como siempre.
  //   sombra: escribe la pestaña "USADOS APP" (no USADOS) para compararla en el Drive, aplica las órdenes
  //           y copia STOCK; Chiara contesta como siempre (sin el filtro de STOCK ni la frase del depósito).
  //   vivo:   escribe USADOS y Chiara usa lo nuevo: local primero, el depósito con STOCK, la frase del
  //           depósito y el código del equipo al escalar.
  // Cambiarlo pide reiniciar el bot.
  stockApp: {
    modo: modoDelStock(process.env.STOCK_APP_MODO),
    // La pestaña que se escribe en sombra. Es la única que el bot puede crear.
    pestanaSombra: 'USADOS APP',
  },
};
