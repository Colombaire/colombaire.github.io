'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cargarApp } = require('./cargar-app');

// Base de datos de mentira: solo hace falta que las transacciones terminen.
const BD_FALSA = `db = { transaction() { const t = { objectStore: () => ({ put() {}, delete() {}, clear() {} }) };
  Object.defineProperty(t, 'oncomplete', { set(f) { setTimeout(f, 0); } }); return t; } };`;
function conPalomos() {
  const app = cargarApp();
  app.ev(BD_FALSA);
  app.ev(`state.palomos.set('m1', { id: 'm1', nombre: 'Lucero', sexo: 'M' }); state.palomos.set('h1', { id: 'h1', nombre: 'Estrella', sexo: 'H' });`);
  return app;
}

test('cría: fechas y eclosión esperada (18 días desde el segundo huevo; sin él, 2 días tras el primero)', () => {
  const { ev } = cargarApp();
  assert.equal(ev(`sumarDias('2026-02-27', 3)`), '2026-03-02');
  assert.equal(ev(`sumarDias('2026-12-30', 3)`), '2027-01-02');
  assert.equal(ev(`eclosionEsperada({ fecha1: '2026-03-01', fecha2: '2026-03-03' })`), '2026-03-21');
  assert.equal(ev(`eclosionEsperada({ fecha1: '2026-03-01' })`), '2026-03-21');
  assert.equal(ev(`eclosionEsperada({})`), '');
  assert.equal(ev(`eclosionEsperada({ fecha1: 'no es fecha' })`), '');
});

test('cría: el plazo de incubación se puede cambiar', () => {
  const { ev } = cargarApp({ localStorage: { criaIncubacion: '17' } });
  assert.equal(ev(`eclosionEsperada({ fecha1: '2026-03-01', fecha2: '2026-03-03' })`), '2026-03-20');
});

test('cría: fases de una nidada', () => {
  const { ev } = cargarApp();
  const f = (n, hoy) => ev(`faseNidada(${JSON.stringify(n)}, '${hoy}')`);
  const base = { fecha1: '2026-03-01', huevos: [], pichones: [] }; // eclosión esperada el 21/03
  assert.equal(f(base, '2026-03-10'), 'incubando');
  assert.equal(f(base, '2026-03-28'), 'incubando'); // una semana de margen
  assert.equal(f(base, '2026-03-29'), 'cerrada');
  assert.equal(f({ ...base, huevos: [{ id: 'a', estado: 'claro' }, { id: 'b', estado: 'roto' }] }, '2026-03-10'), 'cerrada');
  assert.equal(f({ ...base, huevos: [{ id: 'a', estado: 'claro' }, { id: 'b', estado: '' }] }, '2026-03-10'), 'incubando');
  assert.equal(f({ ...base, pichones: [{ id: 'p', estado: 'vivo' }] }, '2026-03-30'), 'criando');
  assert.equal(f({ ...base, pichones: [{ id: 'p', estado: 'muerto' }] }, '2026-03-30'), 'cerrada');
  assert.equal(f({ huevos: [], pichones: [] }, '2026-03-10'), 'sinfecha');
});

test('cría: avisos de eclosión próxima y de pichones por anillar', () => {
  const { ev } = cargarApp();
  ev(`state.nidadas.set('n1', { id: 'n1', machoId: 'm1', hembraId: 'h1', fecha1: '2026-03-01', huevos: [], pichones: [] });
      state.nidadas.set('n2', { id: 'n2', machoId: 'm1', hembraId: 'h1', fecha1: '2026-04-20', huevos: [], pichones: [] });
      state.nidadas.set('n3', { id: 'n3', machoId: 'm1', hembraId: 'h1', fecha1: '2026-01-01', huevos: [],
        pichones: [{ id: 'a', nacimiento: '2026-03-20', anilla: '', estado: 'vivo' }, { id: 'b', nacimiento: '2026-03-20', anilla: 'X1', estado: 'vivo' }, { id: 'c', nacimiento: '2026-03-20', anilla: '', estado: 'muerto' }] });`);
  const av = JSON.parse(ev(`JSON.stringify(avisosCria('2026-03-19').map(a => ({ t: a.tipo, n: a.n.id, d: a.dias })))`));
  assert.deepEqual(av, [{ t: 'eclosion', n: 'n1', d: 2 }]); // n2 está lejos; en n3 los pichones aún no tienen la edad de anillar
  const av2 = JSON.parse(ev(`JSON.stringify(avisosCria('2026-03-29').map(a => ({ t: a.tipo, n: a.n.id, h: a.h && a.h.id })))`));
  assert.deepEqual(av2, [{ t: 'anillar', n: 'n3', h: 'a' }]); // solo el vivo y sin anilla; n1 ya pasó su semana de margen
  assert.match(ev(`textoAvisoCria({ tipo: 'eclosion', fecha: '2026-03-21', dias: 2 })`), /21\/03\/2026 \(en 2 días\)/);
});

test('cría: crear la ficha de un pichón le pone padre y madre y lo enlaza en la nidada', async () => {
  const { ev } = conPalomos();
  ev(`state.nidadas.set('n1', { id: 'n1', machoId: 'm1', hembraId: 'h1', fecha1: '2026-03-01', huevos: [], pichones: [{ id: 'a', nacimiento: '2026-03-21', anilla: 'AJ 1', sexo: 'H', estado: 'vivo' }, { id: 'b', nacimiento: '2026-03-21', anilla: '', nombre: '', estado: 'vivo' }] });`);
  assert.equal(await ev(`crearFichaPichon('n1', 'b')`), null, 'sin anilla ni nombre no se crea');
  const p = await ev(`crearFichaPichon('n1', 'a')`);
  assert.equal(p.anilla, 'AJ 1'); assert.equal(p.sexo, 'H'); assert.equal(p.padreId, 'm1'); assert.equal(p.madreId, 'h1'); assert.equal(p.anio, '2026');
  assert.equal(ev(`state.nidadas.get('n1').pichones[0].palomoId`), p.id);
  assert.equal(await ev(`crearFichaPichon('n1', 'a')`), null, 'no se crea dos veces');
  assert.deepEqual(JSON.parse(ev(`JSON.stringify(childrenOf('m1').map(x => x.id))`)), [p.id], 'ya sale como hijo del macho');
});

test('cría: historial de la pareja cuenta pichones, fichas y resultados', () => {
  const { ev } = conPalomos();
  ev(`state.palomos.set('p1', { id: 'p1', nombre: 'Hijo', padreId: 'm1', madreId: 'h1' });
      state.resultados.set('r1', { id: 'r1', palomoId: 'p1', prueba: 'Comarcal', puesto: '3', anio: 2026 });
      state.nidadas.set('n1', { id: 'n1', machoId: 'm1', hembraId: 'h1', huevos: [{ id: 'x' }, { id: 'y' }], pichones: [{ id: 'a', palomoId: 'p1', estado: 'vivo' }, { id: 'b', estado: 'muerto' }] });
      state.nidadas.set('n2', { id: 'n2', machoId: 'm1', hembraId: 'h2', huevos: [], pichones: [] });`);
  assert.deepEqual(JSON.parse(ev(`JSON.stringify(historialPareja('m1', 'h1'))`)),
    { nidadas: 1, huevos: 2, pichones: 2, vivos: 1, exito: 100, fichas: 1, conResultados: 1, mejorPuesto: 3 });
  assert.equal(JSON.parse(ev(`JSON.stringify(parejasCria())`)).length, 2);
});

test('cría: avisos del calendario (.ics) con alarma para la eclosión y el anillado a los 8 días', () => {
  const { ev } = conPalomos();
  ev(`state.nidadas.set('n1', { id: 'n1', machoId: 'm1', hembraId: 'h1', fecha1: '2026-03-01', huevos: [], pichones: [] });`);
  const e = JSON.parse(ev(`JSON.stringify(eventosCalendario(state.nidadas.get('n1')).map(x => x.fecha))`));
  assert.deepEqual(e, ['2026-03-21', '2026-03-29']);
  const ics = ev(`crearICS(state.nidadas.get('n1'))`);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /DTSTART:20260329T090000/); assert.match(ics, /BEGIN:VALARM/);
  assert.match(ics, /SUMMARY:Anillar el pichón de Lucero × Estrella/);
  ev(`state.nidadas.get('n1').pichones = [{ id: 'a', nacimiento: '2026-03-22', anilla: '', estado: 'vivo' }]`);
  assert.deepEqual(JSON.parse(ev(`JSON.stringify(eventosCalendario(state.nidadas.get('n1')).map(x => x.fecha))`)), ['2026-03-30']);
});

test('seguridad de las nidadas: se limpian ids, pichones y huevos manipulados', () => {
  const { ev } = cargarApp();
  const n = JSON.parse(ev(`JSON.stringify(limpiarRegistro('nidadas', { id: 'n1', machoId: '"><img onerror=1>', hembraId: 'h1',
    huevos: [{ id: 'ok' }, { id: '"x' }, null], pichones: [{ id: 'p1', palomoId: 'a b' }, { id: '<s>' }] }))`));
  assert.equal(n.machoId, undefined); assert.equal(n.hembraId, 'h1');
  assert.deepEqual(n.huevos, [{ id: 'ok' }]);
  assert.deepEqual(n.pichones, [{ id: 'p1' }]);
  assert.equal(ev(`limpiarRegistro('nidadas', { id: '"><x' })`), null);
});

test('copias: una copia antigua (sin nidadas) se sigue aceptando y la nueva las incluye', () => {
  const { ev } = conPalomos();
  ev(`state.nidadas.set('n1', { id: 'n1', machoId: 'm1', hembraId: 'h1', huevos: [], pichones: [] });`);
  const c = JSON.parse(ev(`JSON.stringify(datosCopia())`));
  assert.equal(c.nidadas.length, 1);
  assert.match(ev('importar.toString()'), /Array\.isArray\(data\.nidadas\)/);
});

test('esquema de Supabase: la tabla de nidadas tiene seguridad por filas, límite y tamaño', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.nidadas/);
  assert.match(sql, /alter table public\.nidadas enable row level security/);
  assert.match(sql, /create policy "nidadas propias" on public\.nidadas[\s\S]*using \(user_id = \(select auth\.uid\(\)\)\)[\s\S]*with check \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(sql, /create trigger nidadas_limite before insert on public\.nidadas/);
  assert.match(sql, /nidadas_tamano_max/);
});
