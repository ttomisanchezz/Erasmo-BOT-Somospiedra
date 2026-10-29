# Spec v1 — Simulador de piedra en fotos (Somos Piedra)

Estado: **borrador para aprobar** (23/10/2026). Lo cerrado sale del traspaso del 23/10 y de las respuestas de Fran (`reglas/respuestas-fran-2026-10-23-simulador-gestion.txt`, Parte A). Lo que falta decidir está en §12 con la opción recomendada primero.

## 1. Qué es y qué no
- El cliente manda por WhatsApp 1 o 2 fotos del lugar y el bot le devuelve **una imagen** de cómo quedaría la piedra elegida en la superficie elegida, con el rótulo "Simulación orientativa".
- Sale **integrado al bot desde el lanzamiento** y se prueba primero con el número tester (decisión de Tomás, 23/10).
- Superficies: frente, pared, piso, patio, quincho y jardín (granza) (decisión de Tomás, 23/10).
- **No mide:** los m² se piden aparte para cotizar. **No garantiza:** es una aproximación; no reemplaza el asesoramiento técnico (FS: regla final).
- **No cambia nada fuera de la superficie elegida:** ventanas, puertas, techo, muebles, proporciones y colores ajenos quedan idénticos (FS: 3). Se asegura por código (§5, paso 5), no confiando en la IA.

## 2. Flujo en el chat
1. **Disparador.** El cliente manda una foto del lugar, o pregunta cómo le quedaría. Sonnet ofrece mostrárselo. Si todavía no mandó foto, se la pide con los 2 mensajes de §3.
2. **¿La foto sirve?** Sonnet mira la foto (ya las ve: hasta 3 por tanda) y dice qué superficies hay y si sirve. No sirve si está oscura, movida, muy de costado, la superficie no se ve o es una imagen de internet. Si no sirve, pide otra **una sola vez**; si la segunda tampoco sirve, escala.
3. **Zona en palabras.** "¿Revestimos toda la pared del frente o solo la parte de abajo de la ventana?". Una sola zona por simulación.
4. **Piedra.** Si no la eligió, Sonnet asesora con las preguntas de las reglas (uso, estética, superficie) y ofrece solo piedras **simulables** (§6). Sin reglas rígidas de interior/exterior (FS: 4).
5. **Generar.** Sonnet llama a `simular_piedra` (§7). Mientras tanto, el bot muestra "escribiendo…" (no se manda "ya te lo armo": la guardia lo frena como promesa).
6. **Mandar y esperar.** Va la imagen con un texto corto: "Así quedaría con <piedra>. Es una simulación orientativa: el color y el tamaño reales pueden variar." / "¿Querés probar con otra piedra?". No se intenta cerrar (FS: 5).
7. **Después.** "Otra piedra": se repite desde el paso 4 sobre la misma foto y la misma zona (no hace falta otra máscara). Si le interesa: m² → `cotizar` → y si está listo para comprar, escala.

## 3. Lo que se le pide al cliente (2 mensajes, ≤ 300 caracteres)
> Para mostrarte cómo quedaría, mandame 1 o 2 fotos del lugar. Que sean de día y sin flash, de frente y a unos pasos, que se vea toda la pared o el piso. Sin filtros ni zoom, y si podés corré lo que tape.

> Si es un frente con varias partes o un patio grande, sumá otra foto desde otro ángulo.

## 4. Fotos de referencia de cada piedra
- 4 o 5 fotos por variedad y color (FS: 1), sacadas según `guia-fotos-piedra.md`: paño de frente, paño con cinta, detalle, pieza suelta con cinta, obra o paño a 45°.
- Al motor van **2 o 3**: el paño de frente siempre, más el detalle y, si es piso o jardín, el de 45°.
- Hasta tener las de Fran, la prueba A/B usa fotos provisorias de la web y el Instagram de Somos Piedra (solo para probar, nunca al cliente).

## 5. Cómo se arma la imagen (por pasos)
1. **Normalizar.** La foto del cliente se pasa a JPG, con la orientación corregida y el lado largo a 1.536 px.
2. **Máscara.** Se recorta la zona elegida (en palabras, del paso 3 de §2) con un modelo de segmentación: la máscara es una imagen blanco/negro del mismo tamaño. Control por código: si la zona ocupa menos del 3 % o más del 90 % de la foto, la máscara no sirve.
3. **Generar.** El motor elegido en la prueba A/B recibe la foto, la máscara (GPT Image la usa directo; a Gemini se le pasa como imagen e instrucción) y 2 o 3 referencias, con un prompt fijo que vive en el código: cambiar solo la zona marcada, misma perspectiva, luz y sombras, la piedra igual a la referencia (color, textura, tamaño de pieza, junta).
4. **Ajustar.** La imagen generada se lleva al tamaño exacto de la original.
5. **Pegar por código.** Se usa **solo lo que está dentro de la máscara** (borde suavizado de 2 o 3 px); el resto de los píxeles es la foto original, sin tocar.
6. **Controlar.** Sonnet compara original, resultado y referencia: ¿la piedra se parece a la de referencia?, ¿cubre la zona pedida?, ¿la perspectiva es creíble? Si falla, **1 reintento** (generación nueva). Si vuelve a fallar: si el problema es la foto, se pide otra una vez; si no, escala en silencio ("el simulador no pudo con esta foto").
7. **Rótulo.** El código estampa abajo "Simulación orientativa · Somos Piedra". La IA nunca escribe texto en la imagen.
8. **Guardar.** Original, máscara y resultado en `data/simulaciones/<id>/` (fuera de git).

## 6. Catálogo del simulador
- `data/piedras-simulador.json`: por piedra, el nombre exacto de la planilla, las rutas de las referencias y `aprobada: true` cuando Fran dio el OK a sus fotos.
- **Simulable** = aprobada y con al menos 4 referencias. Sonnet solo ofrece simulables; si el cliente pide una que no lo es, se lo dice ("de esa todavía no tengo para mostrarte") y sigue con la cotización normal.
- Granza: se simula en piso o jardín como cualquier otra; las fotos de referencia son las de la guía (capa de 3 cm y puñado en la mano).

## 7. La herramienta del cerebro
- `simular_piedra({ foto, zona, piedra })`:
  - `foto`: cuál de las fotos del chat (las referencia el contexto; nunca una ruta que escriba Sonnet);
  - `zona`: la descripción en palabras confirmada con el cliente;
  - `piedra`: el id de `piedras-simulador.json`.
- Devuelve `{ ok: true, imagen: <id> }` o `{ ok: false, motivo }` con un motivo de una lista cerrada: `foto_no_sirve`, `zona_no_encontrada`, `piedra_no_simulable`, `fallo_motor`, `tope`.
- `responder` suma un campo opcional `imagen` que solo acepta un id devuelto por `simular_piedra` **en esta misma respuesta** (igual que los montos con `turno.montos`). La guardia deja pasar "así quedaría" con esa imagen y sigue frenando cualquier otra promesa de archivo.

## 8. Mandar archivos: la excepción al candado
- Hoy `evolution.js` solo manda imágenes de la carpeta del catálogo y documentos de `DOCS_DIR` (heredado de iPhone). Se suma una carpeta propia del bot, `data/generados/`, con nombres que pone el código (id al azar) y extensiones `.jpg` y `.pdf`.
- Se manda solo si el id figura en el registro de lo generado en las últimas 24 h para **ese mismo chat**. Un texto nunca manda un archivo; un archivo de otro chat, tampoco.
- La misma excepción la usa `presupuesto_pdf` (decisión de Tomás, 23/10).
- Vale todo lo de salida de siempre: escucha, borrador (al grupo va la imagen con "borrador"), listas tester y piloto, `leLlegaAlCliente`.

## 9. Topes y costos
- Por chat: hasta **3 simulaciones cada 24 h** (la primera + 2 "otra piedra") (§12).
- Por mes: `SIMULADOR_TOPE_MES_USD`; al 80 % avisa al grupo, al 100 % la herramienta devuelve `tope` y el bot sigue sin simulador (§12).
- Costo estimado por simulación (23/10, se mide en la prueba): motor ~USD 0,06–0,07 + máscara ~USD 0,005 + control de Sonnet ~USD 0,01 ≈ **USD 0,08**; con 1 reintento cada 5, ~USD 0,09. Con 300 por mes, **~USD 27**.
- El gasto va al mismo registro del día y del mes que el cerebro.

## 10. Medir
- En el registro de aprendizaje, por simulación: motor, tiempo, costo, si hubo reintento, el motivo si falló.
- Al chat se le marca `simulo: true`; con `#vendido` / `#perdido` sale cuántas simulaciones terminan en venta (y por anuncio, con lo del último commit).

## 11. Fases
| Fase | Qué | Sale |
|---|---|---|
| **F0 · Prueba A/B** | Script en `herramientas/simulador/` (rama `piedra/simulador`): 10 fotos de clientes × 2 motores (Nano Banana 2 `gemini-3.1-flash-image` y GPT Image 2 medium), misma máscara y mismas referencias, con el pegado por código. Página HTML lado a lado con tiempo y costo; Tomás puntúa de 1 a 5 cada una. Mide también qué tan bien recorta la máscara. ~USD 2 | El motor elegido y la calidad real |
| **F1 · Módulo** | `src/simulador/` (normalizar, máscara, motor, pegar, rótulo, control) con tests y motores de mentira, sin red | El simulador, probado |
| **F2 · Integración** | `simular_piedra` en el cerebro, campo `imagen` en `responder`, guardia, excepción del candado, topes | El bot lo usa |
| **F3 · Tester** | Con el número tester y las fotos de Fran | Listo para salir con el bot |

**Criterio para elegir el motor (F0):** gana el de mejor puntaje promedio; si la diferencia es de menos de 0,5 puntos, Nano Banana 2 (más rápido y Gemini ya está en el bot). Si los dos promedian menos de 3, no se sigue a F1 sin hablarlo.

## 12. Para decidir (Tomás)
1. **Tope por chat:** A) 3 cada 24 h (recomendado) · B) 5 · C) sin tope.
2. **Tope del mes:** A) USD 30 (recomendado; ~350 simulaciones) · B) USD 50 · C) USD 15.
3. **Cuándo se ofrece:** A) cuando manda la foto del lugar o pregunta cómo quedaría (recomendado) · B) también se ofrece a todo el que pregunta por revestimiento.
4. **Cuánto se guardan las fotos del cliente:** A) 30 días y se borran solas (recomendado; para borrar hace falta tu OK, una vez) · B) para siempre (sirven para anuncios, pero hace falta el permiso del cliente) · C) 7 días.
5. **Modelo de la máscara:** A) Gemini (segmentación con la misma clave; recomendado) · B) SAM 2 por Replicate (otra clave, ~USD 0,002). Se confirma en F0.
6. **Dependencia nueva:** `sharp` (para recortar, pegar y rotular) y el SDK de OpenAI si gana GPT. Sin `sharp` no se puede pegar por código.

## 13. Qué hace falta para arrancar
- **Tomás:** `OPENAI_API_KEY` y `GEMINI_IMAGEN_API_KEY` en el `.env` (proyecto con facturación) y 5 a 10 fotos de clientes en `fotos/prueba-ab/` → F0.
- **Fran:** las 4 o 5 fotos de cada piedra (`guia-fotos-piedra.md`) → F3.
- **Tomás:** aprobar esta spec y las decisiones de §12 → F1.
