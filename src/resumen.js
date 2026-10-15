'use strict';
/**
 * El resumen de la mañana: qué hay que contestar hoy, en orden de prioridad.
 *
 * Sale de `data/estado.json`, que ya tiene todo lo que hace falta: qué modelo
 * pidió cada cliente, cuánto tiene, si el bot ya cotizó, si escaló, y cuándo
 * fue la última vez que alguien escribió.
 *
 * No inventa nada ni consulta a ninguna IA: es lectura y orden.
 *
 * Devuelve un ARRAY de mensajes, no un texto: el resumen nunca se recorta.
 * Si no entra en un mensaje de WhatsApp, se parte en varios numerados.
 */
const state = require('./state');
const evolution = require('./evolution');
const config = require('./config');

const DIA_MS = 24 * 60 * 60 * 1000;

/** La barra que separa un lead del siguiente. */
const BARRA = '━'.repeat(20);

/** Largo cómodo para un mensaje de WhatsApp. Pasado esto, se parte en varios. */
const LARGO_MENSAJE = 1500;

function pesos(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR');
}

function telefono(chatId) {
  return String(chatId).split('@')[0];
}

/**
 * ¿Es un JID de teléfono de verdad?
 *
 * No todo lo que hay en estado.json es un cliente: un script de diagnóstico
 * puede dejar una clave con una etiqueta en vez de un número — ya pasó con
 * `gemini-check@s.whatsapp.net` — y el resumen salía con un `wa.me/gemini-check`
 * que no lleva a ningún lado. Antes de armar un link, se verifica.
 */
function esTelefono(chatId) {
  return /^\d{6,}$/.test(telefono(chatId));
}

/**
 * ¿Es el chat de un cliente real? Lo que no, no sale en ningún bloque del
 * resumen (Ajustes 1, 16/09/2026): grupos, contactos personales, el tester
 * (NUMEROS_TESTER) y los JID sin número (`gemini-check@s.whatsapp.net`). No se
 * borran del estado: solo se filtran acá. Un cliente piloto (NUMEROS_PILOTO) es un
 * cliente real y SÍ aparece (Pendientes 1, Parte C).
 *
 * El tester se compara con `estaEnLaLista`, como sus comandos `#` y LEADS_PRUEBA, y
 * no con `esDestinoDePrueba`: esa deja pasar a todos con las listas vacías.
 */
function entraEnElResumen(chatId) {
  return (
    !chatId.endsWith('@g.us') &&
    esTelefono(chatId) &&
    !evolution.esContactoPersonal(chatId) &&
    !evolution.estaEnLaLista(chatId, config.numerosTester)
  );
}

/** 0:00 del día de `ahora` corrido `dias` días, en la hora local de la PC. */
function inicioDelDia(ahora, dias = 0) {
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + dias).getTime();
}

/**
 * Los turnos que se ven en el chat (Ajustes 1, decisión de Tomás del 16/09/2026).
 * Las ventas se hacen en persona y nadie anota #vendido, pero en el chat se ve el
 * encuentro: "te anoto para las 16", "nos vemos hoy", "te esperamos adentro",
 * "estamos afuera", "ahi te paso el alias". Es una guía, no una venta confirmada.
 *
 * Calibrado el 16/09/2026 contra el historial real (en una copia, solo lectura).
 * Palabras sueltas del negocio que NO son turno y por eso quedaron afuera: "te
 * estoy esperando" (esperando una respuesta), "cuando llegue" (que llegue un
 * equipo), "te dejo el alias" (para cobrar una cuota), "anotada para las 17 del
 * sabado" (otro día), "nos vemos" a secas (una despedida).
 */
const NORMALIZAR = (t) =>
  String(t || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();

/** "a la mañana" es una franja, no el día siguiente (igual que `mencionaDia` en responder.js). */
const sinFranja = (t) => t.replace(/\b(a|por|de|en) la manana\b/g, ' ');

/** Nombra otro día: el encuentro no es el del día en que se escribió. */
const OTRO_DIA =
  /\b(manana|pasado|lunes|martes|miercoles|jueves|viernes|sabado|domingo|finde|fin de semana|semana que viene|proxima semana)\b/;

/** Señales de encuentro para el mismo día en que se escribió. */
const TURNO_HOY = [
  /\bnos vemos (hoy|ahora|en un rat(o|ito)|al rato|mas tarde|a la tarde|a la noche|a las \d|tipo \d|en \d)/,
  // "cuando quieras te esperamos" es una invitación, no un turno.
  /^(?!.*\bcuando (quieras|puedas|gustes)\b).*\bte (espero|esperamos)\b/,
  /\b(estoy|estamos|esta|estas|estes|ya|aca|aqui)( aca| aqui| ya)? afuera\b|^afuera\b/,
  /\bya (llegue|llegamos|estoy llegando|estamos llegando)\b|^(llegue|llegamos)\b|\b(estoy|estamos) llegando\b|\brecien (llegue|llego)\b/,
  /\bya (estoy|estamos) (aca|aqui|ahi|afuera|abajo|en la puerta|en el local)\b|\bya (estoy|estamos)[\s!.]*$|\b(estoy|estamos) (aca|aqui) (adentro|afuera|en la puerta)\b/,
  /\b(te|le) (paso|mando|envio) (el |mi )?alias\b|\b(pasame|mandame|pasas|mandas|pasar|pasarme|mandarme) (el |tu )?alias\b/,
  /\bhoy (a|tipo|como a|a eso de) (las )?\d/,
  /\b(anoto|anote|anotado|anotada|agendo|agende|agendado|agendada)\b[^.?!]{0,25}\b(a|para) las \d/,
];

/** Un alias para la cuota es un cobro, no un encuentro. */
const NO_ES_TURNO = /\bcuotas?\b/;

/** Señales que fijan el encuentro para el día siguiente. */
const TURNO_MANANA = [
  /\bnos vemos manana\b/,
  /\b(anoto|anote|anotado|anotada|agendo|agende|agendado|agendada)\b[^.?!]{0,30}\bmanana\b/,
  /\bmanana a ?las \d/,
  /\bte (espero|esperamos) manana\b/,
];

/**
 * ¿El mensaje fija un encuentro? 'hoy' (el mismo día en que se escribió),
 * 'manana' (el día siguiente) o null.
 */
function senalDeTurno(texto) {
  const t = sinFranja(NORMALIZAR(texto));
  if (/\bpasado manana\b/.test(t)) return null;
  if (TURNO_MANANA.some((re) => re.test(t))) return 'manana';
  if (OTRO_DIA.test(t) || NO_ES_TURNO.test(t)) return null;
  return TURNO_HOY.some((re) => re.test(t)) ? 'hoy' : null;
}

/**
 * Los chats con un turno ayer, del más temprano al más tarde. Cuenta un mensaje
 * de ayer (del vendedor o del cliente) con señal para ese día, o uno de anteayer
 * que lo fija para el día siguiente. Solo chats de clientes reales, comerciales o
 * no: en la calibración, dos ventas de ayer no tenían modelo ni monto guardado.
 *
 * Ojo: el historial guarda las últimas 15 líneas por chat. Un chat que siguió
 * hablando mucho después del turno puede haberlo perdido.
 */
function turnosDeAyer(todos, ahora = new Date()) {
  const hoy = inicioDelDia(ahora, 0);
  const ayer = inicioDelDia(ahora, -1);
  const anteayer = inicioDelDia(ahora, -2);
  const turnos = [];
  for (const [chatId, s] of Object.entries(todos || {})) {
    if (!s || !entraEnElResumen(chatId)) continue;
    const linea = (s.historial || []).find((l) => {
      if (l.ts >= ayer && l.ts < hoy) return senalDeTurno(l.texto) === 'hoy';
      if (l.ts >= anteayer && l.ts < ayer) return senalDeTurno(l.texto) === 'manana';
      return false;
    });
    if (linea) turnos.push({ chatId, s, ts: linea.ts });
  }
  return turnos.sort((a, b) => a.ts - b.ts);
}

/** Un turno, en un renglón: número, nombre, modelo y wa.me (siempre es un teléfono: lo filtra entraEnElResumen). */
function lineaDeTurno(n, { chatId, s }) {
  const partes = [`${n}) ${s.nombre || telefono(chatId)}`];
  if (s.modelo) partes.push(s.modelo.replace(/^iPhone\s*/i, ''));
  partes.push(`wa.me/${telefono(chatId)}`);
  return partes.join(' · ');
}

/**
 * ¿Esta conversación es comercial?
 *
 * El resumen es la lista de a quién hay que contestarle para vender, así que
 * un "gracias" o una charla personal no tienen por qué ocupar un renglón.
 *
 * Ojo con qué cuenta como señal: `timing` y `zona` quedan AFUERA a propósito.
 * Un "mañana" o un "centro" aparecen en cualquier charla y no prueban que
 * alguien esté comprando; son datos DE una venta, no evidencia DE una venta.
 *
 * Al revés, alcanza con una sola señal fuerte: preferimos mostrar un chat de
 * más antes que perder un lead.
 */
/**
 * ¿El cliente dijo algo que sea, en sí mismo, una señal de venta?
 *
 * Ojo que `escalado` NO está en esta lista, y es el punto importante. Escalar
 * no prueba que haya una venta: los dos escalados más frecuentes del bot son
 * "no entiendo qué necesita" y "mandó varios mensajes que no se entienden".
 * Contarlo como señal haría que cualquier chat confuso se declare comercial
 * justamente por no entenderse, que es al revés.
 *
 * Esta es la que usa el flujo de respuesta para decidir si sigue contestando.
 */
function senalesDeVenta(s) {
  if (!s) return false;
  return Boolean(
    s.modelo ||
      s.entrega ||
      s.presupuestoAnotado ||
      s.cotizadoDe ||
      s.forma_pago ||
      (s.permuta && s.permuta.modelo) ||
      (s.modelosPedidos && s.modelosPedidos.length)
  );
}

/**
 * ¿Este chat va en el resumen?
 *
 * Acá sí cuenta `escalado`: un chat que quedó esperando a una persona hay que
 * mirarlo a la mañana, se haya entendido o no.
 */
function esComercial(s) {
  if (!s) return false;
  return senalesDeVenta(s) || Boolean(s.escalado);
}

/** Cuánto hace que hubo actividad en ese chat, en horas. */
function horasDesde(ts) {
  if (!ts) return Infinity;
  return (Date.now() - ts) / (60 * 60 * 1000);
}

function haceCuanto(ts) {
  const h = horasDesde(ts);
  if (h === Infinity) return 'sin fecha';
  if (h < 1) return 'hace menos de 1h';
  if (h < 24) return `hace ${Math.round(h)}h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

/** El último mensaje del cliente en ese chat. */
function ultimoDelCliente(s) {
  const h = [...(s.historial || [])].reverse().find((m) => m.quien === 'cliente');
  return h || null;
}

/**
 * Qué tan cerca está de comprar. Es lo que ordena las listas: primero el que
 * más definido tiene todo, no el que escribió más tarde.
 */
function calor(s) {
  let n = 0;
  if (s.modelo) n += 2;
  if (s.entrega) n += 3;
  if (s.cotizadoDe) n += 3;
  if (s.forma_pago) n += 1;
  if (s.timing) n += 1;
  if (s.zona) n += 1;
  if (s.permuta && s.permuta.modelo) n += 1;
  return n;
}

/**
 * Un lead, numerado. El número es continuo en todo el resumen: si se parte en
 * varios mensajes la numeración sigue, para no tener que cruzar listas.
 */
function linea(n, chatId, s, nota, ts, vuelve = '') {
  const quien = s.nombre || (esTelefono(chatId) ? telefono(chatId) : 'chat sin número');
  // `vuelve`: ya estaba marcado y volvió a escribir. No se lee como un lead nuevo.
  const cabecera = [`${n}) ${quien}${vuelve ? ` (${vuelve})` : ''}`];
  if (s.modelo) cabecera.push(s.modelo.replace(/^iPhone\s*/i, ''));
  if (s.entrega) cabecera.push(`entrega ${pesos(s.entrega)}`);
  else if (s.presupuestoAnotado) cabecera.push(`dijo tener ${pesos(s.presupuestoAnotado)}`);

  const filas = [cabecera.join(' · ')];
  if (nota) filas.push(`   ${nota}`);
  filas.push(`   ${haceCuanto(ts)}`);
  // Nunca un link que no sea un teléfono: si no lo es, se dice y se marca.
  filas.push(
    esTelefono(chatId)
      ? `   wa.me/${telefono(chatId)}`
      : `   ⚠️ sin link: el chat no tiene número (${chatId})`
  );
  return filas.join('\n');
}

/**
 * Reparte los bloques en mensajes que entren en `largoMax`, sin cortar ningún
 * bloque por la mitad. Si uno solo ya es más largo que el tope, sale igual:
 * preferimos un mensaje largo antes que perder un lead.
 */
function partir(bloques, largoMax) {
  const RESERVA = 16; // para el "(1/3)" que se agrega después
  const partes = [];
  let actual = '';
  for (const b of bloques) {
    if (actual && (actual + '\n' + b).length + RESERVA > largoMax) {
      partes.push(actual);
      actual = b;
    } else {
      actual = actual ? actual + '\n' + b : b;
    }
  }
  if (actual) partes.push(actual);
  return partes;
}

/**
 * Las ventas y pérdidas anotadas con #vendido / #perdido durante el día
 * anterior a `ahora` (de 0:00 a 23:59), en cuántas el bot había propuesto algún
 * mensaje (`conBot`) y en cuántas le llegó a mandar alguno de verdad
 * (`conEnvio`). Es lo que dice si el bot ayuda a vender.
 *
 * Se cuentan todos los chats, comerciales o no: una venta cerrada a mano en un
 * chat donde el bot no entendió nada también es una venta. Los contactos
 * personales y los chats de prueba no, igual que en el resto del resumen.
 */
function resultadosDeAyer(todos, ahora = new Date()) {
  const hasta = inicioDelDia(ahora, 0);
  const desde = inicioDelDia(ahora, -1);
  const cuenta = {
    vendido: { total: 0, conBot: 0, conEnvio: 0 },
    perdido: { total: 0, conBot: 0, conEnvio: 0 },
  };
  for (const [chatId, s] of Object.entries(todos || {})) {
    const r = s && s.resultado;
    if (!r || !cuenta[r.tipo]) continue;
    if (!entraEnElResumen(chatId)) continue;
    if (!(r.ts >= desde && r.ts < hasta)) continue;
    cuenta[r.tipo].total++;
    if (r.botParticipo) cuenta[r.tipo].conBot++;
    if (r.botLeMando) cuenta[r.tipo].conEnvio++;
  }
  return cuenta;
}

/**
 * Por qué un chat ya marcado vuelve a las listas: "vendido ayer", "perdido el
 * 12", "vendido el 30/08" si es de otro mes. Va al lado del nombre: no es un
 * lead nuevo, es alguien que volvió a escribir después de que se anotó cómo
 * terminó. Los días se cuentan por calendario, no por horas.
 */
function porQueVuelve(r, ahora) {
  if (!r || !r.tipo) return '';
  const d = new Date(r.ts);
  const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(ahora) - dia(d)) / DIA_MS);
  let cuando;
  if (dias === 0) cuando = 'hoy';
  else if (dias === 1) cuando = 'ayer';
  else if (d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear()) cuando = `el ${d.getDate()}`;
  else cuando = `el ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${r.tipo} ${cuando}`;
}

/**
 * Los vendidos y perdidos de ayer, solo si alguien anotó alguno (Ajustes 1): con
 * los dos en cero no sale nada, ni el recordatorio de cómo se anotan. Nadie usaba
 * #vendido y el resumen decía "💰 0 vendidos" todos los días; lo que sí se ve en
 * el chat son los turnos (`bloqueTurnos`). Devuelve '' si no hay nada.
 */
function bloqueAyer(todos, ahora) {
  const c = resultadosDeAyer(todos, ahora);
  if (!c.vendido.total && !c.perdido.total) return '';
  const dia = new Date(inicioDelDia(ahora, -1)).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
  });
  // "Participó" es que propuso algo. Debajo, en cuántos le mandó algo de verdad,
  // solo si no es cero: en escucha o en borrador es siempre cero y sobra.
  const fila = (emoji, { total, conBot, conEnvio }, singular, plural) => {
    const renglon = `${emoji} ${total} ${total === 1 ? singular : plural}${total ? ` · el bot participó en ${conBot}` : ''}`;
    return conEnvio ? `${renglon}\n   📤 le mandó mensajes en ${conEnvio}` : renglon;
  };
  return [`📊 Ayer, ${dia}`, fila('💰', c.vendido, 'vendido', 'vendidos'), fila('❌', c.perdido, 'perdido', 'perdidos')].join('\n');
}

/**
 * Los turnos de ayer, arriba de todo del resumen (Ajustes 1). Cada uno en su
 * bloque, para que `partir` pueda repartirlos en varios mensajes sin cortar
 * ninguno. `n` numera los renglones y sigue en las listas de abajo.
 */
function bloqueTurnos(todos, ahora, numerar) {
  const turnos = turnosDeAyer(todos, ahora);
  if (!turnos.length) return ['📅 Ayer no hubo turnos anotados en el chat'];
  return [`📅 Turnos de ayer (${turnos.length})`, ...turnos.map((t) => lineaDeTurno(numerar(), t))];
}

/**
 * Arma el resumen.
 *
 * @param {object} todos      el mapa de conversaciones (state.todos())
 * @param {number} diasFrio   a partir de cuántos días cuenta como frío
 * @param {Date}   ahora      define la fecha del encabezado y cuál es "ayer"
 * @returns {string[]}        uno o más mensajes listos para mandar
 */
function armar(todos, diasFrio = 3, ahora = new Date()) {
  const paraCerrar = [];
  const esperando = [];
  const colgados = [];
  const frios = [];

  for (const [chatId, s] of Object.entries(todos || {})) {
    if (!s || s.pausado) continue;
    // Grupos, contactos personales, números de prueba y JID sin número no salen,
    // aunque hayan quedado en estado.json. Así agregar un número a
    // CONTACTOS_PERSONALES lo saca del resumen sin tener que borrar nada.
    if (!entraEnElResumen(chatId)) continue;
    // El resumen es para vender: los chats personales no ocupan renglón.
    if (!esComercial(s)) continue;

    const ultCliente = ultimoDelCliente(s);
    // Ya se anotó cómo terminó (#vendido / #perdido): no es un pendiente. Vuelve
    // si el cliente escribió después de anotarlo: un perdido que vuelve a
    // preguntar o un vendido con un problema no se pueden perder acá.
    if (s.resultado && !(ultCliente && ultCliente.ts > s.resultado.ts)) continue;
    const ultimaActividad = Math.max(s.ultimoBot || 0, s.ultimoHumano || 0, ultCliente?.ts || 0);
    if (!ultimaActividad) continue;

    const dias = (Date.now() - ultimaActividad) / DIA_MS;
    const clienteEsperaRespuesta = ultCliente && ultCliente.ts > (s.ultimoBot || 0) && ultCliente.ts > (s.ultimoHumano || 0);

    // 1. Escalados: el bot le pasó el chat a una persona y nadie contestó todavía.
    if (s.escalado) {
      esperando.push({ chatId, s, calor: calor(s), ts: ultimaActividad });
      continue;
    }

    // 2. Ya cotizado y el cliente todavía no respondió: es el más cerca de cerrar.
    if (s.cotizadoDe && !clienteEsperaRespuesta && dias <= diasFrio) {
      paraCerrar.push({ chatId, s, calor: calor(s), ts: ultimaActividad });
      continue;
    }

    // 3. El cliente escribió último y nadie le contestó.
    if (clienteEsperaRespuesta) {
      colgados.push({ chatId, s, calor: calor(s), ts: ultimaActividad });
      continue;
    }

    // 4. Frío: pasaron los días y quedó ahí.
    if (dias >= diasFrio) {
      frios.push({ chatId, s, calor: calor(s), ts: ultimaActividad, dias });
    }
  }

  const ordenar = (arr) => arr.sort((a, b) => b.calor - a.calor || b.ts - a.ts);
  ordenar(paraCerrar);
  ordenar(esperando);
  ordenar(colgados);
  ordenar(frios);

  const fecha = ahora.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const total = paraCerrar.length + esperando.length + colgados.length + frios.length;
  // La numeración es continua en todo el resumen: arranca en los turnos.
  let n = 0;
  const numerar = () => ++n;

  // Arriba de todo, los turnos de ayer; después los vendidos y perdidos (solo si
  // se anotó alguno) y cuántos chats hay para mirar. Sin tope: entran todos. Si no
  // entran en un mensaje, se parte en varios.
  const [tituloTurnos, ...turnos] = bloqueTurnos(todos, ahora, numerar);
  const pendientes = total
    ? `${total} ${total === 1 ? 'chat' : 'chats'} para mirar`
    : 'No hay nada pendiente. Ningún cliente esperando respuesta.';
  const bloques = [
    `☀️ Buen día — ${fecha}\n\n${tituloTurnos}`,
    ...turnos,
    '\n' + [bloqueAyer(todos, ahora), pendientes].filter(Boolean).join('\n\n'),
  ];

  const seccion = (titulo, items, nota) => {
    if (!items.length) return;
    bloques.push(`${titulo} (${items.length})`);
    for (const it of items) {
      bloques.push(BARRA);
      // A las listas solo llega un chat marcado si volvió a escribir: se dice por qué.
      bloques.push(linea(numerar(), it.chatId, it.s, nota(it), it.ts, porQueVuelve(it.s.resultado, ahora)));
    }
    bloques.push(BARRA);
  };

  seccion('🔥 PARA CERRAR — ya tienen precio', paraCerrar, () => 'cotizado, no contestó todavía');
  // Escalados sin tomar: el motivo con el que escaló y cuánto escribió después (el
  // bot no le contesta a un chat escalado, ver control.js).
  seccion('⏳ TE ESTÁN ESPERANDO A VOS', esperando, ({ s }) => {
    const motivo = s.escaladoMotivo || s.ultimoMotivo || 'escalado';
    const despues = s.escaladoEn
      ? (s.historial || []).filter((l) => l.quien === 'cliente' && l.ts > s.escaladoEn).length
      : 0;
    return despues ? `${motivo} · escribió ${despues} ${despues === 1 ? 'mensaje' : 'mensajes'} después` : motivo;
  });
  seccion('💬 ESCRIBIERON Y NADIE CONTESTÓ', colgados, ({ s }) => {
    const ult = ultimoDelCliente(s);
    return ult ? `"${ult.texto.slice(0, 70)}"` : '';
  });
  seccion(`❄️ PARA REACTIVAR — ${diasFrio}+ días`, frios, () => '');

  const partes = partir(bloques, LARGO_MENSAJE);
  if (partes.length === 1) return partes;
  return partes.map((p, i) => `(${i + 1}/${partes.length})\n${p}`);
}

/**
 * El resumen de hoy, leyendo el estado real.
 * Devuelve un ARRAY de mensajes: el resumen nunca se recorta, se parte.
 */
function deHoy(diasFrio) {
  return armar(state.todos(), diasFrio);
}

/**
 * ¿Toca mandar el resumen en este momento?
 *
 * La pregunta NO es "¿son las 9?" sino "¿ya pasaron las 9 de hoy y todavía no
 * salió?". Esa diferencia es la que recupera el día cuando el bot no estuvo
 * levantado durante la hora configurada: si la PC estuvo apagada y arranca a
 * las 14, el primer ciclo lo manda igual en vez de perder el día.
 *
 * @param {Date}   ahora
 * @param {number} horaConfig  hora a partir de la cual corresponde mandarlo
 * @param {string} diaEnviado  toDateString() del día en que ya salió, o ''
 */
function toca(ahora, horaConfig, diaEnviado) {
  if (ahora.getHours() < horaConfig) return false;
  return diaEnviado !== ahora.toDateString();
}

module.exports = {
  armar,
  deHoy,
  resultadosDeAyer,
  turnosDeAyer,
  senalDeTurno,
  entraEnElResumen,
  calor,
  toca,
  esComercial,
  senalesDeVenta,
  esTelefono,
  partir,
  LARGO_MENSAJE,
};
