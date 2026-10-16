Modelo: Sonnet 5.5 (advisor Opus 5.5) — sesión NUEVA

⚠ PROMPT EN PAUSA (16/10/2026): NO lo ejecutes. Se escribió para un solo precio de lista y la planilla real de Piedra tiene dos (EFECTIVO y PRECIO LISTA, según el medio de pago) y una regla de IVA sin cerrar. Si estás leyendo esto en una sesión, frená y avisale a Tomás. Se reescribe cuando conteste las preguntas de precios.

---
DELEGACIÓN Y PARALELIZACIÓN:
- Antes de empezar, evaluá qué partes de la tarea son independientes. Lo independiente va en paralelo; en secuencia, solo lo que depende de otro paso. Dos tareas que tocan los mismos archivos no van en paralelo.
- Si la tarea es chica (1 o 2 archivos, cambio puntual), NO delegues: hacelo directo.
- Para explorar el código usá el subagente `explorer` (Haiku), no el Explore integrado. Para documentación externa, `researcher` (Haiku). Lanzá varios en paralelo y pediles conclusiones, no volcados de archivos.
- Las partes independientes de la implementación van a agentes de Codex en paralelo con /codex:rescue --background (una tarea por agente, con instrucciones claras y archivos concretos). Seguí el progreso con /codex:status y traé los resultados con /codex:result.
- Si Codex no alcanza (límite de uso, error, o la tarea necesita mucho contexto del proyecto), usá el subagente `worker` (Sonnet).
- Si `explorer`, `researcher` o `worker` no están en `.claude/agents/`, anotalo y usá los subagentes integrados.
- Consultá al advisor (Opus) antes de comprometerte con un plan no trivial, cuando un error se repite y antes de dar la tarea por terminada. No lo uses para lo rutinario.
- Vos planificás, repartís, revisás e integrás. Nunca aceptes el trabajo de Codex o de un subagente sin revisarlo.
- Al terminar, usá /codex:review para una revisión rápida de los cambios.
---

# Motor de cotización de Somos Piedra (`src/cotizador-piedra.js`)

## Contexto
Esta tarea **toca plata**: consultá al advisor (Opus) antes de comprometerte con la forma de la API y antes de darla por terminada.

El bot de Piedra necesita un motor que calcule precios, igual que lo hace la app de ventas de Piedra (otro proyecto, `E:\vivero`, que se puede **leer** como referencia: `contexto\spec-piedra-v1.1.md` §2.1 a §2.4; no se modifica nada ahí). Las reglas de abajo son las de esa spec; si algo no coincide con lo que leas, mandan las de este prompt y lo anotás.

Regla heredada del sistema: **los montos no los produce la IA. Los calcula este código** a partir de una tabla de productos. Cuando falta un dato, el motor devuelve `FALTA DATO` y NO lo completa (nada de 0 por defecto, promedios ni estimaciones).

Antes de crear nada, confirmá que el directorio de trabajo es la carpeta de Piedra (`E:\bot-piedra` o, si todavía no se mudó, `C:\bot-whatsapp\bot-piedra`) y NO `C:\bot-whatsapp\bot-whatsapp` ni un `wt-*`; si no lo es, no crees nada y decilo.

Otra sesión puede estar moviendo archivos de `src/` y `test/` (la poda de iPhone). Ignorala: vos trabajás **solo** en `src/cotizador-piedra.js` y `test/cotizador-piedra.test.js` (archivos nuevos). No toques `package.json`: el registro del test lo hago yo en la integración. No requieras ningún otro módulo de `src/`.

## Qué construir
Módulo **puro**: sin red, sin disco, sin fechas ni azar, sin `require` de otros archivos del repo. Plata en **centavos enteros** (nunca `float`, `parseFloat`, `toFixed` ni `Math.round` sobre plata; usá aritmética entera, por ejemplo porcentajes en puntos básicos). Las cantidades (m²) también sin errores de coma flotante: `12 × 1,10` tiene que dar exactamente `13,20`.

### Datos de entrada (la tabla de productos la arma otro módulo después; acá se pasan objetos)
- `producto`: `{ nombre, unidadVenta: 'm2' | 'metro' | 'bolson' | 'kg' | 'unidad', coberturaM2 (m² que cubre una unidad; opcional), espesorRefCm (opcional), fraccionable (bool), monedaPrecio: 'ARS' | 'USD', precioListaCentavos (ARS) o precioUsdCentavos (USD), desperdicioPct (opcional) }`.
- `config`: `{ desperdicioPctNegocio (opcional), ivaPct (21), medios: { efectivo: { pct }, transferencia: { pct }, debito: { pct }, credito: { pct } }, planesCuotas: { '3': { recargoPct } } }`. Todo lo que falte es `FALTA DATO`.
- `cotizacionUsdCentavos` (centavos de peso por dólar): la carga el dueño una vez por día y la pasa quien llama. Sin cotización, un producto en USD devuelve `FALTA DATO` (nunca se usa una vieja sola).

### Reglas
1. **Precio de lista único** por producto. Si es USD: lista en pesos = USD × cotización.
2. **Forma de la venta** (tres, y el motor devuelve las que pidan):
   - `sin_factura`: cobra la lista. IVA 0.
   - `iva_incluido`: cobra la lista; neto = lista ÷ 1,21; IVA = lista − neto.
   - `iva_sumado`: cobra lista × 1,21; neto = lista; IVA = lista × 0,21.
3. **% por medio de pago** (negativo descuento, positivo recargo), se aplica sobre la lista **antes** del IVA. **Sin factura NO se aplica el descuento por efectivo o transferencia** y **no se aceptan tarjeta ni cuotas** (el motor devuelve error de dominio "medio no permitido sin factura"). Medios sin factura: efectivo, transferencia, dólares, cheque.
4. **Cuotas con tarjeta**: solo con factura. Recargo del plan sobre la lista; total y valor de cada cuota (la última absorbe el resto de centavos). Sin el plan cargado: `FALTA DATO`.
5. **Calculadora de m²**: m² pedidos + % de desperdicio (el del producto; si no tiene, el del negocio; si ninguno está cargado: `FALTA DATO`, nunca 0 por defecto — la decisión de usar 0 la toma quien configura). Luego:
   - producto en m² **fraccionable**: queda en m² con dos decimales (redondeá para arriba al centésimo);
   - producto por **unidad** (o bolsón/bolsa) con `coberturaM2`: unidades = m² con desperdicio ÷ cobertura, **redondeado siempre para arriba** a la unidad entera; devolver también los m² que cubre de verdad;
   - producto por unidad **sin** `coberturaM2`: `FALTA DATO`.
   - **Espesor** (granza y piedra suelta): `coberturaM2` es a `espesorRefCm`. Si se pide otro espesor, se escala linealmente: unidades = m² × (espesor pedido ÷ espesor de referencia) ÷ cobertura. **Supuesto a confirmar con Fran** (la granza: una bolsa de ~40 kg cubre 1 m² a 3 cm): anotalo en las decisiones y dejalo como parámetro, no escrito a fuego.
6. **Envío** es un servicio: `cotizarEnvio(zona, tablaEnvios)` devuelve el precio de la tabla o `FALTA DATO` si la zona no está o no hay tabla. Nunca inventa.
7. **Salida**: un objeto con `ok`, `faltaDato: []` (lista de los campos que faltan; si hay alguno, ningún monto sale), `error` de dominio si corresponde, y cuando todo está: unidades, m² cubiertos, lista en centavos, y para la forma pedida el total, neto e IVA. Todo en centavos enteros; un helper aparte los formatea para el cliente (`$528.000`).
8. **Fuera de alcance**: pago mixto, cheques, cajas, factura ARCA, stock. El bot informa precios, no cobra.

### Casos que tienen que dar exactamente esto (son de la spec; usá productos y porcentajes inventados, no precios reales de Piedra)
- m² fraccionable a $40.000/m²: 12 m² + 10 % → **13,20 m²** → **$528.000**.
- Baldosa por unidad, cobertura 0,16 m², $6.000 c/u: 12 m² + 10 % → 13,2 ÷ 0,16 = 82,5 → **83 baldosas = 13,28 m²** → **$498.000**.
- Lista $100.000: `sin_factura` cobra $100.000 (IVA 0); `iva_incluido` cobra $100.000 (neto $82.644,63, IVA $17.355,37); `iva_sumado` cobra **$121.000** (neto $100.000, IVA $21.000).
- Con factura, `iva_sumado`, lista $100.000, efectivo −10 %: $90.000 × 1,21 = **$108.900**.
- Con factura, `iva_incluido`, lista $100.000, 3 cuotas con +15 %: total $115.000, 3 cuotas de $38.333,33 / $38.333,33 / $38.333,34.
- USD: travertino US$30/m², cotización $1.450 → $43.500/m²; 10 m² → **$435.000** sin factura y **$526.350** con IVA sumado.
- Sin factura + tarjeta → error de dominio. Sin factura + efectivo −10 % → el descuento NO se aplica.
- Sin cotización con un producto en USD, sin cobertura en un producto por unidad, sin % del medio, sin plan de cuotas, sin desperdicio configurado: cada uno `FALTA DATO` con el nombre del campo, y **ningún monto** en la salida.
- Granza (cobertura 1 m² a 3 cm): 12 m² a 3 cm = 12 unidades; a 5 cm = 20; a 2 cm = 8 (desperdicio 0).
- Sin números flotantes en plata: un test que recorra el código fuente del módulo buscando `parseFloat`, `toFixed(` y `Math.round(` aplicados a plata, como control.

## Cómo
Primero los tests que fallan (`node test/cotizador-piedra.test.js`, estilo de los demás tests del repo: `assert`, sin dependencias), después el módulo. Armá la API (nombres y forma) con el advisor antes de escribir código y dejala documentada en un comentario de cabecera corto del módulo. No pongas precios reales de Piedra en ningún archivo.

## Reglas fijas
- No leer ni tocar `.env`, `.env.docker`, `credenciales.json` ni `docker-compose.yml`.
- No tocar `C:\bot-whatsapp\bot-whatsapp` (iPhone, en vivo) ni la instancia `somosiphone` de Evolution.
- No reiniciar Docker ni Evolution, no mandar mensajes y no prender ningún flag del `.env` de Piedra.
- Nada que cargue `src/state.js` sin un `ESTADO_PATH` temporal.
- Sin llamadas de verdad a Anthropic, Gemini, Google, Evolution ni Supabase: `fetch` y Evolution de mentira, planillas de prueba. La batería del cerebro la corre Tomás, porque gasta.
- Números de teléfono inventados (5490000000000).
- Primero el test que falla, después el arreglo. Al terminar, `npm test` (archivo por archivo si tarda) y `npm run evaluar -- --offline` al 100%.
- Buscar por texto, no por número de línea.
- Sin commit ni push. En esta tarea NO se toca `CLAUDE.md` (la poda de iPhone lo está moviendo): la sección "Cotizador de Piedra" va en el resumen, para que Claude la integre.
- La máquina: no tocar los ajustes de Antigravity ni de VS Code, no definir `CLAUDE_CONFIG_DIR` y no correr `claude auth login` ni `claude auth logout`. Si `claude` falla por la política de PowerShell, usar `claude.cmd`.
- Para esta tarea: solo los dos archivos nuevos de arriba y nada más. Si la poda de iPhone está en curso y `npm test` o `evaluar` fallan por eso, corré solo `node test/cotizador-piedra.test.js` y decí en el resumen que el resto lo verifico yo.

## PARA COPIAR Y PEGAR (al final)
1. **Resumen para Claude:** qué se creó, la API final (firmas y forma de la salida), los tests nuevos y cuáles fallaban antes, y el resultado de `node test/cotizador-piedra.test.js` (y de `npm test` y `evaluar` si se pudo). Incluí el texto de la sección "Cotizador de Piedra" para `CLAUDE.md` (hasta 15 líneas).
2. **Lo que tiene que correr Tomás:** `node test\cotizador-piedra.test.js` y qué tiene que decir.
3. **La prueba en vivo:** un comando `node -e "..."` que cotice, con productos inventados, los casos de arriba y muestre los montos ya calculados por el código, para que Tomás los compare con su cálculo a mano.
4. **El comando de commit en la rama** (nombre sugerido: `piedra/cotizador`), solo con los dos archivos.
5. **Decisiones que tomé solo** (redondeo de m², forma de la API, supuesto del espesor, lo que el advisor cambió).

---
SI TENÉS QUE ELEGIR (no estoy mirando la sesión):
- No me preguntes ni esperes respuesta: una pregunta frena la sesión hasta que yo vuelva.
- Tomá la opción recomendada (si no hay, la más conservadora que respete las reglas fijas), anotala con el porqué en una sección "Decisiones que tomé solo" del PARA COPIAR Y PEGAR, y seguí.
- Si algo no coincide con el código o con el prompt, anotalo en esa sección, seguí por el camino más conservador y no implementes lo que dependa de eso.
- Solo frená si la única salida rompe una regla fija: leer o tocar .env, tocar C:\bot-whatsapp\bot-whatsapp, reiniciar el bot, mandar mensajes, commit, push o borrar archivos.
---
