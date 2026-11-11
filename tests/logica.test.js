'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarApp } = require('./cargar-app');

test('fecha de España: cambia de día a las 00:00 hora española, no a las 00:00 UTC', () => {
  const { ctx, ev } = cargarApp();
  const RealDate = Date;
  const conHora = iso => { ctx.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [iso])); } static now() { return new RealDate(iso).getTime(); } }; };
  const casos = [
    ['2026-11-11T23:30:00Z', '2026-11-12'], // invierno (UTC+1): ya es el día siguiente
    ['2026-11-11T22:59:00Z', '2026-11-11'],
    ['2026-07-11T22:30:00Z', '2026-07-12'], // verano (UTC+2)
    ['2026-07-11T21:59:00Z', '2026-07-11'],
    ['2026-12-31T23:30:00Z', '2027-01-01'], // Nochevieja
  ];
  for (const [iso, esperado] of casos) { conHora(iso); assert.equal(ev('today()'), esperado, iso); }
  conHora('2026-11-11T23:30:00Z'); assert.equal(ev('anioHoy()'), 2026);
  assert.match(ev('fechaHora(Date.UTC(2026, 10, 11, 23, 30))'), /0:30/);
});

test('sumarMeses respeta el fin de mes y los años bisiestos', () => {
  const { ev } = cargarApp();
  assert.equal(ev("sumarMeses('2026-01-31', 1)"), '2026-02-28');
  assert.equal(ev("sumarMeses('2026-08-31', 6)"), '2027-02-28');
  assert.equal(ev("sumarMeses('2028-02-29', 12)"), '2029-02-28');
  assert.equal(ev("sumarMeses('2026-12-15', 2)"), '2027-02-15');
  assert.equal(ev("sumarMeses('2026-10-01', 12)"), '2027-10-01');
});

test('vencimientos: vacunas a 12 meses; desparasitaciones sin aviso hasta configurarlas', () => {
  const { ev } = cargarApp();
  assert.equal(ev("vencimiento({ tipo: 'paramixovirus', fecha: '2026-03-10' })"), '2027-03-10');
  assert.equal(ev("vencimiento({ tipo: 'interna', fecha: '2026-03-10' })"), null);
  assert.equal(ev("vencimiento({ tipo: 'otro', fecha: '2026-03-10' })"), null);
  const c = cargarApp({ localStorage: { sanidadFrecuencia: '{"interna":6,"paramixovirus":0}' } });
  assert.equal(c.ev("vencimiento({ tipo: 'interna', fecha: '2026-03-10' })"), '2026-09-10');
  assert.equal(c.ev("vencimiento({ tipo: 'paramixovirus', fecha: '2026-03-10' })"), null);
});

test('avisos de vacunas: vencidas y próximas, solo palomos del palomar con el tratamiento apuntado', () => {
  const { ev } = cargarApp();
  ev(`
    const T = (id, tipo, fecha, extra) => ({ id, tipo, fecha, modificado: 1, ...extra });
    const hoy = today();
    state.palomos.set('a', { id: 'a', nombre: 'Vencida', estado: 'palomar', tratamientos: [T('1', 'paramixovirus', sumarMeses(hoy, -13))] });
    state.palomos.set('b', { id: 'b', nombre: 'Pronto', estado: 'palomar', tratamientos: [T('2', 'paramixovirus', sumarMeses(hoy, -12))] });
    state.palomos.set('c', { id: 'c', nombre: 'AlDia', estado: 'palomar', tratamientos: [T('3', 'paramixovirus', sumarMeses(hoy, -2))] });
    state.palomos.set('d', { id: 'd', nombre: 'Historico', estado: 'historico', tratamientos: [T('4', 'paramixovirus', sumarMeses(hoy, -20))] });
    state.palomos.set('e', { id: 'e', nombre: 'SinNada', estado: 'palomar' });
    state.palomos.set('f', { id: 'f', nombre: 'Borrado', estado: 'palomar', tratamientos: [T('5', 'paramixovirus', sumarMeses(hoy, -20), { borrado: true })] });
  `);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(avisosVacunas().map(a => a.p.nombre))')), ['Vencida', 'Pronto']);
  assert.equal(ev("estadoVacuna(state.palomos.get('a'), 'paramixovirus')[0]"), 'venc');
  assert.equal(ev("estadoVacuna(state.palomos.get('c'), 'paramixovirus')[0]"), 'ok');
  assert.equal(ev("estadoVacuna(state.palomos.get('e'), 'paramixovirus')[0]"), 'sin');
  assert.equal(ev("estadoVacuna(state.palomos.get('f'), 'paramixovirus')[0]"), 'sin'); // un tratamiento borrado no cuenta
});

test('fusionar tratamientos: se conservan los de los dos lados y gana el cambiado más tarde', () => {
  const { ev } = cargarApp();
  const r = JSON.parse(ev(`JSON.stringify(fusionarTratos(
    [{ id: 't1', notas: 'local', modificado: 5 }, { id: 't2', modificado: 1 }],
    [{ id: 't1', notas: 'nube', modificado: 9 }, { id: 't3', modificado: 2 }]))`));
  assert.deepEqual(r.map(t => t.id).sort(), ['t1', 't2', 't3']);
  assert.equal(r.find(t => t.id === 't1').notas, 'nube');
  // un borrado más reciente no resucita
  const b = JSON.parse(ev("JSON.stringify(fusionarTratos([{ id: 't1', modificado: 3 }], [{ id: 't1', borrado: true, modificado: 8 }]))"));
  assert.equal(b[0].borrado, true);
  assert.equal(ev('fusionarTratos(undefined, undefined).length'), 0);
});

test('contraseñas: mínimo 8, letras y número, nada obvio', () => {
  const { ev } = cargarApp();
  assert.match(ev("validarClave('abc1', '')"), /8 caracteres/);
  assert.match(ev("validarClave('sololetras', '')"), /número/);
  assert.match(ev("validarClave('12345678', '')"), /letras/);
  assert.match(ev("validarClave('Password1', '')"), /fácil/);
  assert.match(ev("validarClave('ana2026xx', 'ANA2026XX')"), /fácil/);
  assert.equal(ev("validarClave('Palomar2026', 'ana@test.com')"), '');
});

test('mensajes de error de acceso, en español', () => {
  const { ev } = cargarApp();
  assert.match(ev("mensajeError({ message: 'Invalid login credentials' })"), /correo o la contraseña/);
  assert.match(ev("mensajeError({ message: 'Token has expired or is invalid' })"), /código/);
  assert.match(ev("mensajeError({ message: 'For security purposes, you can only request this after 49 seconds' })"), /minuto/);
  assert.match(ev("mensajeError({ message: 'Failed to fetch' })"), /conexión/);
  assert.match(ev("mensajeError({ message: 'New password should be different from the old password.' })"), /distinta/);
});

test('copias: el nombre sigue el patrón que la rotación se atreve a borrar', () => {
  const { ev } = cargarApp();
  assert.match(ev('nombreCopia(true)'), /^colombaire-copia-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  assert.match(ev('nombreCopia(false)'), /^colombaire-copia-\d{4}-\d{2}-\d{2}\.json$/);
  for (const n of ['colombaire-copia-2026-11-11.json', 'colombaire-copia-2026-11-11-0930.json', 'mi-palomar-copia-2026-11-11.json']) assert.equal(ev(`RE_COPIA.test('${n}')`), true, n);
  for (const n of ['notas.txt', 'colombaire-copia-privada.json', 'colombaire-copia-2026-11-11.json.bak', 'otra-colombaire-copia-2026-11-11.json']) assert.equal(ev(`RE_COPIA.test('${n}')`), false, n);
});

test('parentesco: hermanos dan 25 %, sin relación 0', () => {
  const { ev } = cargarApp();
  ev(`
    const P = (id, sexo, padreId, madreId) => state.palomos.set(id, { id, nombre: id, sexo, padreId, madreId, estado: 'palomar' });
    P('padre', 'M'); P('madre', 'H'); P('h1', 'M', 'padre', 'madre'); P('h2', 'H', 'padre', 'madre'); P('otro', 'M');
  `);
  assert.equal(ev("kinship('h1', 'h2')"), 0.25);
  assert.equal(ev("kinship('h1', 'otro')"), 0);
  assert.equal(ev("kinship('padre', 'h1')"), 0.25); // padre e hijo
});

test('lector de Google Lens: anilla, color, padres y año aunque el texto venga mal leído', () => {
  const { ev } = cargarApp();
  const texto = 'LIBRO REGISTRO DE PALOMOS\\nNombre: Rayo  Anilla: AJ 14O9O9  Color: R0jo\\nPadre: Trueno Madre: Luna Fecha nacimiento 12/05/2019';
  const r = JSON.parse(ev(`JSON.stringify(parsearTextoLibreta('${texto}', ['Rayo', 'Trueno', 'Luna']))`));
  assert.equal(r.length, 1);
  assert.equal(r[0].anilla, 'AJ 140909');
  assert.equal(r[0].plumaje, 'Rojo');
  assert.equal(r[0].nombre, 'Rayo');
  assert.equal(r[0].padre, 'Trueno');
  assert.equal(r[0].madre, 'Luna');
  assert.equal(r[0].anio, 2019);
});

test('hojas desde archivo: se rechaza lo que no sea de Colombaire', () => {
  const { ev } = cargarApp();
  ev('window.__avisos = []; toast = m => window.__avisos.push(m);');
  ev("cargarHojasDesdeArchivo({ app: 'otra-cosa', palomos: [] })");
  ev('cargarHojasDesdeArchivo(null)');
  assert.equal(ev('window.__avisos.length'), 2);
  assert.equal(ev('lectura.palomos.length'), 0);
});

test('Por completar: detecta lo que falta sin inventar nada', () => {
  const { ev } = cargarApp();
  ev(`
    state.palomos.set('a', { id: 'a', nombre: 'Completo', anilla: 'X 1', plumaje: 'Rojo', anio: 2020, padreId: 'p', madreId: 'm', estado: 'palomar' });
    state.palomos.set('b', { id: 'b', nombre: 'Incompleto', estado: 'palomar' });
    state.palomos.set('r', { id: 'r', nombre: 'Referencia', estado: 'referencia' });
    state.resultados.set('1', { id: '1', palomoId: 'a', prueba: 'Comarcal', anio: 2024 });
  `);
  const g = JSON.parse(ev("JSON.stringify(datosPorCompletar().map(([t, l]) => [t, l.map(x => x.id)]))"));
  const d = Object.fromEntries(g);
  assert.deepEqual(d['Sin año de nacimiento'], ['b']);
  assert.deepEqual(d['Sin anilla'], ['b']);
  assert.deepEqual(d['Resultados sin puesto'], ['1']);
  assert.ok(!JSON.stringify(g).includes('"r"')); // los palomos «solo pedigrí» no se reclaman
});
