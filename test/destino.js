'use strict';
/**
 * ¿A dónde van a parar los avisos y el resumen?
 *
 *   npm run destino            muestra el destino y si los avisos pueden salir
 *   npm run destino -- probar  manda un mensaje de prueba a ese destino
 *
 * Existe porque un destino mal cargado manda datos de clientes a un tercero.
 *
 * Le pregunta a las MISMAS funciones que deciden en producción
 * (`motivoBloqueoAvisos`, `RE_GRUPO`, `destinoEsUnCliente`), nunca a una copia
 * de la regla. Ya pasó que este comando dijera "es seguro, probá" sobre un
 * canal que en realidad estaba tapado: decir que está todo bien sobre un canal
 * que no manda es peor que no decir nada.
 *
 * Lee el estado REAL (para saber si el destino es un chat de cliente), y solo
 * lo lee: con ESTADO_SOLO_LECTURA no escribe nunca, ni al salir (bloque 4).
 */
process.env.ESTADO_SOLO_LECTURA = '1';
const config = require('../src/config');
const evolution = require('../src/evolution');
const state = require('../src/state');

const PROBAR = process.argv.includes('probar');

/**
 * El JID nunca se imprime entero: alcanza con poder reconocerlo. Se dejan los
 * primeros 3 y los últimos 2 caracteres, que es suficiente para distinguir un
 * destino de otro sin dejar el número completo en la consola o en una captura.
 */
function enmascarar(jid) {
  const corte = jid.indexOf('@');
  const local = corte === -1 ? jid : jid.slice(0, corte);
  const dominio = corte === -1 ? '' : jid.slice(corte);
  if (local.length <= 5) return 'X'.repeat(local.length) + dominio;
  return local.slice(0, 3) + 'X'.repeat(local.length - 5) + local.slice(-2) + dominio;
}

/** Los pasos para sacar el JID del grupo interno sin pelear con la API. */
function comoSacarElJidDelGrupo() {
  console.log('     Solo se admiten grupos. Para sacar el JID del grupo interno:');
  console.log('       1. Creá el grupo de WhatsApp y sumá al número del bot.');
  console.log('       2. Que cualquiera de ustedes escriba algo adentro del grupo.');
  console.log('       3. En el log del bot va a salir una línea: [grupo] <jid>@g.us');
  console.log('       4. Copiá ese JID en GRUPO_AVISOS_JID (.env) y reiniciá el bot.');
}

(async () => {
  const jid = config.grupoAvisos;
  console.log('');

  if (!jid) {
    console.log('  GRUPO_AVISOS_JID está VACÍO.');
    console.log('  Los avisos y el resumen salen por consola, no por WhatsApp.');
    console.log('');
    comoSacarElJidDelGrupo();
    console.log('');
    return;
  }

  // La misma regex que usa evolution.js para decidir, importada de ahí.
  const esGrupo = evolution.RE_GRUPO.test(jid);
  const esCliente = evolution.destinoEsUnCliente(jid);
  const chat = state.todos()[jid];
  const motivo = evolution.motivoBloqueoAvisos();

  console.log('  Destino configurado : ' + enmascarar(jid));
  console.log('  Tipo                : ' + (esGrupo ? 'GRUPO interno ✓' : 'NO es un grupo de WhatsApp'));

  if (esCliente) {
    console.log('');
    console.log('  🚨 PELIGRO: ese número es un CLIENTE.');
    if (chat && chat.nombre) console.log('     Aparece como: ' + chat.nombre);
    console.log('     El bot NO le va a mandar nada: la guardia lo frena.');
    console.log('     Corregí GRUPO_AVISOS_JID en el .env antes de seguir.');
    console.log('');
    return;
  }

  console.log('  ¿Es un cliente?     : no ✓');

  // Una lista de prueba olvidada deja al bot mudo con los clientes reales y
  // desde afuera parece que anda. Este comando tiene que gritarlo.
  const testers = config.numerosTester.length;
  const pilotos = config.numerosPiloto.length;
  if (config.pilotoTodos) {
    console.log('');
    console.log(`  EN VIVO PARA TODOS (NUMEROS_PILOTO=todos). Tester: ${testers}.`);
  } else if (testers || pilotos) {
    const cuantos = (n) => `${n} numero${n === 1 ? '' : 's'}`;
    console.log('');
    console.log(`  ⚠️  LISTAS DE PRUEBA ACTIVAS: el bot solo le escribe al tester (${cuantos(testers)}) y al piloto (${cuantos(pilotos)}).`);
    console.log('     A cualquier otro cliente lo trata como MODO_BORRADOR:');
    console.log('     no recibe nada y el borrador se manda a este grupo.');
    console.log('     Vaciá NUMEROS_TESTER y NUMEROS_PILOTO en el .env para volver a lo normal.');
    if (config.numerosPruebaViejo) console.log('     NUMEROS_PRUEBA quedó viejo, pasalo a NUMEROS_TESTER.');
  }

  // Esto es lo que de verdad decide si sale un aviso. Si habla, manda esto:
  // no alcanza con que el destino no sea un cliente conocido.
  if (motivo) {
    console.log('');
    console.log('  ⛔ LOS AVISOS NO VAN A SALIR.');
    console.log('     Motivo: ' + motivo);
    console.log('');
    console.log('     Los borradores de MODO_BORRADOR, los avisos de lead y el');
    console.log('     resumen de la mañana quedan solo en el log de la consola.');
    console.log('');
    if (!esGrupo) comoSacarElJidDelGrupo();
    if (config.modoEscucha) {
      console.log('     MODO_ESCUCHA=true: el bot no manda nada, ni al grupo ni a');
      console.log('     los clientes. Es a propósito, pero tenelo presente.');
    }
    console.log('');
    // A propósito no se ofrece `npm run destino -- probar`: una prueba que no
    // puede salir solo sirve para volver a creer que el canal funciona.
    return;
  }

  console.log('  Avisos              : habilitados ✓');
  console.log('  Resumen de la mañana: ' + (config.resumen.activo
    ? `ACTIVO, sale ${String(config.resumen.hora).padStart(2, '0')}:00`
    : 'apagado (RESUMEN_ACTIVO=true para encenderlo)'));
  console.log('');

  if (!PROBAR) {
    console.log('  Para mandar un mensaje de prueba a ese destino:');
    console.log('    npm run destino -- probar');
    console.log('');
    return;
  }

  console.log('  Mandando mensaje de prueba...');
  try {
    const r = await evolution.avisarGrupo(
      '🔧 Prueba del bot de Somos Piedra. Si ves esto, los avisos llegan bien.'
    );
    // `avisarGrupo` no tira excepción cuando frena: devuelve {bloqueado, motivo},
    // o `undefined` si cortó por destino vacío o por chat de cliente. Nunca se
    // reporta éxito sin haber mirado qué devolvió.
    if (!r) {
      console.log('  NO SALIÓ: la guardia cortó antes de mandar.');
      console.log('  Revisá GRUPO_AVISOS_JID en el .env.');
    } else if (r.bloqueado) {
      console.log('  NO SALIÓ. Lo frenó la guardia: ' + r.motivo);
    } else {
      console.log('  Salió sin error de la API.');
      console.log('  Confirmá a ojo que llegó al destino correcto.');
    }
  } catch (e) {
    console.log('  NO SALIÓ: ' + e.message);
  }
  console.log('');
})();
