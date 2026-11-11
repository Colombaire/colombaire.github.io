'use strict';
/* Defensa ante copias manipuladas: lo que acaba dentro de HTML (ids, foto) se limpia antes de guardarlo o pintarlo. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cargarApp } = require('./cargar-app');

const FOTO_BUENA = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

test('foto: solo se acepta una imagen en base64; nada que pueda salirse del atributo', () => {
  const { ev } = cargarApp();
  assert.equal(ev(`fotoSegura(${JSON.stringify(FOTO_BUENA)})`), true);
  for (const mala of ['x" onerror="alert(1)', 'javascript:alert(1)', 'https://malo.example/x.png', 'data:text/html;base64,PHNjcmlwdD4=', FOTO_BUENA + '"onerror="x', 42, null])
    assert.equal(ev(`fotoSegura(${JSON.stringify(mala)})`), false, String(mala));
});

test('limpiarRegistro: descarta ids peligrosos y quita foto, enlaces y tratamientos manipulados', () => {
  const { ev } = cargarApp();
  const limpio = JSON.parse(ev(`JSON.stringify(limpiarRegistro('palomos', { id: 'a1-b_2', nombre: 'X', foto: 'x"onerror="1', padreId: '"><img src=x onerror=1>', madreId: 'm1',
    tratamientos: [{ id: 'ok1' }, { id: '"><script>' }, null] }))`));
  assert.equal(limpio.foto, undefined);
  assert.equal(limpio.padreId, undefined);
  assert.equal(limpio.madreId, 'm1');
  assert.deepEqual(limpio.tratamientos, [{ id: 'ok1' }]);
  assert.equal(ev(`limpiarRegistro('palomos', { id: '"><script>alert(1)</script>' })`), null);
  assert.equal(ev(`limpiarRegistro('palomos', null)`), null);
  assert.equal(ev(`limpiarRegistro('resultados', { id: 'r1', palomoId: 'a" b' })`), null);
  assert.notEqual(ev(`limpiarRegistro('resultados', { id: 'r1', palomoId: 'p1' })`), null);
});

test('la app lleva una política de contenido (CSP) que solo permite código propio', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
});

test('la marca de recuperar datos locales se lee de app_metadata (el usuario no puede ponérsela)', () => {
  const datos = fs.readFileSync(path.join(__dirname, '..', 'js', 'datos.js'), 'utf8');
  assert.match(datos, /app_metadata\) \|\| \{\}\)\.recuperar_datos_locales/);
  assert.doesNotMatch(datos, /user_metadata\) \|\| \{\}\)\.recuperar_datos_locales/);
});

test('ningún código pinta texto de un palomo en HTML con manejadores en línea (la CSP los bloquearía)', () => {
  const dir = path.join(__dirname, '..', 'js');
  for (const f of fs.readdirSync(dir)) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(t, /<[a-z][^>]*\son(click|error|load|change|input|submit)=/i, f);
  }
});

test('esquema de Supabase: límites por usuario y borrado de cuenta solo para quien está dentro', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  assert.match(sql, /palomos_tamano_max[\s\S]*pg_column_size\(data\) <= 1000000/);
  assert.match(sql, /resultados_tamano_max/);
  assert.match(sql, /create trigger palomos_limite before insert on public\.palomos/);
  assert.match(sql, /create trigger resultados_limite before insert on public\.resultados/);
  // borrar_mi_cuenta solo toca al usuario que llama y no la puede ejecutar el público anónimo
  assert.match(sql, /delete from auth\.users where id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /revoke all on function public\.borrar_mi_cuenta\(\) from public, anon/);
  assert.match(sql, /grant execute on function public\.borrar_mi_cuenta\(\) to authenticated/);
  assert.match(sql, /security definer set search_path = ''/);
});

test('borrar cuenta: pide conexión, la palabra BORRAR y baja una copia antes de borrar', () => {
  const { ev } = cargarApp();
  const f = ev('borrarCuenta.toString()');
  assert.ok(f.indexOf("'BORRAR'") < f.indexOf('exportar()'), 'primero la confirmación');
  assert.ok(f.indexOf('exportar()') < f.indexOf("rpc('borrar_mi_cuenta')"), 'primero la copia, luego el borrado');
  assert.match(f, /onLine/);
});
