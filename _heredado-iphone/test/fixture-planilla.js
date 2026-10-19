'use strict';
/**
 * Copia congelada de la planilla al 8 de septiembre de 2026.
 * Sirve SOLO para probar el bot sin credenciales de Google.
 * Los precios reales salen siempre de la planilla en vivo.
 */
module.exports = {
  config: {
    coef1: 1.26,
    coef2: 1.35,
    redondeo: 1000,
    umbralExcepcionPesos: 50000,
    umbralExcepcionPct: 10,
    estadoLista: 'VIGENTE',
    fechaUltimaLista: '08/09/2026',
  },
  lista: [
    // Los ID (01/10/2026) son de prueba, para mezclar con la pestaña `LISTA 85-93` de abajo:
    // no son los de la planilla real.
    m('N-001', 'iPhone 13', 128, 'Usado', 100, 495000, 320000, 221000, 140000),
    m('N-002', 'iPhone 13 Pro', 128, 'Usado', 100, 695000, 420000, 0, 0),
    m('N-003', 'iPhone 14', 128, 'Usado', 80, 540000, 360000, 303000, 162000),
    m('N-004', 'iPhone 14 Pro', 128, 'Usado', 100, 800000, 480000, 442000, 240000),
    m('N-005', 'iPhone 15', 128, 'Usado', 85, 740000, 420000, 405000, 216000),
    m('N-006', 'iPhone 15 Pro', 128, 'Usado', 85, 920000, 530000, 495000, 265000),
    m('N-007', 'iPhone 16', 128, 'Usado', 85, 1050000, 670000, 480000, 258000),
    m('N-008', 'iPhone 16 Pro', 128, 'Usado', 90, 1200000, 770000, 545000, 293000),
    m('N-009', 'iPhone 17', 128, 'Sellado', 0, 1600000, 920000, 857000, 459000),
    m('N-0010', 'iPhone 17 Pro', 128, 'Sellado', 0, 1970000, 1200000, 972000, 520000),
    m('N-0011', 'iPhone 17 Pro Max', 128, 'Sellado', 0, 2200000, 1600000, 758000, 405000),
  ],
  // Otras pestañas con la forma de LISTA (01/10/2026, `#bateria`): solo se usan si están
  // activas. De prueba: el 13 y el 14 con otro precio y batería 85-93, y un 14 Plus que solo
  // está acá. No hay ningún sellado, como en la planilla real.
  pestanas: {
    'LISTA 85-93': [
      { ...m('N-001', 'iPhone 13', 128, 'Usado', 85, 450000, 290000, 0, 0), bateria_texto: '85-93' },
      { ...m('N-003', 'iPhone 14', 128, 'Usado', 85, 500000, 330000, 0, 0), bateria_texto: '85-93' },
      { ...m('N-0099', 'iPhone 14 Plus', 128, 'Usado', 85, 620000, 400000, 0, 0), bateria_texto: '85-93' },
    ],
  },
  usados: [
    {
      origen: 'USADOS',
      id: 'U-001',
      modelo: 'iPhone 12',
      capacidad_gb: 64,
      color: 'Blanco',
      bateria_min: 87,
      detalles: 'Micro rayon en marco',
      precio_contado: 380000,
      anticipo_min: 250000,
      // Desde el 30/09/2026 USADOS no tiene precios manuales (sheets.js): en la planilla del
      // 08/09 eran 164.000 y 88.000, fórmulas de 1,26 y 1,35.
      pago_unico_manual: 0,
      cuota_2_manual: 0,
      cotizable: true,
    },
    // --- Unidades puntuales que conviven con una fila de LISTA ---
    // El 14 también está en LISTA a 540.000: esta unidad es más barata y entra
    // como opción de liquidación, no la reemplaza.
    {
      origen: 'USADOS',
      id: 'U-002',
      modelo: 'iPhone 14',
      capacidad_gb: 128,
      color: 'Gris',
      bateria_min: 86,
      detalles: 'Sin Face ID',
      precio_contado: 430000,
      anticipo_min: 290000,
      pago_unico_manual: 0,
      cuota_2_manual: 0,
      cotizable: true,
    },
    // El 15 también está en LISTA a 740.000, pero esta unidad NO está
    // disponible: no puede tapar la fila de catálogo ni hacer escalar.
    {
      origen: 'USADOS',
      id: 'U-003',
      modelo: 'iPhone 15',
      capacidad_gb: 128,
      color: 'Negro',
      bateria_min: 79,
      detalles: 'Reservado',
      precio_contado: 600000,
      anticipo_min: 400000,
      pago_unico_manual: 0,
      cuota_2_manual: 0,
      cotizable: false,
    },
    // El 11 no está en LISTA: dos unidades sueltas a precios distintos.
    {
      origen: 'USADOS',
      id: 'U-004',
      modelo: 'iPhone 11',
      capacidad_gb: 64,
      color: 'Negro',
      bateria_min: 84,
      detalles: 'Marco marcado',
      precio_contado: 260000,
      anticipo_min: 170000,
      pago_unico_manual: 0,
      cuota_2_manual: 0,
      cotizable: true,
    },
    {
      origen: 'USADOS',
      id: 'U-005',
      modelo: 'iPhone 11',
      capacidad_gb: 128,
      color: 'Verde',
      bateria_min: 91,
      detalles: '',
      precio_contado: 310000,
      anticipo_min: 200000,
      pago_unico_manual: 0,
      cuota_2_manual: 0,
      cotizable: true,
    },
    // Quinta unidad disponible: con esta el bloque de liquidación queda
    // exactamente en el tope, que es lo que prueba el caso de las 5 justas.
    {
      origen: 'USADOS',
      id: 'U-006',
      modelo: 'iPhone XR',
      capacidad_gb: 128,
      color: 'Rojo',
      bateria_min: 88,
      detalles: '',
      precio_contado: 290000,
      anticipo_min: 190000,
      pago_unico_manual: 0,
      cuota_2_manual: 0,
      cotizable: true,
    },
  ],
};

function m(id, modelo, gb, condicion, bat, contado, minimo, pagoUnico, cuota2) {
  return {
    origen: 'LISTA',
    id,
    modelo,
    capacidad_gb: gb,
    condicion,
    bateria_min: bat,
    precio_contado: contado,
    anticipo_min: minimo,
    pago_unico_manual: pagoUnico,
    cuota_2_manual: cuota2,
    cotizable: true,
    notas: '',
  };
}
