'use strict';
/* Colombaire — registro de palomos deportivos.
   Los datos se guardan en el propio móvil (IndexedDB). */

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Toda la app usa la fecha y la hora de España, vaya donde vaya el móvil o el ordenador.
const ZONA = 'Europe/Madrid';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); // AAAA-MM-DD
const anioHoy = () => Number(today().slice(0, 4));
const fechaHora = ms => new Date(ms).toLocaleString('es-ES', { timeZone: ZONA, dateStyle: 'medium', timeStyle: 'short' });

const USO = { competicion: 'Compite', cria: 'Cría', ambos: 'Compite y cría' };
const ESTADO = { palomar: 'En mi palomar', vendido: 'Vendido o regalado', muerto: 'Muerto', historico: 'Histórico (ya no está)', referencia: 'Solo para el pedigrí' };
const PLUMAJES = ['Azul', 'Rojo', 'Bayo', 'Toscado', 'Moracho', 'Gavino', 'Pinto', 'Blanco', 'Negro', 'Prieto', 'Ahumado', 'Rodado', 'Pío', 'Fresa'];
const PRUEBAS = ['Concurso social', 'Comarcal', 'Intercomarcal', 'Regional', 'Regional de jóvenes', 'Copa Comunitats', 'Copa Federación',
  'Campeonato Comunidad Valenciana', 'Campeonato de España CCAA', 'Campeonato de España (Copa del Rey)'];

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  doc: '<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  cross: '<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  tree: '<path d="M12 21v-9M12 12H6V8M12 12h6V8M6 8V5M18 8V5"/><circle cx="12" cy="12" r="1.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M9 17h6"/>',
  down: '<path d="M12 3v12m0 0-4-4m4 4 4-4M5 20h14"/>',
  up: '<path d="M12 15V3m0 0L8 7m4-4 4 4M5 20h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  bird: '<path d="M4 14c3 0 5-2 7-5 1.5-2.2 3-3 5-3a3 3 0 0 1 3 3l2 .5-2 .5c0 5-4 8-9 8H6z"/><path d="M9 20h2M13 20h2"/>',
};
/* ---------- Iniciales para palomos sin foto ---------- */
function iniciales(p) {
  const n = (p && (p.nombre || p.anilla) || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
  return ((n[0] || '?')[0] + (n.length > 1 ? n[1][0] : '')).toUpperCase();
}

const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

/* ---------- Base de datos ---------- */
let db;
const state = { palomos: new Map(), resultados: new Map() };

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('mi-palomar', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('palomos', { keyPath: 'id' });
      r.result.createObjectStore('resultados', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function txDone(t) { return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); }
async function loadAll() {
  for (const st of ['palomos', 'resultados']) {
    const all = await new Promise((res, rej) => {
      const r = db.transaction(st).objectStore(st).getAll();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    state[st].clear();
    all.forEach(x => state[st].set(x.id, x));
  }
}
// Cada cambio hecho en el móvil lleva la hora (`actualizado`) para saber qué versión es la más nueva
// al sincronizar con Supabase. Lo que llega de la nube se guarda tal cual ({ remoto: true }).
async function putMany(st, objs, { remoto = false } = {}) {
  if (!objs.length) return;
  const ahora = Date.now();
  const t = db.transaction(st, 'readwrite'); const s = t.objectStore(st);
  objs.forEach(o => { if (!remoto) o.actualizado = ahora; s.put(o); state[st].set(o.id, o); });
  await txDone(t);
  invalidarGenetica();
  if (!remoto) programarSync();
}
const put = (st, o) => putMany(st, [o]);
async function delMany(st, ids, { remoto = false } = {}) {
  if (!ids.length) return;
  const t = db.transaction(st, 'readwrite'); const s = t.objectStore(st);
  ids.forEach(id => { s.delete(id); state[st].delete(id); });
  await txDone(t);
  invalidarGenetica();
  if (!remoto) { apuntarBorrados(st, ids); programarSync(); }
}
async function borrarLocal() {
  const t = db.transaction(['palomos', 'resultados'], 'readwrite');
  t.objectStore('palomos').clear(); t.objectStore('resultados').clear();
  await txDone(t);
  state.palomos.clear(); state.resultados.clear(); invalidarGenetica();
  guardarJSON('borradosPendientes', []);
  try { ['propietario', 'ultimaCopia', 'ultimaSync', 'copiaAuto'].forEach(k => localStorage.removeItem(k)); } catch (e) { /* sin almacenamiento */ }
  copiaAuto.handle = null; copiaAuto.pendiente = false; ajuste('carpeta', null).catch(() => {});
}
async function clearAll() {
  const ids = { palomos: [...state.palomos.keys()], resultados: [...state.resultados.keys()] };
  const t = db.transaction(['palomos', 'resultados'], 'readwrite');
  t.objectStore('palomos').clear(); t.objectStore('resultados').clear();
  await txDone(t);
  state.palomos.clear(); state.resultados.clear(); invalidarGenetica();
  apuntarBorrados('palomos', ids.palomos); apuntarBorrados('resultados', ids.resultados);
  programarSync();
}

/* ---------- Cuenta y nube (Supabase) ----------
   La cuenta es obligatoria: sin sesión solo se ve la pantalla de entrada. Los datos se guardan en el dispositivo
   (funciona sin conexión) y se sincronizan con la cuenta del usuario, que es la única que puede verlos. */
const CFG = window.MI_PALOMAR_CONFIG || {};
const nube = { sb: null, sesion: null, ocupada: false, ultima: null, error: '', timer: null, repetir: false,
  sinConexion: false, cambiandoClave: false, voluntario: false };
const nubeConfigurada = () => !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
function leerJSON(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } }
function guardarJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
// Borrados pendientes de avisar a la nube (para que no reaparezcan desde otro dispositivo).
function apuntarBorrados(tabla, ids) {
  if (!ids.length) return;
  const t = Date.now();
  guardarJSON('borradosPendientes', [...leerJSON('borradosPendientes', []), ...ids.map(id => ({ tabla, id, t }))]);
}
function programarSync() {
  if (!nube.sesion) return;
  clearTimeout(nube.timer); nube.timer = setTimeout(sincronizar, 1500);
}
// Sesión que Supabase dejó guardada en el dispositivo. Sirve para abrir la app sin conexión aunque el permiso
// de acceso haya caducado y no se pueda renovar hasta que vuelva internet.
function sesionGuardada() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^sb-.*-auth-token$/.test(k)) { const s = JSON.parse(localStorage.getItem(k)); if (s && s.user && s.user.id) return s; }
    }
  } catch (e) { /* sin sesión guardada */ }
  return null;
}
// Los datos del dispositivo pertenecen a una sola cuenta. Si entra otra (o hay datos de antes de existir las
// cuentas), se pregunta antes de mezclar nada y siempre se baja una copia antes de borrar.
async function comprobarPropietario() {
  const id = nube.sesion.user.id;
  let dueno = null; try { dueno = localStorage.getItem('propietario'); } catch (e) { /* sin almacenamiento */ }
  const poner = () => { try { localStorage.setItem('propietario', id); } catch (e) { /* sin almacenamiento */ } };
  if (dueno === id) return true;
  const hayDatos = state.palomos.size || state.resultados.size;
  if (!hayDatos) { poner(); return true; }
  if (!dueno) {
    // Datos de antes de existir las cuentas. Nunca se ofrecen ni se suben a cualquier cuenta: solo pasan a las cuentas
    // marcadas con `recuperar_datos_locales` (se marca en Supabase). Para el resto, se baja una copia y se vacía el
    // dispositivo, sin preguntar.
    if (((nube.sesion.user && nube.sesion.user.user_metadata) || {}).recuperar_datos_locales === true) { poner(); return true; }
    await exportar(); await borrarLocal(); poner();
    toast('Los datos antiguos de este dispositivo se han guardado en una copia (Descargas).');
    return true;
  } else if (!confirm(`Este dispositivo tiene datos de otra cuenta (${state.palomos.size} palomos).\n\nPara cargar los de su cuenta, se descargará una copia de esos datos y se borrarán de este dispositivo.\n\n¿Seguir?`)) {
    await nube.sb.auth.signOut(); return false;
  }
  await exportar(); await borrarLocal(); poner();
  return true;
}
async function iniciarNube() {
  if (!nubeConfigurada() || !window.supabase) return;
  nube.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  nube.ultima = leerJSON('ultimaSync', null);
  const { data, error } = await nube.sb.auth.getSession();
  nube.sesion = data.session;
  if (!nube.sesion && (!navigator.onLine || /fetch|network/i.test((error && error.message) || ''))) {
    const g = sesionGuardada(); if (g) { nube.sesion = g; nube.sinConexion = true; }
  }
  if (nube.sesion && !(await comprobarPropietario())) nube.sesion = null;
  nube.sb.auth.onAuthStateChange((ev, s) => {
    if (ev === 'INITIAL_SESSION') return;
    const antes = !!nube.sesion; nube.sesion = s; if (s) nube.sinConexion = false;
    // Fuera de esta función: Supabase no permite esperar a otras llamadas suyas dentro del aviso.
    setTimeout(async () => {
      if (s && !antes) { if (await comprobarPropietario()) { route(); sincronizar(); } else { nube.sesion = null; route(); } return; }
      if (estadoAcceso() !== accesoMostrado) route();
      else if (location.hash === '#/mas') route();
    }, 0);
  });
  if (nube.sesion) sincronizar();
}

// Une dos listas de tratamientos por su id; si el mismo está en las dos, gana el cambiado más tarde.
function fusionarTratos(a = [], b = []) {
  const m = new Map();
  for (const t of [...a, ...b]) { const x = m.get(t.id); if (!x || (t.modificado || 0) > (x.modificado || 0)) m.set(t.id, t); }
  return [...m.values()];
}
// ¿Se está escribiendo o hay una ventana abierta? Entonces no se repinta la pantalla hasta terminar.
const escribiendo = () => { const a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || !modal.hidden || !!document.querySelector('form'); };
function repintarSiLibre() {
  if (escribiendo()) { nube.refrescarLuego = true; return; }
  nube.refrescarLuego = false; route();
}
document.addEventListener('focusout', () => { if (nube.refrescarLuego) setTimeout(() => { if (nube.refrescarLuego && !escribiendo()) { nube.refrescarLuego = false; route(); } }, 400); });
// Aviso de que no hay conexión (o de que no se ha podido guardar) en la parte de arriba.
function pintarEstadoRed() {
  const el = $('#estadoRed'); if (!el) return;
  let t = '';
  if (nube.sesion && estadoAcceso() === 'ok') {
    if (!navigator.onLine || nube.sinConexion) t = 'Sin conexión: sus cambios se guardan en este dispositivo y subirán a su cuenta al volver internet.';
    else if (nube.error) t = 'No se ha podido guardar en su cuenta. Se volverá a intentar.';
  }
  el.textContent = t; el.hidden = !t;
}
window.addEventListener('online', pintarEstadoRed); window.addEventListener('offline', pintarEstadoRed);
async function sincronizar() {
  if (nube.ocupada) { nube.repetir = true; return; }
  if (!nube.sb || !nube.sesion || !navigator.onLine) return;
  if (nube.sinConexion) { // sesión abierta sin conexión: se renueva ahora que hay internet
    try { const { data } = await nube.sb.auth.getSession(); if (!data.session) return; nube.sesion = data.session; nube.sinConexion = false; } catch (e) { return; }
  }
  nube.ocupada = true; nube.error = ''; pintarEstadoRed();
  const uid = nube.sesion.user.id;
  let cambiosBajados = 0;
  try {
    const pendientes = leerJSON('borradosPendientes', []);
    for (const tabla of ['palomos', 'resultados']) {
      const { data, error } = await nube.sb.from(tabla).select('id, data, actualizado, borrado');
      if (error) throw error;
      const remotos = new Map(data.map(r => [r.id, r]));
      // Bajar lo que es más nuevo en la nube.
      const bajar = [], quitar = [], fusionar = [];
      const ultimaSync = nube.ultima || 0;
      const borradosAqui = new Map(pendientes.filter(b => b.tabla === tabla).map(b => [b.id, b.t]));
      for (const r of data) {
        const l = state[tabla].get(r.id);
        // Lo borrado en este dispositivo no se vuelve a bajar (salvo que se haya cambiado después).
        if (!l && borradosAqui.has(r.id) && borradosAqui.get(r.id) >= r.actualizado) continue;
        if (r.borrado) { if (l && (l.actualizado || 0) <= r.actualizado) quitar.push(r.id); continue; }
        // Los dos lados cambiaron el mismo palomo desde la última sincronización: se conservan los tratamientos de ambos.
        if (tabla === 'palomos' && l && (l.actualizado || 0) > ultimaSync && r.actualizado > ultimaSync && (l.actualizado || 0) !== r.actualizado) {
          const nuevoRemoto = r.actualizado > (l.actualizado || 0);
          const base = nuevoRemoto ? { ...r.data } : { ...l };
          base.tratamientos = nuevoRemoto ? fusionarTratos(r.data.tratamientos, l.tratamientos) : fusionarTratos(l.tratamientos, r.data.tratamientos);
          if (!base.tratamientos.length) delete base.tratamientos;
          fusionar.push(base); continue;
        }
        if (!l || (l.actualizado || 0) < r.actualizado) bajar.push({ ...r.data, actualizado: r.actualizado });
      }
      await putMany(tabla, bajar, { remoto: true });
      await putMany(tabla, fusionar); // cambio nuevo aquí: se sube a continuación
      await delMany(tabla, quitar, { remoto: true });
      cambiosBajados += bajar.length + quitar.length + fusionar.length;
      // Subir lo que es más nuevo aquí, y los borrados pendientes.
      const subir = [...state[tabla].values()]
        .filter(l => { const r = remotos.get(l.id); return !r || (l.actualizado || 0) > r.actualizado; })
        .map(l => ({ user_id: uid, id: l.id, data: l, actualizado: l.actualizado || 0, borrado: false }));
      const tumbas = pendientes.filter(b => b.tabla === tabla && !state[tabla].has(b.id))
        .map(b => ({ user_id: uid, id: b.id, data: {}, actualizado: b.t, borrado: true }));
      const filas = [...subir, ...tumbas];
      for (let i = 0; i < filas.length; i += 100) {
        const { error: e2 } = await nube.sb.from(tabla).upsert(filas.slice(i, i + 100), { onConflict: 'user_id,id' });
        if (e2) throw e2;
      }
    }
    guardarJSON('borradosPendientes', []);
    nube.ultima = Date.now(); guardarJSON('ultimaSync', nube.ultima);
  } catch (e) {
    nube.error = (e && e.message) || 'No se pudo conectar';
  } finally {
    nube.ocupada = false;
  }
  if (nube.repetir) { nube.repetir = false; setTimeout(sincronizar, 300); }
  pintarEstadoRed();
  if (cambiosBajados) repintarSiLibre(); // refresca la pantalla si llegaron datos nuevos, sin molestar si se está escribiendo
  else if (location.hash === '#/mas') repintarSiLibre();
}

/* ---------- Utilidades de datos ---------- */
const nameOf = p => p ? (p.nombre || p.anilla || 'Sin nombre') : '';
const sexoTxt = p => p.sexo === 'H' ? 'Hembra' : 'Macho';
const byName = (a, b) => norm(nameOf(a)).localeCompare(norm(nameOf(b)));
const anioRes = r => r.fecha ? Number(r.fecha.slice(0, 4)) : (Number(r.anio) || 0);
const parents = id => { const p = state.palomos.get(id); return p ? [p.padreId || null, p.madreId || null] : [null, null]; };
const childrenOf = id => [...state.palomos.values()].filter(p => p.padreId === id || p.madreId === id).sort(byName);

function resultsOf(id) {
  return [...state.resultados.values()].filter(r => r.palomoId === id)
    .sort((a, b) => anioRes(b) - anioRes(a) || String(b.fecha || '').localeCompare(String(a.fecha || '')));
}
function bestResult(id) {
  const rs = resultsOf(id);
  const conPuesto = rs.filter(r => Number(r.puesto) > 0).sort((a, b) => a.puesto - b.puesto || anioRes(b) - anioRes(a));
  return conPuesto[0] || rs[0] || null;
}
const resumenRes = r => [r.puesto ? r.puesto + 'º' : '', r.prueba, r.lugar, anioRes(r) || ''].filter(Boolean).join(' · ');

function descendants(id) {
  const out = new Set(); const stack = [id];
  while (stack.length) {
    const x = stack.pop();
    for (const c of childrenOf(x)) if (!out.has(c.id)) { out.add(c.id); stack.push(c.id); }
  }
  return out;
}

/* ---------- Consanguinidad (coeficiente de Wright) ---------- */
const depthMemo = new Map();
function depth(id, seen = new Set()) {
  if (!id || !state.palomos.has(id) || seen.has(id)) return 0;
  if (depthMemo.has(id)) return depthMemo.get(id);
  seen.add(id);
  const [s, d] = parents(id);
  const v = 1 + Math.max(depth(s, seen), depth(d, seen));
  depthMemo.set(id, v);
  return v;
}
// Coeficiente de parentesco entre a y b = consanguinidad que tendría su pichón.
function kinship(a, b, memo = new Map()) {
  if (!a || !b || !state.palomos.has(a) || !state.palomos.has(b)) return 0;
  const key = a < b ? a + '|' + b : b + '|' + a;
  if (memo.has(key)) return memo.get(key);
  memo.set(key, 0); // protección ante datos circulares
  let v;
  if (a === b) {
    const [s, d] = parents(a);
    v = 0.5 * (1 + kinship(s, d, memo));
  } else {
    // Se desarrolla siempre el más "joven" (más generaciones detrás), que no puede ser antepasado del otro.
    let x = a, y = b;
    if (depth(b) > depth(a)) { x = b; y = a; }
    const [s, d] = parents(x);
    v = 0.5 * (kinship(s, y, memo) + kinship(d, y, memo));
  }
  memo.set(key, v);
  return v;
}
function ancestorsMap(id, max = 8) {
  const out = new Map();
  const walk = (x, g) => {
    if (!x || g > max || !state.palomos.has(x)) return;
    if (out.has(x) && out.get(x) <= g) return;
    out.set(x, g);
    const [s, d] = parents(x); walk(s, g + 1); walk(d, g + 1);
  };
  walk(id, 0);
  return out;
}
function commonAncestors(a, b) {
  const A = ancestorsMap(a), B = ancestorsMap(b);
  return [...A.keys()].filter(k => B.has(k)).map(k => ({ id: k, g: A.get(k) + B.get(k) })).sort((x, y) => x.g - y.g);
}
const pct = F => (F * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' %';
function nivel(F) {
  if (F <= 0) return ['ok', 'Sin parentesco conocido'];
  if (F < 0.0625 - 1e-9) return ['ok', 'Consanguinidad baja'];
  if (F < 0.125 - 1e-9) return ['warn', 'Consanguinidad moderada'];
  return ['bad', 'Consanguinidad alta'];
}
function equivalente(F) {
  const eq = [[0.25, 'Es como cruzar hermanos, o un palomo con su madre o su hija.'], [0.125, 'Es como cruzar medio hermanos, o tío con sobrina.'], [0.0625, 'Es como cruzar primos hermanos.']];
  for (const [v, t] of eq) if (Math.abs(F - v) < 0.004) return t;
  return '';
}
function inbreedBox(F, titulo, extra = '') {
  const [cls, txt] = nivel(F);
  return `<div class="ibox ${cls}"><div class="ib-t">${titulo}</div><div class="ib-v">${pct(F)}</div>
    <div><b>${txt}</b></div>${equivalente(F) ? `<p>${equivalente(F)}</p>` : ''}${extra}
    <p class="hint">Solo cuenta los antepasados apuntados en la app.</p></div>`;
}

/* ---------- Genética: rendimiento, valor genético estimado y probabilidad de los pichones ----------
   Método (inspirado en la valoración genética de la ganadería, simplificado):
   1. Cada resultado se convierte en puntos según el nivel del campeonato y el puesto.
   2. El rendimiento de un palomo junta sus mejores resultados (premia también la regularidad).
   3. El valor genético combina el rendimiento propio con el de sus parientes, pesado por el parentesco
      (padres e hijos 1/2, abuelos y nietos 1/4…), y se «encoge» hacia la media cuando hay pocos datos.
      Así un palomo con un único buen resultado no parece un crack.
   4. La fiabilidad dice cuánta información respalda cada estimación.
   Heredabilidad supuesta: 25 % (no está medida para el palomo deportivo; es un valor prudente). */
const GEN = {
  h2: 0.25,
  pesos: [
    [/copa del rey/i, 4], [/españa ccaa|ccaa/i, 3.5], [/comunidad valenciana/i, 3], [/copa comunitats/i, 2.5],
    [/regional de jóvenes/i, 1.6], [/regional/i, 2], [/intercomarcal/i, 1.5], [/comarcal copa/i, 1], [/copa federación/i, 1.3],
    [/trofeo/i, 1.2], [/comarcal de jóvenes/i, 0.8], [/especial/i, 0.8], [/social/i, 0.6], [/comarcal/i, 1],
  ],
};
let geneticaCache = null;
function invalidarGenetica() { geneticaCache = null; }
function pesoPrueba(prueba) {
  for (const [re, w] of GEN.pesos) if (re.test(prueba || '')) return w;
  return 1;
}
// Puntos de un resultado: nivel × puesto (1º = 1; 10º ≈ 0,53; 50º ≈ 0,17). Sin puesto conocido: participación (0,4).
function puntosResultado(r) {
  const p = Number(r.puesto);
  const f = p > 0 ? 1 / (1 + (p - 1) / 10) : 0.4;
  return pesoPrueba(r.prueba) * f;
}
// Rendimiento: el mejor resultado cuenta entero, el 2º la mitad y el 3º un cuarto.
function rendimiento(id) {
  const pts = resultsOf(id).map(puntosResultado).sort((a, b) => b - a);
  if (!pts.length) return null;
  return { valor: pts[0] + 0.5 * (pts[1] || 0) + 0.25 * (pts[2] || 0), n: pts.length };
}
// Función de distribución normal (para pasar a porcentajes).
function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
function calcularGenetica() {
  if (geneticaCache) return geneticaCache;
  depthMemo.clear();
  if (!(location.hash || '').startsWith('#/foto')) { app.oninput = null; app.onclick = null; }
  const memo = new Map();
  const todos = [...state.palomos.values()];
  // Rendimiento observado y su desviación respecto a la media del palomar (en desviaciones típicas).
  const obs = new Map();
  todos.forEach(p => { const r = rendimiento(p.id); if (r) obs.set(p.id, r); });
  const vals = [...obs.values()].map(r => r.valor);
  const media = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - media) ** 2, 0) / (vals.length || 1)) || 1;
  const y = new Map([...obs].map(([id, r]) => [id, { z: (r.valor - media) / sd, n: r.n }]));
  const lambda = (1 - GEN.h2) / GEN.h2; // 3 con h² = 0,25
  const res = new Map();
  for (const p of todos) {
    let num = 0, den = 0; const fuentes = [];
    for (const [j, d] of y) {
      const a = j === p.id ? 1 : 2 * kinship(p.id, j, memo); // parentesco aditivo
      if (a <= 0) continue;
      // Más resultados, más peso, pero con límite: los resultados de un mismo palomo se parecen entre sí (repetibilidad 0,4).
      const peso = a * (d.n / (1 + (d.n - 1) * 0.4));
      num += peso * d.z; den += peso;
      if (j !== p.id) fuentes.push({ id: j, a });
    }
    const ebv = den ? num / (den + lambda) : 0;      // valor genético estimado (en desviaciones típicas)
    const fiab = den / (den + lambda);              // 0 = sin información, 1 = máxima
    res.set(p.id, { ebv, fiab, conDatos: den > 0, propio: obs.get(p.id) || null, zPropio: y.has(p.id) ? y.get(p.id).z : null, fuentes: fuentes.sort((a, b) => b.a - a.a) });
  }
  // Índice 0-100 en la escala genética (desviación típica genética = raíz de la heredabilidad).
  // Con pocos datos el valor está «encogido» hacia la media, así que el índice se queda cerca de 50.
  const s = Math.sqrt(GEN.h2);
  for (const r of res.values()) r.indice = r.conDatos ? Math.round(100 * phi(r.ebv / s)) : null;
  geneticaCache = { res, media, sd, s };
  return geneticaCache;
}
const genDe = id => calcularGenetica().res.get(id);
function estrellas(indice) {
  if (indice == null) return '';
  const n = indice >= 80 ? 5 : indice >= 65 ? 4 : indice >= 45 ? 3 : indice >= 30 ? 2 : 1;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
function textoFiab(f) { return f >= 0.65 ? 'alta' : f >= 0.35 ? 'media' : 'baja'; }
// Pichón de una pareja: media de los valores de los padres, menos un castigo por consanguinidad.
// Devuelve la probabilidad aproximada de que el pichón quede en el 25 % mejor de los palomos con datos.
function prediccionPareja(m, h) {
  const g = calcularGenetica();
  const gm = g.res.get(m), gh = g.res.get(h);
  const F = kinship(m, h);
  // Depresión consanguínea: cada 10 % de consanguinidad resta 0,2 desviaciones típicas (padre × hija: −0,5).
  const media = ((gm ? gm.ebv : 0) + (gh ? gh.ebv : 0)) / 2 - 2 * F;
  const fiab = ((gm ? gm.fiab : 0) + (gh ? gh.fiab : 0)) / 2;
  // Dispersión del pichón alrededor de lo esperado (incluye la parte que no se hereda).
  const sdPichon = Math.sqrt(1 - GEN.h2 / 2 * fiab);
  // El 25 % mejor del palomar empieza a 0,6745 desviaciones típicas por encima de la media.
  const prob = 1 - phi((0.6745 - media) / sdPichon);
  return { media, fiab, F, prob: Math.min(0.95, Math.max(0.02, prob)), indice: Math.round(100 * phi(media / g.s)) };
}
// Tarjeta de la pareja: qué se puede esperar de sus pichones.
function tarjetaPareja(m, h) {
  const gm = genDe(m), gh = genDe(h);
  const r = prediccionPareja(m, h);
  const sinDatos = !(gm && gm.conDatos) && !(gh && gh.conDatos);
  if (sinDatos) {
    return `<div class="card genetica mt"><div class="ib-t">Pichones de esta pareja</div>
      <p class="muted" style="margin:8px 0 0">No hay resultados de ninguno de los dos ni de sus familias, así que no se puede estimar. Se esperaría un pichón normal: 1 de cada 4 quedaría en el 25 % mejor.</p></div>`;
  }
  const pct = Math.round(r.prob * 100);
  const falta = [!(gm && gm.conDatos) ? 'el macho' : '', !(gh && gh.conDatos) ? 'la hembra' : ''].filter(Boolean).join(' y ');
  return `<div class="card genetica mt">
    <div class="ib-t">Pichones de esta pareja</div>
    <div class="gen-top" style="margin-top:6px"><span class="gen-est">${estrellas(r.indice)}</span><span class="fiab f-${textoFiab(r.fiab)}">Fiabilidad ${textoFiab(r.fiab)}</span></div>
    <p class="gen-ind"><b>${pct} %</b></p>
    <p style="margin:2px 0 0">Probabilidad aproximada de que un pichón quede en el <b>25 % mejor</b> de los palomos con datos. Un pichón cualquiera tendría un 25 %.</p>
    ${r.F >= 0.0625 ? `<p class="muted gen-base">Ya incluye la pérdida por la consanguinidad de la pareja (${pct === 2 ? 'muy alta' : (r.F * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' %'}).</p>` : ''}
    ${falta ? `<p class="muted gen-base">No hay datos de ${falta}: se ha contado como un palomo normal.</p>` : ''}
  </div>`;
}
// Tarjeta de la ficha.
function tarjetaGenetica(p) {
  const g = genDe(p.id);
  if (!g || !g.conDatos) {
    return `<div class="card genetica"><div class="gen-top"><span class="gen-est vacio">☆☆☆☆☆</span><span class="fiab f-no">Sin datos</span></div>
      <p class="muted" style="margin:6px 0 0">Todavía no hay resultados de este palomo ni de sus parientes. Apunte sus resultados o los de sus padres e hijos para poder estimarlo.</p></div>`;
  }
  const fu = g.fuentes.filter(f => resultsOf(f.id).length).slice(0, 6).map(f => esc(nameOf(state.palomos.get(f.id))));
  const propio = g.propio ? `${g.propio.n} ${g.propio.n === 1 ? 'resultado propio' : 'resultados propios'}` : 'ningún resultado propio';
  return `<div class="card genetica">
    <div class="gen-top"><span class="gen-est${g.fiab < 0.35 ? ' poca' : ''}">${estrellas(g.indice)}</span><span class="fiab f-${textoFiab(g.fiab)}">Fiabilidad ${textoFiab(g.fiab)}</span></div>
    <p class="gen-ind"><b>${g.indice}</b> <span>de 100</span></p>
    <p style="margin:2px 0 0">Mejor que el <b>${g.indice} %</b> de los palomos con datos, por lo que se puede esperar de su genética.</p>
    ${g.fiab < 0.35 ? '<p class="aviso-gen">Hay pocos datos: este valor puede cambiar bastante cuando se apunten más resultados o más familia.</p>' : ''}
    <p class="muted gen-base">Calculado con ${propio}${fu.length ? ` y los de ${fu.length === 1 ? 'su pariente' : 'sus parientes'} ${fu.join(', ')}` : ''}.</p>
    <details class="gen-como"><summary>¿Cómo se calcula?</summary>
      <p>Cada resultado vale más cuanto mejor es el puesto y más importante el campeonato (un comarcal vale 1; un regional, 2; la Copa Comunitats, 2,5; el Campeonato de España, 3,5; la Copa del Rey, 4).</p>
      <p>Se juntan los resultados del palomo con los de sus parientes: padres e hijos cuentan la mitad, abuelos y nietos un cuarto. Con pocos datos el valor se queda cerca de la media, para no exagerar.</p>
      <p>Es una estimación: el entrenamiento, la suelta y el día también cuentan. Cuantos más padres, pichones y resultados se apunten, más fiable será.</p>
    </details>
  </div>`;
}

/* ---------- Probabilidad en concursos y parejas recomendadas ----------
   Modelo: en un concurso de 100 palomos, cada rival tiene una «fuerza» propia (normal, media 0) y además un
   factor del día (la suelta, la paloma, el tiempo…) del mismo tamaño. La fuerza de nuestro palomo sale de su
   historial (con más peso cuantos más resultados tiene) y de su valor genético. Cuanto más alto el nivel del
   campeonato, más fuertes son los rivales (desplazamiento «d»). Se calcula la probabilidad de quedar entre los
   k primeros sumando todas las posibilidades (integración numérica). */
const NIVELES = [
  { nombre: 'Comarcal', d: -0.3 },
  { nombre: 'Intercomarcal', d: 0.2 },
  { nombre: 'Regional', d: 0.5 },
  { nombre: 'Copa Comunitats', d: 0.9 },
  { nombre: 'Comunidad Valenciana', d: 1.2 },
  { nombre: 'Campeonato de España CCAA', d: 1.5 },
  { nombre: 'Copa del Rey', d: 1.9 },
];
// Nivel (fuerza media de los rivales) según el nombre de la prueba.
const NIVEL_PRUEBA = [
  [/copa del rey/i, 1.9], [/ccaa/i, 1.5], [/comunidad valenciana/i, 1.2], [/copa comunitats/i, 0.9],
  [/regional de jóvenes/i, 0.2], [/regional/i, 0.5], [/intercomarcal/i, 0.2], [/comarcal copa/i, -0.3], [/copa federación/i, 0],
  [/trofeo/i, 0], [/comarcal de jóvenes/i, -0.5], [/social/i, -0.5], [/especial/i, -0.3], [/comarcal/i, -0.3],
];
const nivelDe = prueba => { for (const [re, d] of NIVEL_PRUEBA) if (re.test(prueba || '')) return d; return -0.3; };
const PARTICIPANTES = 100;
// Inversa de la normal (para pasar de «percentil» a «fuerza»).
function invPhi(p) {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  if (q < 0.02425) { const r = Math.sqrt(-2 * Math.log(q)); return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1); }
  if (q > 1 - 0.02425) { const r = Math.sqrt(-2 * Math.log(1 - q)); return -(((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1); }
  const r = q - 0.5, t = r * r;
  return (((((a[0] * t + a[1]) * t + a[2]) * t + a[3]) * t + a[4]) * t + a[5]) * r / (((((b[0] * t + b[1]) * t + b[2]) * t + b[3]) * t + b[4]) * t + 1);
}
/* Fuerza del palomo en la escala de los concursos:
   - Cada rival tiene una fuerza (media = nivel del campeonato, desviación 1) y un factor del día (desviación 1).
   - Cada resultado con puesto dice qué actuación tuvo ese día: puesto entre 100 → percentil → actuación.
   - La fuerza es la media de esas actuaciones, «encogida» hacia lo esperable por su genética cuando hay pocos
     resultados (cada resultado cuenta como una observación más; la genética, como una). */
function fuerza(id) {
  const g = genDe(id);
  const conPuesto = resultsOf(id).filter(r => Number(r.puesto) > 0);
  if (!conPuesto.length && !(g && g.conDatos)) return null;
  const previa = -0.3 + (g && g.conDatos ? 2 * g.ebv : 0);   // un palomo de comarcal, corregido por su genética
  const act = conPuesto.map(r => nivelDe(r.prueba) + Math.SQRT2 * invPhi(1 - (Math.min(Number(r.puesto), PARTICIPANTES) - 0.5) / PARTICIPANTES));
  const n = act.length;
  const valor = (previa + act.reduce((x, y) => x + y, 0)) / (1 + n);
  const varianza = 1 / (1 + n);                                // incertidumbre sobre su fuerza
  return { valor, varianza, n, fiab: 1 - varianza };
}
// Probabilidad de quedar entre los k primeros de N: nuestra actuación ~ Normal(s, sd); cada rival ~ Normal(0, √2).
function probEntreLos(s, k, N = PARTICIPANTES, sd = 1) {
  let total = 0; const dx = 0.04;
  for (let x = s - 7 * sd; x <= s + 7 * sd; x += dx) {
    const dens = Math.exp(-((x - s) ** 2) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI));
    const q = 1 - phi(x / Math.SQRT2);                     // probabilidad de que un rival nos supere
    if (q <= 0) { total += dens * dx; continue; }
    if (q >= 1) continue;
    let pi = Math.pow(1 - q, N - 1), acum = pi;             // binomial: como mucho k−1 rivales delante
    for (let i = 1; i < k; i++) { pi = pi * (N - i) / i * q / (1 - q); acum += pi; }
    total += dens * Math.min(1, acum) * dx;
  }
  return Math.max(0, Math.min(1, total));
}
// Para un palomo: su actuación del día = fuerza (con su incertidumbre) + factor del día.
function probConcursos(f) {
  const sd = Math.sqrt(1 + f.varianza);
  return NIVELES.map(n => ({ nombre: n.nombre, ganar: probEntreLos(f.valor - n.d, 1, PARTICIPANTES, sd), diez: probEntreLos(f.valor - n.d, 10, PARTICIPANTES, sd) }));
}
const fmtPct = p => p >= 0.995 ? '>99 %' : p < 0.005 ? '<1 %' : p < 0.1 ? (p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' %' : Math.round(p * 100) + ' %';
// Tarjeta de la ficha: probabilidades en un concurso de 100 palomos.
function tarjetaConcursos(p) {
  const f = fuerza(p.id);
  if (!f) return '';
  const filas = probConcursos(f);
  return `<div class="card concursos">
    <div class="gen-top"><div class="ib-t">Si compitiera hoy</div><span class="fiab f-${textoFiab(f.fiab)}">Fiabilidad ${textoFiab(f.fiab)}</span></div>
    <p class="muted" style="margin:6px 0 10px">Probabilidad aproximada en un concurso de ${PARTICIPANTES} palomos, según su historial y su genética.</p>
    <table class="tabla-prob"><thead><tr><th>Concurso</th><th>Entre los 10 primeros</th><th>Ganar</th></tr></thead>
    <tbody>${filas.map(r => `<tr><td>${r.nombre}</td><td><b>${fmtPct(r.diez)}</b></td><td>${fmtPct(r.ganar)}</td></tr>`).join('')}</tbody></table>
    <p class="muted gen-base">Un palomo cualquiera tendría un 10 % de quedar entre los 10 primeros y un 1 % de ganar. El estado de forma, el entrenamiento y la suelta del día cambian mucho el resultado.</p>
  </div>`;
}
// Parejas recomendadas: todas las combinaciones posibles, ordenadas por la probabilidad de sus pichones.
// Se descartan las de consanguinidad alta (≥ 12,5 %: medio hermanos o más cercanos).
function parejasRecomendadas({ max = 6 } = {}) {
  const enPalomar = p => (p.estado || 'palomar') === 'palomar';
  const todos = [...state.palomos.values()];
  const machos = todos.filter(p => p.sexo !== 'H' && enPalomar(p));
  const hembrasPalomar = todos.filter(p => p.sexo === 'H' && enPalomar(p));
  // Si no hay hembras en el palomar, se usan las de pedigrí (y se avisa): mejor algo orientativo que nada.
  const hembras = hembrasPalomar.length ? hembrasPalomar : todos.filter(p => p.sexo === 'H' && p.estado === 'referencia');
  const todas = [];
  for (const m of machos) for (const h of hembras) {
    const gm = genDe(m.id), gh = genDe(h.id);
    if (!(gm && gm.conDatos) && !(gh && gh.conDatos)) continue;
    const r = prediccionPareja(m.id, h.id);
    if (r.F >= 0.125) continue;            // consanguinidad alta: medio hermanos o más cercanos
    todas.push({ m, h, ...r });
  }
  todas.sort((a, b) => b.prob - a.prob || b.fiab - a.fiab);
  // Variedad: cada macho sale una sola vez y cada hembra como mucho dos veces.
  const usoM = new Map(), usoH = new Map(), lista = [];
  for (const x of todas) {
    if (lista.length >= max) break;
    if (usoM.get(x.m.id) || (usoH.get(x.h.id) || 0) >= 2) continue;
    usoM.set(x.m.id, 1); usoH.set(x.h.id, (usoH.get(x.h.id) || 0) + 1); lista.push(x);
  }
  return { lista, machos: machos.length, hembras: hembras.length, hembrasPalomar: hembrasPalomar.length };
}

/* ---------- Piezas de interfaz ---------- */
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
function avatar(p, size = '') {
  if (p && p.foto) return `<img class="av ${size}" src="${p.foto}" alt="">`;
  return `<div class="av ini ${size}">${esc(iniciales(p))}</div>`;
}
// Medalla dorada con el mejor resultado (solo si tiene puesto o es un podio destacado).
function medalla(p) {
  const r = bestResult(p.id);
  if (!r) return '';
  const pu = Number(r.puesto);
  return `<span class="medalla${pu >= 1 && pu <= 3 ? '' : ' gris'}">${esc([pu ? pu + 'º' : '', r.prueba, anioRes(r) || ''].filter(Boolean).join(' · '))}</span>`;
}
// Fila de la lista de palomos, como la agenda de contactos del móvil.
function card(p) {
  const estado = p.estado && p.estado !== 'palomar' ? ESTADO[p.estado] : '';
  const sub = [p.nombre && p.anilla ? 'Anilla ' + p.anilla : '', p.plumaje || sexoTxt(p), estado].filter(Boolean).join(' · ');
  return `<a class="item" href="#/p/${p.id}">${avatar(p)}<div class="txt">
    <b>${esc(nameOf(p))}${(() => { const g = genDe(p.id); return g && g.conDatos ? ` <span class="mini-est${g.fiab < 0.35 ? ' poca' : ''}" title="Valor genético estimado">${estrellas(g.indice)}</span>` : ''; })()}</b><small>${esc(sub)}</small>${medalla(p)}
  </div>${CHEV}</a>`;
}
function seg(name, opts, val, cls = '') {
  return `<div class="seg ${cls}" data-name="${name}">${opts.map(([v, l]) =>
    `<button type="button" data-v="${v}" class="${v === val ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function chips(name, opts, val) {
  return `<div class="chips seg-like" data-name="${name}">${opts.map(([v, l]) =>
    `<button type="button" data-v="${v}" class="${v === val ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function wireSeg(root, obj, onChange) {
  root.querySelectorAll('.seg, .seg-like').forEach(s => s.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    obj[s.dataset.name] = b.dataset.v;
    s.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    onChange && onChange(s.dataset.name, b.dataset.v);
  }));
}
// Campo de formulario con la etiqueta sobre el borde (estilo Android).
const campo = (id, label, input) => `<div class="campo"><label for="${id}">${label}</label>${input}</div>`;
const etq = t => `<span class="etq">${t}</span>`;

// Pantallas principales: título grande y sin barra. Interiores: barra con flecha.
function setHeader(title, back, accion) {
  $('#title').textContent = title;
  document.body.dataset.top = back ? 'si' : 'no';
  const a = $('#accion');
  if (accion) { a.hidden = false; a.href = accion; } else a.hidden = true;
  document.title = title + ' · Colombaire';
}
function setTab(t) { document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === t)); }
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg><span>${esc(msg)}</span>`;
  t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2400);
}
function notFound() {
  setHeader('No encontrado', true);
  app.innerHTML = `<div class="card mt"><p>Este palomo ya no existe.</p><a class="btn mt" href="#/">Volver a mis palomos</a></div>`;
}

/* ---------- Ventana para elegir palomo ---------- */
const modal = $('#modal');
function closeModalDom() { modal.hidden = true; modal.innerHTML = ''; document.body.classList.remove('noscroll'); }
function closeModal() {
  if (modal.hidden) return;
  closeModalDom();
  if (history.state && history.state.modal) history.back();
}
window.addEventListener('popstate', () => { if (!modal.hidden) closeModalDom(); });

function openPicker({ titulo, sexo, excluir = new Set(), permitirNuevo = false, permitirQuitar = false, onPick }) {
  modal.hidden = false;
  document.body.classList.add('noscroll');
  history.pushState({ modal: 1 }, '');
  const cands = [...state.palomos.values()].filter(p => (!sexo || p.sexo === sexo) && !excluir.has(p.id))
    .sort((a, b) => ((a.estado || 'palomar') === 'palomar' ? 0 : 1) - ((b.estado || 'palomar') === 'palomar' ? 0 : 1) || byName(a, b));
  const cerrar = '<button class="icon-btn x" type="button" aria-label="Cerrar"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';

  const lista = () => {
    modal.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(titulo)}">
      <div class="sheet-h"><h2>${esc(titulo)}</h2>${cerrar}</div>
      <div class="buscar">${ic('search')}<input type="search" id="pq" placeholder="Buscar nombre o anilla" aria-label="Buscar"></div>
      ${permitirNuevo ? `<button class="btn tonal mt" type="button" id="pnew">${ic('plus')} No está en la lista: añadirlo</button>` : ''}
      ${permitirQuitar ? `<button class="btn sec mt" type="button" id="pnone">No se sabe / quitar</button>` : ''}
      <div class="lista mt" id="pl"></div></div>`;
    const draw = q => {
      const nq = norm(q).replace(/\s+/g, '');
      const l = cands.filter(p => !nq || norm(nameOf(p)).replace(/\s+/g, '').includes(nq) || norm(p.anilla).replace(/\s+/g, '').includes(nq));
      $('#pl', modal).innerHTML = l.length
        ? l.map(p => `<button type="button" class="item" data-id="${p.id}">${avatar(p, 's')}<div class="txt"><b>${esc(nameOf(p))}</b><small>${esc([p.nombre ? p.anilla : '', p.plumaje, ESTADO[p.estado || 'palomar']].filter(Boolean).join(' · '))}</small></div></button>`).join('')
        : `<p class="muted" style="padding:16px">No hay ${sexo === 'H' ? 'hembras' : sexo === 'M' ? 'machos' : 'palomos'} que coincidan.</p>`;
    };
    draw('');
    $('#pq', modal).oninput = e => draw(e.target.value);
    $('.x', modal).onclick = closeModal;
    $('#pl', modal).onclick = e => { const b = e.target.closest('[data-id]'); if (b) { closeModal(); onPick(b.dataset.id); } };
    if (permitirQuitar) $('#pnone', modal).onclick = () => { closeModal(); onPick(null); };
    if (permitirNuevo) $('#pnew', modal).onclick = nuevo;
  };

  const nuevo = () => {
    const n = { estado: 'referencia' };
    modal.innerHTML = `<div class="sheet"><div class="sheet-h"><h2>${sexo === 'H' ? 'Nueva hembra' : 'Nuevo macho'}</h2>${cerrar}</div>
      ${campo('nn', 'Nombre', '<input id="nn" autocapitalize="words">')}
      ${campo('na', 'Anilla', '<input id="na" autocapitalize="characters" placeholder="Ej.: AJ 140909">')}
      ${campo('np', 'Plumaje', `<input id="np" list="plumajes2" placeholder="Ej.: Toscado"><datalist id="plumajes2">${PLUMAJES.map(x => `<option value="${x}">`).join('')}</datalist>`)}
      ${etq('¿Está en su palomar?')}${seg('estado', [['palomar', 'Sí'], ['referencia', 'No, solo pedigrí']], 'referencia')}
      <div id="nerr"></div>
      <button class="btn mt2" type="button" id="nsave">Guardar y elegir</button></div>`;
    wireSeg(modal, n);
    $('.x', modal).onclick = closeModal;
    $('#nn', modal).focus();
    $('#nsave', modal).onclick = async () => {
      const nombre = $('#nn', modal).value.trim(), anilla = $('#na', modal).value.trim().toUpperCase();
      if (!nombre && !anilla) { $('#nerr', modal).innerHTML = '<p class="err">Escriba al menos el nombre o la anilla.</p>'; return; }
      const p = { id: uid(), nombre, anilla, plumaje: $('#np', modal).value.trim(), sexo: sexo || 'M', uso: 'cria', estado: n.estado, creado: Date.now() };
      await put('palomos', p);
      closeModal(); onPick(p.id);
    };
  };
  lista();
}

/* ---------- Pantalla: lista ---------- */
const ui = { filtro: 'todos', verTodos: false, q: '' };
function backupReminder() {
  let last = null;
  try { last = Number(localStorage.getItem('ultimaCopia')) || null; } catch (e) { /* sin almacenamiento */ }
  const dias = last ? (Date.now() - last) / 864e5 : Infinity;
  const limite = cfgCopia().diasAviso;
  if (state.palomos.size < 3 || dias < limite) return '';
  return `<div class="card warn mt2"><b>Haga una copia de seguridad</b><p>${last ? `Han pasado más de ${limite} días desde la última copia.` : 'Todavía no ha guardado ninguna copia.'} Si se pierde o cambia de móvil, la copia le permite recuperar sus palomos.</p><a class="btn sec mt" href="#/mas">${ic('down')} Ir a copia de seguridad</a></div>`;
}
function resumenPalomar() {
  const enCasa = [...state.palomos.values()].filter(p => (p.estado || 'palomar') === 'palomar');
  const comp = enCasa.filter(p => ['competicion', 'ambos'].includes(p.uso)).length;
  const cria = enCasa.filter(p => ['cria', 'ambos'].includes(p.uso)).length;
  return [`${enCasa.length} ${enCasa.length === 1 ? 'palomo' : 'palomos'}`, comp ? `${comp} ${comp === 1 ? 'compite' : 'compiten'}` : '', cria ? `${cria} ${cria === 1 ? 'cría' : 'crían'}` : ''].filter(Boolean).join(' · ');
}

function viewLista() {
  setHeader('Mis palomos', false);
  if (!state.palomos.size) {
    app.innerHTML = `<h1 class="grande">Mis palomos</h1><p class="resumen">Todavía no hay palomos</p>
      <div class="card empty"><p>Empiece añadiendo su primer palomo. Solo hace falta el nombre o la anilla; lo demás se puede completar después.</p>
      <a class="btn mt" href="#/editar/nuevo">${ic('plus')} Añadir mi primer palomo</a>
      <a class="btn tonal mt" href="#/foto">${ic('camera')} Añadir desde la libreta (foto)</a></div>`;
    return;
  }
  app.innerHTML = `<h1 class="grande">Mis palomos</h1><p class="resumen">${esc(resumenPalomar())}</p>
    ${avisoVacunasLista()}
    <div class="row accesos"><a class="btn sec" href="#/concursos">${ic('trophy')} Concursos</a><a class="btn sec" href="#/completar">${ic('edit')} Por completar${totalPorCompletar() ? ' · ' + totalPorCompletar() : ''}</a></div>
    <a class="btn tonal desde-foto" href="#/foto">${ic('camera')} Añadir desde la libreta (foto)</a>
    <div class="buscar">${ic('search')}<input id="q" type="search" placeholder="Buscar nombre o anilla" value="${esc(ui.q)}" aria-label="Buscar"></div>
    ${chips('filtro', [['todos', 'Todos'], ['competicion', 'Compiten'], ['cria', 'Crían']], ui.filtro)}
    <label class="chk"><input type="checkbox" id="vt" ${ui.verTodos ? 'checked' : ''}> Ver también los que ya no están y los de pedigrí</label>
    <div id="res"></div>${avisoCopiaPendiente()}${backupReminder()}`;
  conectarAvisoCopia();
  const draw = () => {
    const nq = norm(ui.q).replace(/\s+/g, '');
    const l = [...state.palomos.values()].filter(p => {
      if (!ui.verTodos && (p.estado || 'palomar') !== 'palomar') return false;
      if (ui.filtro === 'competicion' && !['competicion', 'ambos'].includes(p.uso)) return false;
      if (ui.filtro === 'cria' && !['cria', 'ambos'].includes(p.uso)) return false;
      if (nq && !norm(nameOf(p)).replace(/\s+/g, '').includes(nq) && !norm(p.anilla).replace(/\s+/g, '').includes(nq)) return false;
      return true;
    }).sort(byName);
    $('#res').innerHTML = l.length
      ? `<div class="lista">${l.map(card).join('')}</div>`
      : ui.filtro === 'cria' && !nq && !ui.verTodos
        ? `<div class="card"><b>Ninguno de sus palomos está marcado para criar.</b>
            <p class="muted" style="margin:6px 0 0">Para marcar uno: ábralo, toque el lápiz y en «¿Para qué lo tiene?» elija «Criar» o «Las dos». Las hembras de cría se añaden con «Añadir palomo».</p>
            <button type="button" class="btn sec mt" id="verPed">Ver los de pedigrí que crían</button></div>`
        : '<div class="card"><p class="muted">No hay palomos con esta búsqueda.</p></div>';
    const vp = $('#verPed'); if (vp) vp.onclick = () => { ui.verTodos = true; $('#vt').checked = true; draw(); };
  };
  draw();
  $('#q').oninput = e => { ui.q = e.target.value; draw(); };
  $('#vt').onchange = e => { ui.verTodos = e.target.checked; draw(); };
  wireSeg(app, ui, draw);
}

/* ---------- Pantalla: ficha ---------- */
function parentItem(label, p) {
  if (!p) return `<div class="item"><div class="av ini">?</div><div class="txt"><small>${label}</small><b style="color:var(--muted)">No se sabe</b></div></div>`;
  return `<a class="item" href="#/p/${p.id}">${avatar(p)}<div class="txt"><small>${label}</small><b>${esc(nameOf(p))}</b><small>${esc([p.nombre ? p.anilla : '', p.plumaje].filter(Boolean).join(' · '))}</small></div>${CHEV}</a>`;
}
function resRow(r) {
  const p = Number(r.puesto);
  return `<a class="res" href="#/resultado/${r.palomoId}/${r.id}">
    <div class="pu ${p >= 1 && p <= 3 ? 'p' + p : ''}">${p ? p + 'º' : ic('trophy')}</div>
    <div class="txt"><b>${esc(r.prueba)}</b><small>${esc([r.lugar, anioRes(r) || '', r.puntos ? r.puntos + ' puntos' : ''].filter(Boolean).join(' · '))}</small>
    ${r.notas ? `<div class="nota">${esc(r.notas)}</div>` : ''}</div>${CHEV}</a>`;
}
const dato = (k, v) => v ? `<div class="dato"><span>${k}</span><b>${esc(v)}</b></div>` : '';

function viewFicha(id) {
  const p = state.palomos.get(id);
  if (!p) return notFound();
  setHeader('Ficha', true, '#/editar/' + id);
  const padre = state.palomos.get(p.padreId), madre = state.palomos.get(p.madreId);
  const hijos = childrenOf(id);
  const res = resultsOf(id);
  const conRes = hijos.filter(h => resultsOf(h.id).length).length;
  app.innerHTML = `
    ${p.foto
      ? `<div class="foto"><img src="${p.foto}" alt="Foto de ${esc(nameOf(p))}"></div>`
      : `<a class="foto vacia" href="#/editar/${id}"><span class="ini">${esc(iniciales(p))}</span><span>${ic('camera')} Añadir una foto</span></a>`}
    <h2 class="pname">${esc(nameOf(p))}</h2>
    ${p.anilla && p.nombre ? `<p class="anilla">Anilla ${esc(p.anilla)}</p>` : ''}

    <p class="seccion">Datos</p>
    <div class="datos">${dato('Sexo', sexoTxt(p))}${dato('Plumaje', p.plumaje)}${dato('Año', p.anio)}${dato('Uso', USO[p.uso])}${dato('Dónde está', ESTADO[p.estado || 'palomar'])}${dato('Criador', p.criador)}</div>
    ${p.notas ? `<div class="notas">${esc(p.notas)}</div>` : ''}
    <a class="btn sec mt" href="#/arbol/${id}">${ic('tree')} Ver árbol genealógico</a>

    <p class="seccion">Valor genético estimado</p>
    ${tarjetaGenetica(p)}
    ${['competicion', 'ambos'].includes(p.uso) ? tarjetaConcursos(p) : ''}

    <p class="seccion">Resultados${res.length ? ' · ' + res.length : ''}</p>
    ${res.length ? `<div class="lista">${res.map(resRow).join('')}</div>` : '<div class="card"><p class="muted">Sin resultados apuntados.</p></div>'}
    <a class="btn tonal mt" href="#/resultado/${id}">${ic('plus')} Añadir resultado</a>

    ${seccionSanidad(p)}

    <p class="seccion">Padres</p>
    <div class="lista">${parentItem('Padre', padre)}${parentItem('Madre', madre)}</div>
    ${padre && madre ? inbreedBox(kinship(padre.id, madre.id), 'Consanguinidad de este palomo') : ''}

    ${hijos.length ? `<p class="seccion">Hijos · ${hijos.length} (${conRes} con resultados)</p><div class="lista">${hijos.map(card).join('')}</div>` : ''}

    <p class="seccion">Ficha</p>
    <a class="btn sec" href="#/editar/${id}">${ic('edit')} Editar ficha</a>
    <button type="button" class="btn danger mt" id="borrarFicha">${ic('trash')} Borrar este palomo</button>`;
  $('#borrarFicha').onclick = () => borrarPalomo(id);
}

/* ---------- Pantalla: añadir desde foto de la libreta ----------
   1) Google Lens lee la letra de la foto y el usuario copia el texto. 2) Se pega aquí y la app lo pasa a limpio.
   3) Se revisa y corrige lo leído. 4) Al guardar se crean las fichas o se completan las que ya existen. */
const lectura = { palomos: [], hojas: 0, mas: false };
const clave = s => norm(s).replace(/[^a-z0-9]/g, '');
function buscarPalomo(nombre, anilla, extra = new Map()) {
  const a = clave(anilla), n = clave(nombre);
  for (const [k, id] of extra) if ((a && k === 'a:' + a) || (n && k === 'n:' + n)) return state.palomos.get(id) || { id, nuevo: true };
  const todos = [...state.palomos.values()];
  return (a && todos.find(p => clave(p.anilla) === a)) || (n && todos.find(p => clave(p.nombre) === n || (!p.nombre && clave(p.anilla) === n))) || null;
}
// Hojas ya pasadas a limpio que se cargan desde un archivo (.json) para revisarlas antes de guardarlas.
function cargarHojasDesdeArchivo(datos) {
  if (!datos || !['colombaire-hojas', 'mi-palomar-hojas'].includes(datos.app) || !Array.isArray(datos.palomos)) { toast('Ese archivo no es de hojas de Colombaire'); return; }
  const P = o => ({ nombre: '', anilla: '', sexo: '', plumaje: '', anio: 0, padre: '', madre: '', criador: '', notas: '', dudas: '', resultados: [], ...o });
  lectura.palomos = datos.palomos.map(p => ({ ...P(p), incluir: true, hoja: p.hoja || 1, resultados: (p.resultados || []).map(r => ({ ...r })) }));
  lectura.hojas = Math.max(1, ...lectura.palomos.map(p => p.hoja));
  lectura.notas = datos.notas || ''; lectura.mas = false;
  dibujarRevision();
}

/* ---------- Parser de las hojas de la libreta (texto copiado con Google Lens) ----------
   Gratis y sin conexión: Google Lens lee la letra de la foto y este parser entiende las fichas impresas
   de la Federació (libro registro de palomos, hoja de hembras, libro de parejas de cría) y devuelve
   los palomos en el mismo formato que la pantalla de revisión. Corrige errores típicos de lectura
   (O↔0, l↔1, «ROZO» por «ROJO»…) y reconoce los nombres de los palomos conocidos aunque estén mal leídos. */
const PARSER_COLORES = [
  ['Rojo', ['rojo', 'roja', 'rozo', 'roza', 'r0jo', 'rojos', 'rojas']],
  ['Azul', ['azul', 'azula', 'azvl', 'asul']],
  ['Toscado', ['toscado', 'toscada', 'toscat', 'tosca', 'toskat', 'toscao']],
  ['Bayo', ['bayo', 'baya', 'ballo']],
  ['Gavino', ['gavino', 'gavina', 'gabino']],
  ['Blanco', ['blanco', 'blanca']],
  ['Moscado', ['moscado', 'moscada']],
  ['Mascarado', ['mascarado', 'mascarada', 'mascarat']],
  ['Negro', ['negro', 'negra']],
  ['Pinto', ['pinto', 'pinta']],
  ['Figura', ['figura']],
  ['Ahumado', ['ahumado', 'ahumada']],
  ['Amarillo', ['amarillo', 'amarilla']],
];
const pNorm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function pLev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// Color: compara cada palabra con la lista (admite una letra mal leída).
function pColor(txt) {
  for (const w of pNorm(txt).split(' ')) {
    if (w.length < 3) continue;
    // Primero la palabra exacta; si no, una letra de diferencia pero con la misma inicial («rozo» → rojo, no «moscada» → toscada).
    for (const [nombre, vars] of PARSER_COLORES) if (vars.includes(w)) return nombre;
    for (const [nombre, vars] of PARSER_COLORES) if (w.length >= 4 && vars.some(v => v[0] === w[0] && pLev(v, w) <= 1)) return nombre;
  }
  return '';
}
// Nombre conocido más parecido (palomos de la app + líneas de la libreta). Devuelve '' si no se parece a ninguno.
function pNombre(txt, conocidos, deLaApp = []) {
  // Prueba el texto entero y cada trozo entre paréntesis («Chatin (Piripi)»); gana un palomo de la app.
  const trozos = [String(txt ?? ''), ...(String(txt ?? '').match(/\(([^)]*)\)/g) || []).map(x => x.slice(1, -1)), String(txt ?? '').replace(/\([^)]*\)/g, '')];
  let mejor = '', dist = Infinity, enApp = false;
  for (const tr of trozos) {
    const t = pNorm(tr).replace(/\b(hna|hno|hija|hijo|h)\b/g, '').trim();
    if (t.length < 3) continue;
    for (const c of conocidos) {
      const n = pNorm(c); if (!n) continue;
      const d = pLev(n, t), lim = Math.max(1, Math.round(n.length * 0.25));
      const app = deLaApp.includes(c);
      if (d <= lim && (app && !enApp || (app === enApp && d < dist))) { mejor = c; dist = d; enApp = app; }
    }
  }
  return mejor;
}
// Anillas: 1-2 letras + 5-6 cifras, con los errores típicos de lectura dentro de las cifras.
const RE_ANILLA = /\b([A-Z]{1,2})\s?[-.]?\s?([0-9OoIl|SB]{5,6})(?![0-9A-Za-z])/g;
const pCifras = s => s.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
function pAnillas(txt) {
  const out = [];
  for (const m of String(txt).toUpperCase().matchAll(RE_ANILLA)) {
    const cif = pCifras(m[2]);
    if (!/^\d{5,6}$/.test(cif) || /\d/.test(m[2][0]) === false && /[OIL|SB]/.test(m[2][0]) && !/\d/.test(m[2])) continue;
    const antes = String(txt).toUpperCase().slice(Math.max(0, m.index - 12), m.index);
    if (/LICENCIA|DNI|NIF/.test(antes)) continue;
    if (['DE', 'EL', 'LA', 'Y', 'A'].includes(m[1])) continue;
    out.push({ anilla: `${m[1]} ${cif}`, pos: m.index });
  }
  return out;
}
// Fechas: «15/04/2026», «15 1 04 /2026», «/9/2019»… Devuelve {texto, anio}.
function pFecha(txt) {
  const t = String(txt).replace(/[|lI]/g, '/');
  let m = t.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(20\d{2}|\d{2})\b/);
  if (m && Number(m[1]) <= 31 && Number(m[2]) <= 12) { const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return { texto: `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${a}`, anio: a }; }
  m = t.match(/\/\s*(\d{1,2})\s*\/\s*20\s?(\d{2})\b/);
  if (m && Number(m[1]) <= 12) return { texto: `mes ${m[1]} de 20${m[2]}`, anio: 2000 + Number(m[2]) };
  return null;
}
// Números de pareja que se apuntan debajo de cada ficha: «6-15-12B-2», «2-29», «11».
const RE_PAREJAS = /^\s*\(?\s*\d{1,2}[AB]?\s*\)?(\s*[-–]\s*\(?\d{1,2}[AB]?\)?)*\s*$/;
// Etiquetas impresas en las fichas (solo espacios dentro de una etiqueta, nunca saltos de línea).
const RE_ETIQUETA = /(N[ \t]*[º°o0]?[ \t]*\.?[ \t]*ANILLA|FECHA[ \t]*(?:DE[ \t]*)?NACIMIENTO|BOX[ \t]*PAREJA|BOX|SEXO|PLUMAJE|PADRES|PADRE|MADRE|ANILLA|COLOR|L[IÍ]NEA[ \t]*:?[ \t]*PADRE|L[IÍ]NEA[ \t]*MADRE|L[IÍ]NEA|PICADERO[ \t]*\d?|DESTINO|NOMBRE)[ \t]*:?/gi;
// Trocea un bloque en pares etiqueta → valor (lo escrito entre una etiqueta y la siguiente).
function pCampos(bloque) {
  const marcas = [...bloque.matchAll(RE_ETIQUETA)];
  return marcas.map((m, i) => {
    const fin = i + 1 < marcas.length ? marcas[i + 1].index : bloque.length;
    const valor = bloque.slice(m.index + m[0].length, fin).replace(/[_]+/g, ' ').replace(/[ \t]+/g, ' ')
      .split('\n').map(x => x.trim()).filter(x => x && !RE_PAREJAS.test(x)).join('\n')
      .replace(/^[\s:.\-/]+|[\s:.\-/(]+$/g, '').trim();
    const e = m[1].toUpperCase().replace(/\s+/g, ' ').replace(/Í/g, 'I');
    const etiqueta = /ANILLA/.test(e) && /^N/.test(e) ? 'NANILLA' : /NACIMIENTO/.test(e) ? 'FECHA' : /PAREJA|^BOX/.test(e) ? 'PAREJA' : /LINEA/.test(e) ? 'LINEA' : /PICADERO/.test(e) ? 'PICADERO' : e.replace(/[^A-Z]/g, '');
    return { etiqueta, valor };
  });
}
const pVacio = v => !v || /^[\s/._\-()]*$/.test(v) || /^\/?\s*20\s*$/.test(v);

function parsearTextoLibreta(texto, conocidos = []) {
  const nombres = [...new Set(conocidos)];
  const pNombreApp = (t) => pNombre(t, nombres, conocidos);
  const T = String(texto || '').replace(/\r/g, '');
  const esHembras = /\bHEMBRAS\b/i.test(T);
  const res = [];
  const base = () => ({ nombre: '', anilla: '', sexo: esHembras ? 'H' : '', plumaje: '', anio: 0, padre: '', madre: '', criador: '', notas: '', dudas: '', resultados: [] });

  // A) Libro de parejas de cría: padre y madre arriba, y la tabla de pichones con fecha y anilla.
  if (/PAREJAS?\s*(DE\s*)?CR[IÍ]A/i.test(T) || /Fecha\s*nacimiento\s*\n?\s*Anilla/i.test(T)) {
    const numPareja = (T.match(/^\s*(\d{1,2})\s*$/m) || [])[1] || '';
    let padre = null, madre = null; const vistos = new Set();
    const lineas = T.split('\n');
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      const rol = /\bPADRE\s*:/i.test(l) && !/L[IÍ]NEA/i.test(l) ? 'padre' : /\bMADRE\s*:/i.test(l) && !/L[IÍ]NEA/i.test(l) ? 'madre' : '';
      if (rol) {
        // Esta línea y las siguientes hasta la próxima «LINEA», «PADRE» o «MADRE» (por si Lens partió los datos en varias líneas).
        let trozo = l.replace(/^.*?\b(PADRE|MADRE)\s*:/i, '');
        for (let j = i + 1; j < Math.min(lineas.length, i + 3) && !/L[IÍ]NEA|PADRE|MADRE|Fecha/i.test(lineas[j]); j++) trozo += ' ' + lineas[j];
        const c = pCampos('NOMBRE: ' + trozo);
        const an = pAnillas(trozo)[0];
        const p = { ...base(), sexo: rol === 'padre' ? 'M' : 'H', nombre: (c.find(x => x.etiqueta === 'NOMBRE') || {}).valor || '', anilla: an ? an.anilla : '',
          plumaje: pColor((c.find(x => x.etiqueta === 'PLUMAJE') || {}).valor || ''), notas: `${rol === 'padre' ? 'Padre' : 'Madre'} de la pareja ${numPareja || 'de cría'}.` };
        if (pVacio(p.nombre)) p.nombre = '';
        if (p.anilla && !vistos.has(p.anilla)) { vistos.add(p.anilla); res.push(p); }
        if (rol === 'padre') padre = p; else madre = p;
        continue;
      }
      // Filas de la tabla: fecha + anilla (+ plumaje).
      const an = pAnillas(l).filter(a => !vistos.has(a.anilla));
      if (!an.length) continue;
      const f = pFecha(l) || pFecha(lineas[i - 1] || '');
      for (const a of an) {
        vistos.add(a.anilla);
        res.push({ ...base(), anilla: a.anilla, anio: f ? f.anio : 0, plumaje: pColor(l.slice(a.pos)), padre: padre ? padre.anilla || padre.nombre : '', madre: madre ? madre.anilla || madre.nombre : '',
          notas: `${f ? `Nacido el ${f.texto}. ` : ''}Pareja ${numPareja}.`.trim(), dudas: 'Sexo sin apuntar en la libreta.' });
      }
    }
    return res;
  }

  // B) Fichas «DATOS PALOMO» (libro registro de palomos, hoja de hembras, registro antiguo).
  // En el libro de 2026 la anilla impresa va justo ANTES de «DATOS PALOMO»: se pasa dentro de su ficha.
  const T2 = T.replace(/(N[ \t]*[º°o0]?[ \t]*\.?[ \t]*ANILLA[ \t]*:?[ \t]*[A-Z]{1,2}[ \t]?[-.]?[ \t]?[0-9OIl|]{5,6})[ \t]*\n\s*(DATOS\s*\/?\s*PALOMO\s*:?)/gi, '$2\n$1\n');
  const bloques = T2.split(/DATOS\s*\/?\s*PALOMO\s*:?/i).slice(1);
  const trozos = bloques.length ? bloques : [T];
  for (const bloque of trozos) {
    const campos = pCampos(bloque);
    const p = base();
    let contexto = ''; // '', 'padre' o 'madre': a quién pertenecen las ANILLA/COLOR/LINEA que siguen
    let columnas = false; // ficha antigua: «PADRE: … MADRE: …» en dos columnas, y debajo sus anillas y plumajes por parejas
    const de = { '': {}, padre: {}, madre: {} };
    for (const { etiqueta, valor } of campos) {
      if (etiqueta === 'PADRES') { columnas = true; contexto = 'padre'; continue; }
      if (etiqueta === 'PADRE' || etiqueta === 'MADRE') { contexto = etiqueta.toLowerCase(); if (!pVacio(valor)) de[contexto].nombre = valor; continue; }
      if (pVacio(valor)) continue;
      if (columnas && ['PLUMAJE', 'NANILLA', 'ANILLA', 'COLOR'].includes(etiqueta)) {
        const k = etiqueta === 'PLUMAJE' || etiqueta === 'COLOR' ? 'plumaje' : 'anilla';
        const v = k === 'plumaje' ? pColor(valor) : (pAnillas(valor)[0] || {}).anilla;
        if (v) { const quien = de.padre[k] ? 'madre' : 'padre'; de[quien][k] = v; }
        continue;
      }
      const v = valor.split('\n')[0];
      if (etiqueta === 'NANILLA') { const a = pAnillas(valor)[0]; if (a) p.anilla = a.anilla; }
      else if (etiqueta === 'NOMBRE') p.nombre = v;
      else if (etiqueta === 'FECHA') { const f = pFecha(valor) || pFecha(valor + '/2026'); if (f) { p.anio = f.anio; p.notas += `Nacido el ${f.texto}. `; } }
      else if (etiqueta === 'PAREJA') { const m = v.match(/^\s*([0-9]{1,2}[A-Z]?|[A-Z])\b/i); if (m) p.notas += `Box/pareja ${m[1].toUpperCase()}. `; }
      else if (etiqueta === 'SEXO') { const s = pNorm(v); if (/^(m|macho|palomo)/.test(s)) p.sexo = 'M'; else if (/^(h|hembra|paloma)/.test(s)) p.sexo = 'H'; }
      else if (etiqueta === 'PLUMAJE' || etiqueta === 'COLOR') {
        // Color conocido; si no se reconoce, se copia tal cual (en minúsculas) para corregirlo en la revisión.
        const c = pColor(v) || (!contexto && v.length <= 20 && /[a-z]/i.test(v) ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : ''); if (c) { if (contexto && !(etiqueta === 'COLOR' && esHembras && contexto === 'madre')) de[contexto].plumaje = de[contexto].plumaje || c; else p.plumaje = p.plumaje || c; } }
      else if (etiqueta === 'ANILLA') { const a = pAnillas(valor)[0]; if (a) de[contexto || ''].anilla = a.anilla; }
      else if (etiqueta === 'LINEA') de[contexto || ''].linea = [de[contexto || ''].linea, valor.replace(/\s*\n\s*/g, ' / ')].filter(Boolean).join(' / ');
    }
    // En la hoja de hembras los datos de cada hembra se escriben en la fila «MADRE»: esa anilla es la de la propia hembra.
    if (!p.anilla && de.madre.anilla && (esHembras || !de.padre.anilla)) { p.anilla = de.madre.anilla; p.plumaje = p.plumaje || de.madre.plumaje || ''; de[''].linea = de[''].linea || de.madre.linea; de.madre = {}; }
    if (!p.anilla && de.padre.anilla && !de.madre.anilla) { p.anilla = de.padre.anilla; de.padre = {}; }
    if (!p.anilla) { const a = pAnillas(bloque)[0]; if (a) p.anilla = a.anilla; }
    if (!p.anilla && !p.nombre) continue;
    // Línea «Nombre del padre / Hna Nombre de la madre»: lo de antes de la barra es el padre, lo de después la madre.
    const linea = de[''].linea || '';
    if (linea) {
      const [lp, lm] = linea.split(/\s*\/\s*/);
      const np = pNombreApp(lp); if (np) p.padre = np;
      const anM = pAnillas(lm || '')[0];
      const nm = pNombreApp((lm || '').replace(RE_ANILLA, ''));
      if (nm && !/\b(hna|hno)\b/i.test(lm || '')) p.madre = anM ? `${nm} ${anM.anilla}` : nm;
      p.notas += `Línea: ${linea}. `;
    }
    if (de.padre.nombre && !p.padre) p.padre = pNombreApp(de.padre.nombre) || de.padre.nombre;
    if (de.madre.nombre && !p.madre) p.madre = pNombreApp(de.madre.nombre) || de.madre.nombre;
    if (de.padre.anilla && !p.padre) p.padre = de.padre.anilla;
    if (de.madre.anilla && !p.madre) p.madre = de.madre.anilla;
    const plumPadres = [de.padre.plumaje && `padre ${de.padre.plumaje.toLowerCase()}`, de.madre.plumaje && `madre ${de.madre.plumaje.toLowerCase()}`].filter(Boolean);
    if (plumPadres.length) p.notas += `Plumaje de los padres: ${plumPadres.join(', ')}. `;
    // Números de pareja apuntados debajo de la ficha.
    const parejas = bloque.split('\n').filter(l => l.trim() && RE_PAREJAS.test(l)).map(l => l.replace(/[()\s]/g, ''));
    if (parejas.length) p.notas += `Parejas: ${parejas.join(', ')}. `;
    if (!p.sexo) p.dudas = 'Sexo sin apuntar en la libreta.';
    if (/\?/.test(bloque)) p.dudas = [p.dudas, 'Hay un interrogante escrito en esta ficha.'].filter(Boolean).join(' ');
    p.notas = p.notas.trim();
    res.push(p);
  }
  return res;
}

function viewFoto() {
  setHeader('Añadir desde foto', true, null);
  if (lectura.palomos.length && !lectura.mas) return dibujarRevision();
  app.innerHTML = `<h1 class="grande">Desde la libreta</h1><p class="resumen">Pase a limpio las hojas con Google Lens</p>
    ${lectura.mas ? '<button type="button" class="btn sec" id="volverRev">Volver a lo ya leído</button>' : ''}
    <p class="seccion">Hojas ya pasadas a limpio</p>
    <label class="btn sec"><input type="file" accept="application/json,.json" id="hojasArchivo" hidden>${ic('up')} Cargar hojas desde un archivo</label>
    <p class="seccion">Con Google Lens (gratis)</p>
    <div class="card lens">
      <ol class="pasos">
        <li>Abra la foto de la hoja en el móvil y toque el botón de <b>Lens</b> (o haga la foto con Google Lens).</li>
        <li>Toque <b>«Texto»</b> → <b>«Seleccionar todo»</b> → <b>«Copiar»</b>.</li>
        <li>Vuelva aquí, pegue el texto y pulse <b>«Pasar a limpio»</b>.</li>
        <li><b>Usted revisa lo leído</b> y corrige lo que haga falta. No se guarda nada sin su permiso.</li>
      </ol>
      <textarea id="textoLens" rows="6" placeholder="Pegue aquí el texto de la hoja…"></textarea>
      <button type="button" class="btn sec mt" id="pegarLens">Pegar lo copiado</button>
      <button type="button" class="btn mt" id="parsearLens">Pasar a limpio</button>
      <div id="errLens"></div>
      <p class="hint" style="margin:8px 2px 0">Entiende las fichas de la Federació: libro registro de palomos, hoja de hembras y libro de parejas de cría. Puede pegar varias hojas seguidas.</p>
    </div>`;
  $('#hojasArchivo').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { cargarHojasDesdeArchivo(JSON.parse(await f.text())); } catch (x) { toast('No se pudo leer el archivo'); }
  };
  if ($('#volverRev')) $('#volverRev').onclick = () => { lectura.mas = false; viewFoto(); };
  $('#pegarLens').onclick = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) $('#textoLens').value = t; else toast('No hay nada copiado'); }
    catch (e) { toast('Mantenga pulsado el recuadro y elija «Pegar»'); $('#textoLens').focus(); }
  };
  $('#parsearLens').onclick = () => {
    const texto = $('#textoLens').value.trim();
    if (!texto) { $('#errLens').innerHTML = '<p class="err">Primero pegue el texto copiado con Google Lens.</p>'; return; }
    const conocidos = [...state.palomos.values()].map(p => p.nombre).filter(Boolean);
    // Varias hojas pegadas seguidas: se lee cada una por separado (cada hoja empieza por «LIBRO REGISTRO…»).
    const hojas = texto.split(/(?=LIBRO\s*REGISTRO)/i).filter(h => h.trim());
    const vistas = new Set(), leidos = [];
    for (const h of hojas) for (const p of parsearTextoLibreta(h, conocidos)) {
      const k = clave(p.anilla) || clave(p.nombre);
      if (k && vistas.has(k)) continue;
      vistas.add(k); leidos.push(p);
    }
    if (!leidos.length) { $('#errLens').innerHTML = '<p class="err">No he encontrado ninguna anilla en ese texto. Compruebe que ha copiado la hoja entera.</p>'; return; }
    lectura.hojas++; lectura.mas = false;
    for (const p of leidos) lectura.palomos.push({ ...p, hoja: lectura.hojas, incluir: true, resultados: (p.resultados || []).map(r => ({ ...r })) });
    dibujarRevision();
  };
}
function dibujarRevision() {
  const L = lectura.palomos;
  const sel = L.filter(p => p.incluir).length;
  const inp = (i, k, etiqueta, tipo = 'text', extra = '') => `<label class="rv-campo"><span>${etiqueta}</span><input data-i="${i}" data-k="${k}" type="${tipo}" value="${esc(L[i][k] === 0 ? '' : L[i][k])}" ${extra}></label>`;
  app.innerHTML = `<h1 class="grande">Revise lo leído</h1><p class="resumen">${L.length} ${L.length === 1 ? 'palomo' : 'palomos'} en ${lectura.hojas} ${lectura.hojas === 1 ? 'hoja' : 'hojas'}</p>
    <p class="muted" style="margin:0 6px 14px">Corrija lo que esté mal leído y quite la marca de lo que no quiera añadir. Si un palomo ya está en la app, solo se le añade lo nuevo.</p>
    ${L.map((p, i) => {
      const ya = buscarPalomo(p.nombre, p.anilla);
      return `<div class="card rv${p.incluir ? '' : ' fuera'}">
        <label class="rv-cab"><input type="checkbox" data-i="${i}" data-k="incluir" ${p.incluir ? 'checked' : ''}>
          <b>${esc(p.nombre || p.anilla || 'Palomo sin nombre')}</b><span class="rv-hoja">Hoja ${p.hoja}</span></label>
        ${ya ? `<p class="rv-ya">Ya está en la app como <b>${esc(nameOf(ya))}</b>: se completará con lo nuevo.</p>` : '<p class="rv-nuevo">Palomo nuevo</p>'}
        ${p.dudas ? `<p class="rv-duda"><b>Dudas al leer:</b> ${esc(p.dudas)}</p>` : ''}
        <div class="rv-rejilla">
          ${inp(i, 'nombre', 'Nombre')}${inp(i, 'anilla', 'Anilla')}
          <label class="rv-campo"><span>Sexo</span><select data-i="${i}" data-k="sexo"><option value="">No se sabe</option><option value="M" ${p.sexo === 'M' ? 'selected' : ''}>Macho</option><option value="H" ${p.sexo === 'H' ? 'selected' : ''}>Hembra</option></select></label>
          ${inp(i, 'plumaje', 'Plumaje')}${inp(i, 'anio', 'Año', 'number', 'inputmode="numeric"')}${inp(i, 'criador', 'Criador')}
          ${inp(i, 'padre', 'Padre')}${inp(i, 'madre', 'Madre')}
        </div>
        <label class="rv-campo"><span>Notas</span><input data-i="${i}" data-k="notas" value="${esc(p.notas)}"></label>
        ${p.resultados.length ? `<p class="rv-sub">Resultados · ${p.resultados.length}</p>
          ${p.resultados.map((r, j) => `<div class="rv-res">
            <input data-i="${i}" data-j="${j}" data-k="puesto" type="number" inputmode="numeric" value="${r.puesto || ''}" placeholder="Puesto" aria-label="Puesto">
            <input data-i="${i}" data-j="${j}" data-k="prueba" value="${esc(r.prueba)}" placeholder="Concurso" aria-label="Concurso">
            <input data-i="${i}" data-j="${j}" data-k="lugar" value="${esc(r.lugar)}" placeholder="Lugar" aria-label="Lugar">
            <input data-i="${i}" data-j="${j}" data-k="anio" type="number" inputmode="numeric" value="${r.anio || ''}" placeholder="Año" aria-label="Año">
            <button type="button" class="rv-quitar" data-i="${i}" data-j="${j}" aria-label="Quitar este resultado">×</button>
          </div>`).join('')}` : ''}
      </div>`;
    }).join('')}
    ${lectura.notas ? `<div class="notas mt">${esc(lectura.notas)}</div>` : ''}
    <button class="btn mt2" type="button" id="guardarLeidos">Guardar ${sel} ${sel === 1 ? 'palomo' : 'palomos'}</button>
    <button class="btn sec mt" type="button" id="masHojas">${ic('plus')} Añadir más hojas</button>
    <button class="btn danger mt" type="button" id="descartar">Descartar lo leído</button>`;
  app.oninput = e => {
    const t = e.target; if (t.dataset.i === undefined || !t.dataset.k) return;
    const p = L[Number(t.dataset.i)], k = t.dataset.k;
    const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value ? Number(t.value) : 0) : t.value;
    if (t.dataset.j !== undefined) p.resultados[Number(t.dataset.j)][k] = v; else p[k] = v;
    if (k === 'incluir') { t.closest('.rv').classList.toggle('fuera', !v); const n = L.filter(x => x.incluir).length; $('#guardarLeidos').textContent = `Guardar ${n} ${n === 1 ? 'palomo' : 'palomos'}`; }
  };
  app.onclick = e => {
    const b = e.target.closest('.rv-quitar'); if (!b) return;
    L[Number(b.dataset.i)].resultados.splice(Number(b.dataset.j), 1); dibujarRevision();
  };
  $('#descartar').onclick = () => {
    if (!confirm('¿Descartar todo lo leído? No se guardará nada.')) return;
    lectura.palomos = []; lectura.hojas = 0; lectura.notas = ''; lectura.mas = false;
    app.oninput = null; app.onclick = null; location.hash = '#/';
  };
  $('#masHojas').onclick = () => { app.oninput = null; app.onclick = null; lectura.mas = true; viewFoto(); };
  $('#guardarLeidos').onclick = guardarLeidos;
}
async function guardarLeidos() {
  const elegidos = lectura.palomos.filter(p => p.incluir && (p.nombre || p.anilla).trim());
  if (!elegidos.length) return toast('No hay ningún palomo marcado');
  const cambios = new Map();   // id → palomo a guardar
  const nuevosIds = new Map(); // clave → id (para enlazar padres dentro de la misma tanda)
  const resultados = [];
  let creados = 0, completados = 0, padresNuevos = 0;
  const registrar = (p) => { if (clave(p.anilla)) nuevosIds.set('a:' + clave(p.anilla), p.id); if (clave(p.nombre)) nuevosIds.set('n:' + clave(p.nombre), p.id); };
  const actual = id => cambios.get(id) || state.palomos.get(id);
  // 1) Palomos: nuevos o completar los existentes (solo se rellenan los huecos).
  for (const l of elegidos) {
    const ya = buscarPalomo(l.nombre, l.anilla, nuevosIds);
    let p;
    if (ya && !ya.nuevo) {
      p = { ...actual(ya.id) };
      for (const k of ['nombre', 'anilla', 'plumaje', 'criador']) if (!p[k] && l[k]) p[k] = l[k].trim();
      if (!p.anio && l.anio) p.anio = l.anio;
      if ((!p.sexo || p.sexo === '') && l.sexo) p.sexo = l.sexo;
      if (l.notas && !(p.notas || '').includes(l.notas)) p.notas = [p.notas, l.notas].filter(Boolean).join('\n');
      completados++;
    } else if (ya && ya.nuevo) {
      p = { ...actual(ya.id) };
    } else {
      p = { id: uid(), nombre: l.nombre.trim(), anilla: l.anilla.trim(), sexo: l.sexo || 'M', plumaje: l.plumaje.trim(), anio: l.anio || '',
        criador: l.criador.trim(), notas: l.notas.trim(), uso: l.resultados.length ? 'competicion' : 'cria', estado: l.estado || 'palomar', creado: Date.now() };
      creados++;
    }
    cambios.set(p.id, p); registrar(p); l._id = p.id;
  }
  // 2) Padre y madre: se enlazan con el palomo que ya exista; si no existe, se crea como «pedigrí».
  for (const l of elegidos) {
    for (const [campo, idCampo, sexo] of [['padre', 'padreId', 'M'], ['madre', 'madreId', 'H']]) {
      const txt = (l[campo] || '').trim(); if (!txt) continue;
      const hijo = actual(l._id); if (hijo[idCampo] && state.palomos.has(hijo[idCampo])) continue;
      let pa = buscarPalomo(txt, txt, nuevosIds);
      if (!pa) {
        pa = { id: uid(), nombre: /\d/.test(txt) && txt.length < 14 ? '' : txt, anilla: /\d/.test(txt) && txt.length < 14 ? txt : '', sexo, uso: 'cria', estado: 'referencia', creado: Date.now() };
        cambios.set(pa.id, pa); registrar(pa); padresNuevos++;
      }
      cambios.set(hijo.id, { ...hijo, [idCampo]: pa.id });
    }
  }
  // 3) Resultados: se añaden los que no estén ya apuntados (mismo concurso, año y puesto).
  const existentes = [...state.resultados.values()];
  for (const l of elegidos) {
    for (const r of l.resultados) {
      if (!r.prueba && !r.puesto) continue;
      const repetido = existentes.concat(resultados).some(x => x.palomoId === l._id && clave(x.prueba) === clave(r.prueba) && anioRes(x) === (r.anio || 0) && Number(x.puesto || 0) === Number(r.puesto || 0));
      if (repetido) continue;
      resultados.push({ id: uid(), palomoId: l._id, prueba: r.prueba.trim(), lugar: r.lugar.trim(), puesto: r.puesto || '', anio: r.anio || '', fecha: '' });
    }
  }
  await putMany('palomos', [...cambios.values()]);
  if (resultados.length) await putMany('resultados', resultados);
  lectura.palomos = []; lectura.hojas = 0; lectura.notas = ''; lectura.errores = []; lectura.origen = '';
  app.oninput = null; app.onclick = null;
  toast([creados && `${creados} nuevos`, completados && `${completados} completados`, resultados.length && `${resultados.length} resultados`, padresNuevos && `${padresNuevos} padres de pedigrí`].filter(Boolean).join(' · ') || 'Nada nuevo que guardar');
  location.hash = '#/';
}

/* ---------- Pantalla: añadir / editar palomo ---------- */
function readImage(file, max = 900) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('imagen')); };
    img.src = url;
  });
}

function viewEditar(id) {
  const nuevo = id === 'nuevo';
  const orig = nuevo ? null : state.palomos.get(id);
  if (!nuevo && !orig) return notFound();
  const d = nuevo ? { id: uid(), sexo: 'M', uso: 'competicion', estado: 'palomar', creado: Date.now() } : { ...orig };
  if (!d.estado) d.estado = 'palomar';
  setHeader(nuevo ? 'Nuevo palomo' : 'Editar palomo', true);

  app.innerHTML = `<form id="f" autocomplete="off" novalidate>
    <label class="foto-pick"><input type="file" accept="image/*" id="ffoto" hidden><div id="fimg"></div></label>
    ${campo('nombre', 'Nombre', `<input id="nombre" value="${esc(d.nombre)}" placeholder="Ej.: Lucero" autocapitalize="words">`)}
    ${campo('anilla', 'Anilla', `<input id="anilla" value="${esc(d.anilla)}" placeholder="Ej.: AJ 140909" autocapitalize="characters">`)}
    ${etq('Sexo')}${seg('sexo', [['M', 'Macho'], ['H', 'Hembra']], d.sexo)}
    ${etq('¿Para qué lo tiene?')}${seg('uso', [['competicion', 'Competir'], ['cria', 'Criar'], ['ambos', 'Las dos']], d.uso)}
    ${campo('plumaje', 'Plumaje', `<input id="plumaje" list="plumajes" value="${esc(d.plumaje)}" placeholder="Ej.: Toscado"><datalist id="plumajes">${PLUMAJES.map(x => `<option value="${x}">`).join('')}</datalist>`)}
    ${campo('anio', 'Año de nacimiento', `<input id="anio" type="number" inputmode="numeric" min="1950" max="2100" value="${esc(d.anio)}" placeholder="Ej.: ${anioHoy()}">`)}
    ${etq('Padre')}<button type="button" class="pick" id="pk-padre"></button>
    ${etq('Madre')}<button type="button" class="pick" id="pk-madre"></button>
    ${etq('¿Dónde está?')}${seg('estado', Object.entries(ESTADO), d.estado, 'g2')}
    ${campo('criador', 'Criador', `<input id="criador" value="${esc(d.criador)}" placeholder="Quién lo crió" autocapitalize="words">`)}
    ${campo('notas', 'Notas', `<textarea id="notas" placeholder="Carácter, cómo trabaja la suelta, observaciones…">${esc(d.notas)}</textarea>`)}
    <div id="ferr"></div>
    <div class="savebar"><button class="btn" type="submit">Guardar</button></div>
    ${nuevo ? '' : '<button type="button" class="btn danger" id="del">Borrar este palomo</button>'}
  </form>`;

  const drawFoto = () => {
    $('#fimg').innerHTML = d.foto
      ? `<img src="${d.foto}" alt=""><div class="cambiar">Cambiar la foto</div>`
      : `<div class="vacio">${ic('camera')} Hacer o elegir una foto</div>`;
  };
  const drawPick = rol => {
    const p = state.palomos.get(d[rol + 'Id']);
    const b = $('#pk-' + rol);
    b.classList.toggle('set', !!p);
    b.innerHTML = p ? `${avatar(p, 's')}<span><b>${esc(nameOf(p))}</b><span class="pl">Toque para cambiar</span></span>${CHEV}`
      : `<span><b>Elegir ${rol}</b><span class="pl">Opcional</span></span>${CHEV}`;
  };
  drawFoto(); drawPick('padre'); drawPick('madre');

  wireSeg(app, d, (name, v) => {
    if (name === 'sexo' && nuevo && v === 'H' && d.uso === 'competicion') {
      d.uso = 'cria';
      app.querySelectorAll('[data-name="uso"] button').forEach(x => x.classList.toggle('on', x.dataset.v === 'cria'));
    }
  });

  $('#ffoto').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try { d.foto = await readImage(file); drawFoto(); } catch (err) { toast('No se pudo leer la foto'); }
  };
  for (const rol of ['padre', 'madre']) {
    $('#pk-' + rol).onclick = () => {
      const excluir = descendants(d.id); excluir.add(d.id);
      openPicker({
        titulo: rol === 'padre' ? 'Elegir el padre' : 'Elegir la madre',
        sexo: rol === 'padre' ? 'M' : 'H', excluir, permitirNuevo: true, permitirQuitar: true,
        onPick: pid => { d[rol + 'Id'] = pid; drawPick(rol); },
      });
    };
  }

  $('#f').onsubmit = async e => {
    e.preventDefault();
    d.nombre = $('#nombre').value.trim();
    d.anilla = $('#anilla').value.trim().toUpperCase();
    d.plumaje = $('#plumaje').value.trim();
    d.anio = $('#anio').value ? Number($('#anio').value) : '';
    d.criador = $('#criador').value.trim();
    d.notas = $('#notas').value.trim();
    const err = m => { $('#ferr').innerHTML = `<p class="err">${m}</p>`; };
    if (!d.nombre && !d.anilla) return err('Escriba al menos el nombre o la anilla.');
    if (!nuevo && orig.sexo !== d.sexo) {
      const hijos = childrenOf(d.id);
      if (hijos.length) return err(`No se puede cambiar el sexo: figura como ${orig.sexo === 'H' ? 'madre' : 'padre'} de ${hijos.length} palomo(s).`);
    }
    const repe = d.anilla && [...state.palomos.values()].find(p => p.id !== d.id && norm(p.anilla).replace(/\s+/g, '') === norm(d.anilla).replace(/\s+/g, ''));
    if (repe && !confirm(`Ya hay un palomo con la anilla ${d.anilla} (${nameOf(repe)}). ¿Guardar de todas formas?`)) return;
    d.actualizado = Date.now();
    await put('palomos', d);
    toast('Guardado');
    location.replace('#/p/' + d.id);
  };

  if (!nuevo) $('#del').onclick = () => borrarPalomo(d.id);
}
// Borra un palomo (pide confirmación): también sus resultados, y deja de figurar como padre/madre de sus hijos.
async function borrarPalomo(id) {
  const p = state.palomos.get(id); if (!p) return;
  const hijos = childrenOf(id);
  const res = resultsOf(id);
  if (!confirm(`¿Borrar la ficha de ${nameOf(p)}?\n\nSe borrarán también sus ${res.length} resultado(s)${hijos.length ? ` y dejará de figurar como padre/madre de ${hijos.length} palomo(s)` : ''}. No se puede deshacer.`)) return;
  await putMany('palomos', hijos.map(h => ({ ...h, padreId: h.padreId === id ? null : h.padreId, madreId: h.madreId === id ? null : h.madreId })));
  await delMany('resultados', res.map(r => r.id));
  await delMany('palomos', [id]);
  toast('Ficha borrada');
  location.replace('#/');
}

/* ---------- Pantalla: resultado de concurso ---------- */
function viewResultado(pid, rid) {
  const p = state.palomos.get(pid);
  if (!p) return notFound();
  const orig = rid ? state.resultados.get(rid) : null;
  if (rid && !orig) return notFound();
  const r = orig ? { ...orig } : { id: uid(), palomoId: pid, fecha: today(), anio: anioHoy() };
  if (!r.anio) r.anio = anioRes(r) || '';
  const otro = r.prueba && !PRUEBAS.includes(r.prueba);
  setHeader(orig ? 'Editar resultado' : 'Nuevo resultado', true);

  app.innerHTML = `<p class="resumen" style="margin-top:4px">${esc(nameOf(p))}</p><form id="f" novalidate>
    ${campo('prueba', 'Prueba', `<select id="prueba"><option value="">Elija la prueba…</option>
      ${PRUEBAS.map(x => `<option ${x === r.prueba ? 'selected' : ''}>${x}</option>`).join('')}
      <option value="__otro" ${otro ? 'selected' : ''}>Otra prueba…</option></select>`)}
    <input id="prueba2" class="mt" placeholder="Nombre de la prueba" value="${otro ? esc(r.prueba) : ''}" ${otro ? '' : 'hidden'}>
    ${campo('lugar', 'Lugar', `<input id="lugar" value="${esc(r.lugar)}" placeholder="Ej.: Mutxamel" autocapitalize="words">`)}
    <div class="row">
      ${campo('puesto', 'Puesto', `<input id="puesto" type="number" inputmode="numeric" min="1" value="${esc(r.puesto)}" placeholder="Ej.: 3">`)}
      ${campo('puntos', 'Puntos', `<input id="puntos" type="number" inputmode="numeric" min="0" value="${esc(r.puntos)}" placeholder="Opcional">`)}
    </div>
    ${campo('fecha', 'Fecha', `<input id="fecha" type="date" value="${esc(r.fecha)}">`)}
    <p class="hint" style="margin-left:6px">Si no recuerda el día exacto, borre la fecha y ponga solo el año.</p>
    ${campo('anio', 'Año', `<input id="anio" type="number" inputmode="numeric" min="1950" max="2100" value="${esc(r.anio)}">`)}
    ${campo('notas', 'Notas', `<textarea id="notas" placeholder="Ej.: empatado a puntos con el 2º">${esc(r.notas)}</textarea>`)}
    <div id="ferr"></div>
    <div class="savebar"><button class="btn" type="submit">Guardar resultado</button></div>
    ${orig ? '<button type="button" class="btn danger" id="del">Borrar este resultado</button>' : ''}
  </form>`;

  $('#prueba').onchange = e => { $('#prueba2').hidden = e.target.value !== '__otro'; if (!$('#prueba2').hidden) $('#prueba2').focus(); };
  $('#fecha').onchange = e => { if (e.target.value) $('#anio').value = e.target.value.slice(0, 4); };
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const sel = $('#prueba').value;
    r.prueba = sel === '__otro' ? $('#prueba2').value.trim() : sel;
    r.lugar = $('#lugar').value.trim();
    r.puesto = $('#puesto').value ? Number($('#puesto').value) : '';
    r.puntos = $('#puntos').value ? Number($('#puntos').value) : '';
    r.fecha = $('#fecha').value || '';
    r.anio = r.fecha ? Number(r.fecha.slice(0, 4)) : ($('#anio').value ? Number($('#anio').value) : '');
    r.notas = $('#notas').value.trim();
    if (!r.prueba) { $('#ferr').innerHTML = '<p class="err">Indique la prueba.</p>'; return; }
    if (!r.anio) { $('#ferr').innerHTML = '<p class="err">Indique la fecha o al menos el año.</p>'; return; }
    await put('resultados', r);
    toast('Resultado guardado');
    location.replace('#/p/' + pid);
  };
  if (orig) $('#del').onclick = async () => {
    if (!confirm('¿Borrar este resultado? No se puede deshacer.')) return;
    await delMany('resultados', [r.id]);
    toast('Borrado');
    location.replace('#/p/' + pid);
  };
}

/* ---------- Sanidad: vacunas y desparasitaciones de cada año ----------
   Cada tratamiento se guarda dentro de la ficha del palomo (`tratamientos`), así viaja solo con la copia de
   seguridad y con la sincronización. Las vacunas se consideran vigentes un año desde su fecha. */
const TRATOS = {
  paramixovirus: { nombre: 'Vacuna paramixovirus', cadaMeses: 12 },
  salmonela: { nombre: 'Vacuna salmonela', cadaMeses: 12 },
  viruela: { nombre: 'Vacuna viruela', cadaMeses: 12 },
  interna: { nombre: 'Desparasitación interna' },
  externa: { nombre: 'Desparasitación externa' },
  otro: { nombre: 'Otro tratamiento' },
};
const fechaES = f => f ? String(f).split('-').reverse().join('/') : '';
const anioTrato = t => Number(String(t.fecha || '').slice(0, 4)) || 0;
const nombreTrato = t => t.tipo === 'otro' && t.nombre ? t.nombre : (TRATOS[t.tipo] || TRATOS.otro).nombre;
const tratosDe = p => [...(p.tratamientos || [])].filter(t => !t.borrado).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
const enPalomar = () => [...state.palomos.values()].filter(p => (p.estado || 'palomar') === 'palomar').sort(byName);
const tratoDelAnio = (p, tipo, anio) => tratosDe(p).find(t => t.tipo === tipo && anioTrato(t) === anio);
// Cada cuántos meses hay que repetir cada tratamiento. Las vacunas vienen con 12; las desparasitaciones y «otro»
// no avisan hasta que el usuario lo configure (no se inventa cada cuánto toca). Se guarda en este dispositivo.
const FRECUENCIAS = [0, 1, 2, 3, 4, 6, 12, 24];
function mesesDe(tipo) {
  const c = leerJSON('sanidadFrecuencia', {});
  return tipo in c ? Number(c[tipo]) || 0 : ((TRATOS[tipo] || {}).cadaMeses || 0);
}
function sumarMeses(fecha, n) {
  const [y, m, d] = String(fecha).split('-').map(Number);
  const total = y * 12 + (m - 1) + n, ny = Math.floor(total / 12), nm = total % 12 + 1;
  const dias = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, dias)).padStart(2, '0')}`;
}
function vencimiento(t) {
  const n = mesesDe(t.tipo);
  return n > 0 && t.fecha ? sumarMeses(t.fecha, n) : null;
}
function estadoVacuna(p, tipo) {
  const t = tratosDe(p).find(x => x.tipo === tipo && x.fecha);
  if (!t) return ['sin', 'Sin apuntar'];
  const v = vencimiento(t);
  if (!v) return ['ok', 'Último: ' + fechaES(t.fecha)];
  return v < today() ? ['venc', 'Venció el ' + fechaES(v)] : ['ok', 'Al día hasta el ' + fechaES(v)];
}
// Tratamientos vencidos o que vencen pronto (solo palomos del palomar con el tratamiento ya apuntado y con frecuencia configurada).
function avisosVacunas(maxDias = 30, minDias = -Infinity) {
  const out = [], hoy = Date.parse(today());
  for (const p of enPalomar()) for (const k of Object.keys(TRATOS).filter(x => mesesDe(x) > 0)) {
    const t = tratosDe(p).find(x => x.tipo === k && x.fecha);
    if (!t) continue;
    const venc = vencimiento(t), dias = Math.round((Date.parse(venc) - hoy) / 864e5);
    if (dias <= maxDias && dias >= minDias) out.push({ tipo: k, p, venc, dias });
  }
  return out.sort((a, b) => a.dias - b.dias);
}
const textoAviso = a => a.dias < 0 ? `Venció el ${fechaES(a.venc)}` : a.dias === 0 ? 'Vence hoy' : `Vence el ${fechaES(a.venc)} (en ${a.dias} ${a.dias === 1 ? 'día' : 'días'})`;
function avisoVacunasLista() {
  const av = avisosVacunas(); if (!av.length) return '';
  const cad = av.filter(a => a.dias < 0).length, pron = av.length - cad;
  return `<a class="card warn mt aviso-vac" href="#/sanidad"><b>Tratamientos por renovar</b><span>${[cad ? `${cad} vencido${cad === 1 ? '' : 's'}` : '', pron ? `${pron} vence${pron === 1 ? '' : 'n'} en menos de un mes` : ''].filter(Boolean).join(' · ')}. Toque para ver cuáles.</span></a>`;
}
function avisoVacunasSanidad() {
  const av = avisosVacunas(); if (!av.length) return '';
  return `<div class="card warn mt"><b>Tratamientos por renovar</b>${Object.keys(TRATOS).filter(k => av.some(a => a.tipo === k)).map(k =>
    `<p class="etq" style="margin:14px 0 6px">${TRATOS[k].nombre}</p><div class="lista">${av.filter(a => a.tipo === k).map(a => filaSan(a.p, textoAviso(a))).join('')}</div>`).join('')}</div>`;
}
// Calendario: lo que vence en los 90 días siguientes (los vencidos y los de este mes ya salen en el aviso).
function calendarioSanidad() {
  const av = avisosVacunas(90, 31); if (!av.length) return '';
  return `<p class="seccion">Próximos 90 días</p><div class="lista">${av.map(a => filaSan(a.p, `${TRATOS[a.tipo].nombre} · ${textoAviso(a)}`)).join('')}</div>`;
}
const textoFrecuencia = n => n === 0 ? 'Sin aviso' : n === 12 ? 'Cada año' : n === 24 ? 'Cada 2 años' : `Cada ${n} meses`;
function ajustesFrecuencia() {
  return `<p class="seccion">Cada cuánto se repite</p><div class="card">
    <p class="muted" style="margin:0">Con esto la app avisa cuando toca repetir cada tratamiento. Solo avisa de los palomos que ya lo tienen apuntado una vez. Se guarda en este dispositivo.</p>
    ${Object.keys(TRATOS).filter(k => k !== 'otro').map(k => campo('f-' + k, TRATOS[k].nombre, `<select data-freq="${k}" id="f-${k}">${FRECUENCIAS.map(n => `<option value="${n}" ${mesesDe(k) === n ? 'selected' : ''}>${textoFrecuencia(n)}</option>`).join('')}</select>`)).join('')}
  </div>`;
}
function tratoRow(pid, t) {
  return `<a class="res" href="#/tratamiento/${pid}/${t.id}"><div class="pu">${ic('cross')}</div>
    <div class="txt"><b>${esc(nombreTrato(t))}</b><small>${esc([fechaES(t.fecha), t.producto, t.dosis && 'Dosis: ' + t.dosis, t.lote && 'Lote ' + t.lote].filter(Boolean).join(' · '))}</small>
    ${t.notas ? `<div class="nota">${esc(t.notas)}</div>` : ''}</div>${CHEV}</a>`;
}
function seccionSanidad(p) {
  const ts = tratosDe(p);
  const vac = Object.keys(TRATOS).filter(k => k !== 'otro' && (k === 'paramixovirus' || (mesesDe(k) > 0 && ts.some(t => t.tipo === k))));
  const resumen = vac.map(k => { const [c, txt] = estadoVacuna(p, k); return `<div class="dato"><span>${TRATOS[k].nombre}</span><b class="san-${c}">${txt}</b></div>`; }).join('');
  const anios = [...new Set(ts.map(anioTrato))];
  return `<p class="seccion">Sanidad${ts.length ? ' · ' + ts.length : ''}</p>
    <div class="datos san-res">${resumen}</div>
    ${anios.map(a => `<p class="anio">${a || 'Sin fecha'}</p><div class="lista">${ts.filter(t => anioTrato(t) === a).map(t => tratoRow(p.id, t)).join('')}</div>`).join('')}
    ${ts.length ? '' : '<p class="muted" style="margin:10px 6px 0">Todavía no hay vacunas ni tratamientos apuntados.</p>'}
    <a class="btn tonal mt" href="#/tratamiento/${p.id}">${ic('plus')} Apuntar vacuna o tratamiento</a>`;
}
const camposTrato = t => `${etq('¿Qué se ha puesto?')}${seg('tipo', Object.entries(TRATOS).map(([k, v]) => [k, v.nombre]), t.tipo, 'g2')}
    <div id="otro" ${t.tipo === 'otro' ? '' : 'hidden'}>${campo('nombre', '¿Cuál?', `<input id="nombre" value="${esc(t.nombre)}" placeholder="Ej.: Tricomoniasis" autocapitalize="sentences">`)}</div>
    ${campo('fecha', 'Fecha', `<input id="fecha" type="date" value="${esc(t.fecha)}">`)}
    ${campo('producto', 'Producto', `<input id="producto" value="${esc(t.producto)}" placeholder="Ej.: Colombovac PMV" autocapitalize="sentences">`)}
    <div class="row">${campo('dosis', 'Dosis', `<input id="dosis" value="${esc(t.dosis)}" placeholder="Opcional">`)}${campo('lote', 'Lote', `<input id="lote" value="${esc(t.lote)}" placeholder="Opcional" autocapitalize="characters">`)}</div>
    ${campo('notas', 'Notas', `<textarea id="notas" placeholder="Dosis, quién lo puso, observaciones…">${esc(t.notas)}</textarea>`)}`;
function leerCamposTrato(t) {
  t.nombre = t.tipo === 'otro' ? $('#nombre').value.trim() : '';
  t.fecha = $('#fecha').value; t.producto = $('#producto').value.trim(); t.notas = $('#notas').value.trim();
  t.dosis = $('#dosis').value.trim(); t.lote = $('#lote').value.trim();
  if (!t.fecha) return 'Indique la fecha.';
  if (t.tipo === 'otro' && !t.nombre) return 'Escriba cuál es el tratamiento.';
  return '';
}

function viewTratamiento(pid, tid) {
  const p = state.palomos.get(pid);
  if (!p) return notFound();
  const orig = tid ? (p.tratamientos || []).find(t => t.id === tid && !t.borrado) : null;
  if (tid && !orig) return notFound();
  const t = orig ? { ...orig } : { id: uid(), tipo: 'paramixovirus', fecha: today() };
  setHeader(orig ? 'Editar tratamiento' : 'Nuevo tratamiento', true);
  app.innerHTML = `<p class="resumen" style="margin-top:4px">${esc(nameOf(p))}</p><form id="f" novalidate>
    ${camposTrato(t)}
    <div id="ferr"></div>
    <div class="savebar"><button class="btn" type="submit">Guardar</button></div>
    ${orig ? '<button type="button" class="btn danger" id="del">Borrar este tratamiento</button>' : ''}
  </form>`;
  wireSeg(app, t, (n, v) => { if (n === 'tipo') $('#otro').hidden = v !== 'otro'; });
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const err = leerCamposTrato(t);
    if (err) { $('#ferr').innerHTML = `<p class="err">${err}</p>`; return; }
    t.modificado = Date.now();
    await put('palomos', { ...p, tratamientos: [...(p.tratamientos || []).filter(x => x.id !== t.id), t] });
    toast('Guardado');
    location.replace('#/p/' + pid);
  };
  if (orig) $('#del').onclick = async () => {
    if (!confirm('¿Borrar este tratamiento? No se puede deshacer.')) return;
    await put('palomos', { ...p, tratamientos: (p.tratamientos || []).map(x => x.id === t.id ? { ...x, borrado: true, modificado: Date.now() } : x) });
    toast('Borrado');
    location.replace('#/p/' + pid);
  };
}

// Pestaña «Sanidad»: por cada vacuna o desparasitación, quién la tiene hecha en el año y quién falta.
function filaSan(p, extra = '') {
  return `<a class="item" href="#/p/${p.id}">${avatar(p, 's')}<div class="txt"><b>${esc(nameOf(p))}</b>${extra ? `<small>${esc(extra)}</small>` : ''}</div>${CHEV}</a>`;
}
function cardSanidad(k, anio, ps) {
  const hechos = [], faltan = [];
  ps.forEach(p => { const t = tratoDelAnio(p, k, anio); (t ? hechos : faltan).push({ p, t }); });
  const pctv = ps.length ? Math.round(hechos.length / ps.length * 100) : 0;
  return `<div class="card san mt">
    <div class="san-h"><b>${TRATOS[k].nombre}</b><span class="san-n ${faltan.length ? '' : 'ok'}">${hechos.length} de ${ps.length}</span></div>
    <div class="barra"><i style="width:${pctv}%"></i></div>
    <a class="btn ${faltan.length ? '' : 'sec'} mt" href="#/sanidad/aplicar/${k}/${anio}">${ic('plus')} ${faltan.length ? `Apuntar a los ${faltan.length} que faltan` : 'Apuntar a más palomos'}</a>
    ${faltan.length ? `<details><summary>Faltan (${faltan.length})</summary><div class="lista">${faltan.map(({ p }) => filaSan(p)).join('')}</div></details>` : ''}
    ${hechos.length ? `<details><summary>Hechos (${hechos.length})</summary><div class="lista">${hechos.map(({ p, t }) => filaSan(p, [fechaES(t.fecha), t.producto].filter(Boolean).join(' · '))).join('')}</div></details>` : ''}
  </div>`;
}
function viewSanidad() {
  setHeader('Sanidad', false);
  if (!ui.anioSan) ui.anioSan = anioHoy();
  const anio = ui.anioSan, ps = enPalomar();
  app.innerHTML = `<h1 class="grande">Sanidad</h1><p class="resumen">Vacunas y desparasitaciones de cada año</p>
    ${avisoVacunasSanidad()}
    <div class="anios"><button type="button" id="aant" aria-label="Año anterior">‹</button><b>${anio}</b><button type="button" id="asig" aria-label="Año siguiente">›</button></div>
    ${ps.length ? ['paramixovirus', 'salmonela', 'viruela', 'interna', 'externa'].map(k => cardSanidad(k, anio, ps)).join('')
      : '<div class="card mt"><p class="muted">Todavía no hay palomos en el palomar.</p></div>'}
    <a class="btn tonal mt2" href="#/sanidad/aplicar/otro/${anio}">${ic('plus')} Apuntar otro tratamiento a varios</a>
    ${calendarioSanidad()}${ajustesFrecuencia()}`;
  app.querySelectorAll('[data-freq]').forEach(sel => { sel.onchange = () => { const c = leerJSON('sanidadFrecuencia', {}); c[sel.dataset.freq] = Number(sel.value); guardarJSON('sanidadFrecuencia', c); toast('Guardado'); viewSanidad(); }; });
  $('#aant').onclick = () => { ui.anioSan--; viewSanidad(); };
  $('#asig').onclick = () => { ui.anioSan++; viewSanidad(); };
}

// Apuntar la misma vacuna o tratamiento a varios palomos de una vez (por ejemplo, la vacuna de todo el palomar).
function viewAplicar(tipo, anio) {
  const hoy = anioHoy();
  const d = { tipo: TRATOS[tipo] ? tipo : 'paramixovirus', fecha: anio && Number(anio) !== hoy ? `${Number(anio)}-01-01` : today() };
  const ps = enPalomar();
  let sel = new Set();
  const reiniciar = () => { const a = Number(String(d.fecha).slice(0, 4)); sel = new Set(ps.filter(p => !tratoDelAnio(p, d.tipo, a)).map(p => p.id)); };
  reiniciar();
  setHeader('Apuntar a varios', true);
  app.innerHTML = `<p class="resumen" style="margin-top:4px">La misma vacuna o tratamiento para varios palomos</p><form id="f" novalidate>
    ${camposTrato(d)}
    ${etq('¿A cuáles?')}
    <div class="row"><button type="button" class="btn sec" id="todos">Todos</button><button type="button" class="btn sec" id="ninguno">Ninguno</button></div>
    <div class="lista mt" id="pl"></div>
    <div id="ferr"></div>
    <div class="savebar"><button class="btn" type="submit" id="ok"></button></div></form>`;
  const pintar = () => {
    const a = Number(String(d.fecha).slice(0, 4));
    $('#pl').innerHTML = ps.map(p => `<label class="item sel"><input type="checkbox" data-id="${p.id}" ${sel.has(p.id) ? 'checked' : ''}>
      ${avatar(p, 's')}<div class="txt"><b>${esc(nameOf(p))}</b>${tratoDelAnio(p, d.tipo, a) ? `<small>Ya apuntado en ${a}</small>` : ''}</div></label>`).join('')
      || '<p class="muted" style="padding:16px">No hay palomos en el palomar.</p>';
    $('#ok').textContent = sel.size ? `Apuntar a ${sel.size} ${sel.size === 1 ? 'palomo' : 'palomos'}` : 'Elija algún palomo';
    $('#ok').disabled = !sel.size;
  };
  pintar();
  wireSeg(app, d, (n, v) => { if (n === 'tipo') { $('#otro').hidden = v !== 'otro'; reiniciar(); pintar(); } });
  $('#fecha').onchange = e => { d.fecha = e.target.value; reiniciar(); pintar(); };
  $('#pl').onchange = e => {
    const c = e.target.closest('input[data-id]'); if (!c) return;
    c.checked ? sel.add(c.dataset.id) : sel.delete(c.dataset.id);
    pintar();
  };
  $('#todos').onclick = () => { sel = new Set(ps.map(p => p.id)); pintar(); };
  $('#ninguno').onclick = () => { sel = new Set(); pintar(); };
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const err = leerCamposTrato(d);
    if (err) { $('#ferr').innerHTML = `<p class="err">${err}</p>`; return; }
    const { tipo, nombre, fecha, producto, notas, dosis, lote } = d;
    await putMany('palomos', ps.filter(p => sel.has(p.id)).map(p => ({ ...p, tratamientos: [...(p.tratamientos || []), { id: uid(), tipo, nombre, fecha, producto, notas, dosis, lote, modificado: Date.now() }] })));
    toast(`Apuntado a ${sel.size} ${sel.size === 1 ? 'palomo' : 'palomos'}`);
    location.replace('#/sanidad');
  };
}

/* ---------- Por completar: qué datos faltan (sin inventar nada) ---------- */
function datosPorCompletar() {
  const vivos = [...state.palomos.values()].filter(p => ['palomar', 'historico'].includes(p.estado || 'palomar')).sort(byName);
  const sinPuesto = [...state.resultados.values()].filter(r => !(Number(r.puesto) > 0) && state.palomos.has(r.palomoId));
  return [
    ['Sin año de nacimiento', vivos.filter(p => !p.anio)],
    ['Sin padre o madre apuntados', vivos.filter(p => !p.padreId || !p.madreId)],
    ['Sin anilla', vivos.filter(p => !p.anilla)],
    ['Sin plumaje', vivos.filter(p => !p.plumaje)],
  ].filter(([, l]) => l.length).concat(sinPuesto.length ? [['Resultados sin puesto', sinPuesto]] : []);
}
const totalPorCompletar = () => new Set(datosPorCompletar().flatMap(([t, l]) => t === 'Resultados sin puesto' ? [] : l.map(p => p.id))).size
  + (datosPorCompletar().find(([t]) => t === 'Resultados sin puesto') || [0, []])[1].length;
function viewCompletar() {
  setHeader('Por completar', true);
  const grupos = datosPorCompletar();
  app.innerHTML = `<h1 class="grande">Por completar</h1><p class="resumen">Datos que faltan en sus palomos</p>
    <p class="muted" style="margin:0 6px 4px">Cuantos más datos apunte (padres, año, resultados), más fiables son el pedigrí y las estimaciones de cría. Toque un palomo para completarlo.</p>
    ${grupos.length ? grupos.map(([titulo, l]) => `<p class="seccion">${titulo} · ${l.length}</p><div class="lista">${l.map(x => titulo === 'Resultados sin puesto'
      ? `<a class="item" href="#/resultado/${x.palomoId}/${x.id}"><div class="txt"><b>${esc(nameOf(state.palomos.get(x.palomoId)))}</b><small>${esc([x.prueba, x.lugar, anioRes(x) || ''].filter(Boolean).join(' · '))}</small></div>${CHEV}</a>`
      : `<a class="item" href="#/editar/${x.id}">${avatar(x, 's')}<div class="txt"><b>${esc(nameOf(x))}</b><small>${esc([x.nombre ? x.anilla : '', ESTADO[x.estado || 'palomar']].filter(Boolean).join(' · '))}</small></div>${CHEV}</a>`).join('')}</div>`).join('')
      : '<div class="card mt2"><p style="margin:0"><b>No falta ningún dato.</b> Todos sus palomos tienen año, padres, anilla, plumaje y puesto en los resultados.</p></div>'}`;
}

/* ---------- Concursos: resultados por año, prueba y lugar ---------- */
function viewConcursos() {
  setHeader('Concursos', true);
  const todos = [...state.resultados.values()].filter(r => state.palomos.has(r.palomoId));
  const anios = [...new Set(todos.map(anioRes).filter(Boolean))].sort((a, b) => b - a);
  if (!anios.length) { app.innerHTML = '<h1 class="grande">Concursos</h1><div class="card mt2"><p style="margin:0" class="muted">Todavía no hay resultados apuntados. Se añaden desde la ficha de cada palomo.</p></div>'; return; }
  if (!anios.includes(ui.anioCon)) ui.anioCon = anios[0];
  const delAnio = todos.filter(r => anioRes(r) === ui.anioCon);
  const grupos = new Map();
  for (const r of delAnio) { const k = [r.prueba || 'Sin prueba', r.lugar || ''].join('|'); (grupos.get(k) || grupos.set(k, []).get(k)).push(r); }
  const mejor = Math.min(...delAnio.map(r => Number(r.puesto) || Infinity));
  app.innerHTML = `<h1 class="grande">Concursos</h1><p class="resumen">${delAnio.length} ${delAnio.length === 1 ? 'resultado' : 'resultados'} en ${ui.anioCon}${Number.isFinite(mejor) ? ` · mejor puesto ${mejor}º` : ''}</p>
    ${chips('anioCon', anios.map(a => [String(a), String(a)]), String(ui.anioCon))}
    ${[...grupos.entries()].sort((a, b) => Math.min(...b[1].map(r => pesoPrueba(r.prueba))) - Math.min(...a[1].map(r => pesoPrueba(r.prueba))) || a[0].localeCompare(b[0], 'es')).map(([k, rs]) => {
      const [prueba, lugar] = k.split('|');
      return `<p class="seccion">${esc(prueba)}${lugar ? ' · ' + esc(lugar) : ''}</p><div class="lista">${rs.sort((a, b) => (Number(a.puesto) || 999) - (Number(b.puesto) || 999)).map(r => {
        const p = state.palomos.get(r.palomoId), n = Number(r.puesto);
        return `<a class="res" href="#/p/${p.id}"><div class="pu ${n >= 1 && n <= 3 ? 'p' + n : ''}">${n ? n + 'º' : ic('trophy')}</div><div class="txt"><b>${esc(nameOf(p))}</b><small>${esc([r.puntos ? r.puntos + ' puntos' : '', r.notas].filter(Boolean).join(' · '))}</small></div>${CHEV}</a>`;
      }).join('')}</div>`;
    }).join('')}`;
  wireSeg(app, ui, (n, v) => { if (n === 'anioCon') { ui.anioCon = Number(v); viewConcursos(); } });
}

/* ---------- Instalar en el móvil: código QR con la dirección de la app ---------- */
const direccionApp = () => location.protocol.startsWith('http') ? location.origin + location.pathname.replace(/index\.html$/, '') : '';
function viewInstalar() {
  setHeader('Instalar en el móvil', true);
  const url = direccionApp();
  let qr = '';
  try { if (url && window.qrcode) { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 6, margin: 4, scalable: true }); } } catch (e) { /* sin QR */ }
  app.innerHTML = `<h1 class="grande">En el móvil</h1><p class="resumen">Instale la app para abrirla como cualquier otra</p>
    ${qr ? `<div class="card qr">${qr}<p class="muted" style="margin:10px 0 0;text-align:center">Apunte la cámara del móvil a este código</p></div>` : ''}
    ${url ? `<div class="card mt"><div class="dato" style="padding:0"><span>Dirección</span><b>${esc(url)}</b></div></div>` : ''}
    <p class="seccion">Pasos</p>
    <div class="card"><ol class="pasos">
      <li>Abra la dirección en <b>Chrome</b> (Android) o en <b>Safari</b> (iPhone).</li>
      <li>Android: menú <b>⋮</b> → <b>Añadir a pantalla de inicio</b> (o <b>Instalar aplicación</b>). iPhone: botón compartir → <b>Añadir a pantalla de inicio</b>.</li>
      <li>Abra la app y entre con su correo. Si es su primera vez, pida el código.</li>
    </ol></div>`;
}

/* ---------- Pantalla: árbol genealógico ---------- */
function viewArbol(id) {
  const p = state.palomos.get(id);
  if (!p) return notFound();
  setHeader('Árbol genealógico', true);
  const node = (pid, label, childId, size) => {
    const x = state.palomos.get(pid);
    if (!x) {
      return childId
        ? `<a class="tn empty ${size}" href="#/editar/${childId}"><span class="tl">${label}</span><span>No se sabe</span><span class="add">+ Añadir</span></a>`
        : `<div class="tn empty ${size}"><span class="tl">${label}</span><span>—</span></div>`;
    }
    const r = bestResult(x.id);
    const meta = esc([x.nombre ? x.anilla : '', x.plumaje].filter(Boolean).join(' · '));
    const gx = genDe(x.id);
    const inner = `<span class="tl">${label}</span><b>${esc(nameOf(x))}</b>${meta ? `<span class="tm">${meta}</span>` : ''}${gx && gx.conDatos ? `<span class="tm"><span class="mini-est${gx.fiab < 0.35 ? ' poca' : ''}">${estrellas(gx.indice)}</span> índice ${gx.indice}</span>` : ''}${r && Number(r.puesto) ? `<span class="medalla">${esc(resumenRes(r))}</span>` : ''}`;
    return size === 'l'
      ? `<a class="tn l" href="#/arbol/${x.id}">${avatar(x, 's')}<div>${inner}</div></a>`
      : `<a class="tn ${size}" href="#/arbol/${x.id}">${inner}</a>`;
  };
  const branch = (parentId, rol) => {
    const par = state.palomos.get(parentId);
    const gps = par ? parents(par.id) : [null, null];
    const ggs = gps.flatMap(g => (g && state.palomos.has(g)) ? parents(g) : [null, null]);
    return `<p class="seccion">${rol === 'Padre' ? 'Línea del padre' : 'Línea de la madre'}</p>
      ${node(parentId, rol, id, 'l')}
      <div class="gen">${node(gps[0], 'Abuelo', par && par.id, 'sm')}${node(gps[1], 'Abuela', par && par.id, 'sm')}</div>
      <div class="gen">${ggs.map((g, i) => node(g, i % 2 ? 'Bisabuela' : 'Bisabuelo', state.palomos.has(gps[i >> 1]) ? gps[i >> 1] : null, 'sm')).join('')}</div>`;
  };
  const F = p.padreId && p.madreId ? kinship(p.padreId, p.madreId) : null;
  app.innerHTML = `<div class="lista mt">${card(p)}</div>
    <p class="hint" style="margin:10px 6px 0">Toque cualquier antepasado para ver su propio árbol, o «Añadir» para completar los huecos.</p>
    ${branch(p.padreId, 'Padre')}${branch(p.madreId, 'Madre')}
    ${F !== null ? inbreedBox(F, 'Consanguinidad de ' + esc(nameOf(p))) : ''}`;
}

/* ---------- Pantalla: árbol de la pareja (probabilidades) ----------
   Arriba el pichón esperado; debajo el padre y la madre; debajo de cada uno, sus padres.
   En cada palomo: estrellas, índice genético y probabilidad de quedar entre los 10 primeros en un comarcal.
   Las uniones dicen cuánto aporta cada uno a la genética del pichón (padres 50 %, abuelos 25 %). */
function nodoProb(id, papel, aporte, pequeno = false) {
  const x = state.palomos.get(id);
  if (!x) {
    return `<div class="tp-nodo vacio${pequeno ? ' pq' : ''}"><span class="tp-papel">${papel}</span><b>No se sabe</b><span class="tp-dato">Sin datos</span></div>`;
  }
  const g = genDe(id), f = fuerza(id);
  const comarcal = f ? probConcursos(f)[0] : null;
  return `<a class="tp-nodo${pequeno ? ' pq' : ''}" href="#/p/${x.id}">
    <span class="tp-papel">${papel}</span>
    <b>${esc(nameOf(x))}</b>
    ${g && g.conDatos
      ? `<span class="tp-est${g.fiab < 0.35 ? ' poca' : ''}">${estrellas(g.indice)}</span><span class="tp-dato">Índice <b>${g.indice}</b> · fiab. ${textoFiab(g.fiab)}</span>`
      : '<span class="tp-dato">Sin datos para estimar</span>'}
    ${comarcal && !pequeno ? `<span class="tp-dato">Comarcal: <b>${fmtPct(comarcal.diez)}</b> entre los 10 primeros</span>` : ''}
  </a>`;
}
function arbolPareja(m, h, { abuelos = true, puesto = 0, aviso = '' } = {}) {
  const pm = state.palomos.get(m), ph = state.palomos.get(h);
  const r = prediccionPareja(m, h);
  // El pichón: fuerza esperada a partir de la genética de los padres; incertidumbre completa (aún no ha competido).
  const pichon = probConcursos({ valor: -0.3 + 2 * r.media, varianza: 1 });
  const pct = Math.round(r.prob * 100);
  const linea = (padre, papel) => {
    const [ab, aa] = parents(padre);
    return `<div class="tp-col">
      <div class="tp-une"><span>50 %</span></div>
      ${nodoProb(padre, papel, '50 %', !abuelos)}
      ${abuelos ? `<div class="tp-une dos"><span>25 %</span><span>25 %</span></div>
      <div class="tp-abuelos">${nodoProb(ab, 'Abuelo', '25 %', true)}${nodoProb(aa, 'Abuela', '25 %', true)}</div>` : ''}
    </div>`;
  };
  return `<div class="tp${abuelos ? '' : ' compacto'}">
    ${puesto ? `<div class="tp-puesto">${puesto === 1 ? 'La pareja más compatible' : `${puesto}ª pareja más compatible`}</div>` : ''}
    <a class="tp-hijo" href="#/arbolpareja/${m}/${h}">
      <span class="tp-papel">Pichón de ${esc(nameOf(pm))} × ${esc(nameOf(ph))}</span>
      <div class="tp-grande">${pct} %</div>
      <p>de que quede en el <b>25 % mejor</b> <span class="tp-ref">(un pichón cualquiera: 25 %)</span></p>
      <div class="tp-barra"><span style="width:${pct}%"></span><i style="left:25%"></i></div>
      <div class="tp-chips">
        <span>Comarcal: <b>${fmtPct(pichon[0].diez)}</b> entre los 10 primeros</span>
        <span>Regional: <b>${fmtPct(pichon[2].diez)}</b></span>
        <span>Consanguinidad: <b>${(r.F * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</b></span>
        <span class="fiab f-${textoFiab(r.fiab)}">Fiabilidad ${textoFiab(r.fiab)}</span>
      </div>
    </a>
    <div class="tp-tronco"></div>
    <div class="tp-padres">${linea(m, 'Padre')}${linea(h, 'Madre')}</div>
    ${aviso}
  </div>`;
}
function viewArbolPareja(m, h) {
  if (!state.palomos.has(m) || !state.palomos.has(h)) return notFound();
  setHeader('Árbol de la pareja', true);
  app.innerHTML = `<div>${arbolPareja(m, h)}
    <p class="hint" style="margin:16px 6px 0">Toque cualquier palomo para ver su ficha. Cada pichón hereda la mitad de su padre y la mitad de su madre, y una cuarta parte de cada abuelo. Son estimaciones: cuantos más resultados y familia se apunten, más fiables.</p>
    <a class="btn sec mt" href="#/cria">Volver a las parejas</a>
  </div>`;
}

/* ---------- Pantalla: árbol genealógico y líneas familiares ----------
   Líneas: cada «fundador» (palomo sin padres apuntados con varios descendientes) abre una línea con su color.
   Árbol: cuatro generaciones en forma de llave (como los pedigríes en papel), con el color de su línea.
   Compatibilidad: cuadro machos × hembras con la probabilidad de que los pichones queden en el 25 % mejor. */
const COLORES_LINEA = ['#b4532a', '#3e7a5c', '#3b6896', '#8b5a9e', '#b08a2c', '#9b3f4a'];
function lineasFamiliares() {
  const todos = [...state.palomos.values()];
  const candidatos = todos.filter(p => { const [s, d] = parents(p.id); return !state.palomos.has(s) && !state.palomos.has(d); })
    .map(p => ({ p, desc: descendants(p.id) }))
    .filter(x => x.desc.size >= 2)
    .sort((a, b) => b.desc.size - a.desc.size || (a.p.sexo === 'H') - (b.p.sexo === 'H') || byName(a.p, b.p));
  const lineas = [];
  for (const c of candidatos) {
    // Si sus descendientes ya están todos en otra línea (p. ej. la pareja del fundador), no abre línea nueva.
    if (lineas.some(l => [...c.desc].every(id => l.desc.has(id)))) continue;
    lineas.push({ ...c, color: COLORES_LINEA[lineas.length] });
    if (lineas.length === COLORES_LINEA.length) break;
  }
  return lineas;
}
function lineasDe(id, lineas) {
  return lineas.filter(l => l.p.id === id || l.desc.has(id));
}
function nodoPed(id, gen, lineas, papel) {
  const x = state.palomos.get(id);
  if (!x) return `<div class="ped-n vacio g${gen}"><span class="ped-papel">${papel}</span><b>No se sabe</b></div>`;
  const ls = lineasDe(id, lineas), g = genDe(id), r = bestResult(id);
  const pu = r && Number(r.puesto);
  return `<a class="ped-n g${gen}" href="#/p/${x.id}" style="--lc:${ls[0] ? ls[0].color : '#cfc9be'}">
    <span class="ped-papel">${papel}${ls.length ? `<span class="ped-dots">${ls.map(l => `<i style="background:${l.color}"></i>`).join('')}</span>` : ''}</span>
    <b>${esc(nameOf(x))}</b>
    ${g && g.conDatos ? `<span class="ped-dato"><span class="tp-est${g.fiab < 0.35 ? ' poca' : ''}">${estrellas(g.indice)}</span> ${g.indice}</span>` : ''}
    ${pu && gen < 3 ? `<span class="ped-dato">${pu}º · ${esc(r.prueba || '')} ${anioRes(r) || ''}</span>` : ''}
  </a>`;
}
function arbolLlave(id, lineas) {
  // Posiciones: generación g, índice i → filas (i·8/2^g)+1 de un total de 8.
  const ids = [[id]];
  for (let g = 1; g <= 3; g++) ids.push(ids[g - 1].flatMap(x => (x && state.palomos.has(x) ? parents(x) : [null, null]).map(v => v || null)));
  const papel = (g, i) => g === 0 ? 'Palomo' : g === 1 ? (i ? 'Madre' : 'Padre') : g === 2 ? (i % 2 ? 'Abuela' : 'Abuelo') : (i % 2 ? 'Bisabuela' : 'Bisabuelo');
  let html = '';
  for (let g = 0; g <= 3; g++) {
    const span = 8 >> g;
    ids[g].forEach((x, i) => {
      const fila = `grid-row:${i * span + 1} / span ${span}`;
      html += `<div class="ped-c" style="grid-column:${g * 2 + 1};${fila}">${nodoPed(x, g, lineas, papel(g, i))}</div>`;
      if (g < 3 && x && state.palomos.has(x)) html += `<div class="ped-llave" style="grid-column:${g * 2 + 2};${fila}"></div>`;
    });
  }
  return `<div class="ped-wrap"><div class="ped">${html}</div></div>`;
}
function cuadroCompatibilidad() {
  const enPalomar = p => (p.estado || 'palomar') === 'palomar';
  const todos = [...state.palomos.values()];
  const porIndice = (a, b) => ((genDe(b.id) || {}).indice || 0) - ((genDe(a.id) || {}).indice || 0) || byName(a, b);
  const machos = todos.filter(p => p.sexo !== 'H' && enPalomar(p)).sort(porIndice);
  const hembrasPalomar = todos.filter(p => p.sexo === 'H' && enPalomar(p));
  const deCasa = hembrasPalomar.length > 0;
  const hembras = (deCasa ? hembrasPalomar : todos.filter(p => p.sexo === 'H' && p.estado === 'referencia')).sort(porIndice);
  if (!machos.length || !hembras.length) return '<div class="card"><p class="muted" style="margin:0">Para ver la compatibilidad hacen falta machos y hembras apuntados.</p></div>';
  // Sin desplazamiento lateral: una tarjeta por macho (se abre tocando) con sus hembras de mejor a peor.
  const pctTxt = r => Math.round(r.prob * 100);
  const claseDe = r => r.F >= 0.125 ? 'par' : pctTxt(r) >= 55 ? 'alta' : pctTxt(r) >= 40 ? 'media' : 'baja';
  const tarjetas = machos.map((m, i) => {
    const celdas = hembras.map(h => ({ h, r: prediccionPareja(m.id, h.id) }))
      .sort((a, b) => (a.r.F >= 0.125) - (b.r.F >= 0.125) || b.r.prob - a.r.prob);
    const top = celdas.find(c => c.r.F < 0.125);
    return `<details class="cm"${i === 0 ? ' open' : ''}>
      <summary><div class="cm-cab"><b>${esc(nameOf(m))}</b>
        ${top ? `<small>Mejor con <b>${esc(nameOf(top.h))}</b></small>` : '<small>Sin pareja posible</small>'}</div>
        ${top ? `<span class="cc ${claseDe(top.r)} cm-pct">${pctTxt(top.r)}<small>%</small></span>` : ''}<span class="cm-flecha" aria-hidden="true"></span></summary>
      <div class="cm-rejilla">${celdas.map(({ h, r }, k) => `<a class="cm-celda cc ${claseDe(r)}${k === 0 && r.F < 0.125 ? ' mejor' : ''}" href="#/arbolpareja/${m.id}/${h.id}">
        <span class="cm-h">${esc(nameOf(h))}</span>
        <span class="cm-v">${r.F >= 0.125 ? 'Parientes' : `${pctTxt(r)}<small>%</small>`}</span></a>`).join('')}</div>
      <a class="cm-ficha" href="#/p/${m.id}">Ver la ficha de ${esc(nameOf(m))} ›</a>
    </details>`;
  }).join('');
  return `${deCasa ? '' : `<div class="card warn" style="margin-bottom:12px"><b>Hembras de pedigrí, solo como orientación.</b><p style="margin:6px 0 0">Aún no hay hembras en su palomar, así que el cuadro usa las madres y abuelas del pedigrí. Cuando apunte sus hembras, el cuadro mostrará las suyas.</p><a class="btn sec mt" href="#/editar/nuevo">${ic('plus')} Añadir una hembra</a></div>`}
    <div class="cc-leyenda" style="margin:0 6px 12px"><span><i class="cc alta"></i>Muy buena (55 % o más)</span><span><i class="cc media"></i>Buena (40–54 %)</span><span><i class="cc baja"></i>Normal</span><span><i class="cc par"></i>Demasiado parientes</span></div>
    <div class="cms">${tarjetas}</div>
    <p class="hint" style="margin:10px 6px 0">Toque un macho para ver todas sus hembras, de mejor a peor. Cada número es la probabilidad de que el pichón quede en el 25 % mejor (un pichón cualquiera: 25 %). Toque una casilla para ver el árbol de la pareja.</p>`;
}
function viewFamilias(sel) {
  setHeader('Árbol y familias', false);
  const lineas = lineasFamiliares();
  const enPalomar = [...state.palomos.values()].filter(p => (p.estado || 'palomar') === 'palomar')
    .sort((a, b) => ((genDe(b.id) || {}).indice || 0) - ((genDe(a.id) || {}).indice || 0) || byName(a, b));
  const actual = sel && state.palomos.has(sel) ? sel : (enPalomar[0] || [...state.palomos.values()][0] || {}).id;
  const lineasHtml = lineas.length ? `<div class="lineas">${lineas.map(l => {
    const enCasa = [...l.desc].map(id => state.palomos.get(id)).filter(p => p && (p.estado || 'palomar') === 'palomar');
    const conPuesto = [...l.desc].map(id => ({ id, r: bestResult(id) })).filter(x => x.r && Number(x.r.puesto) > 0).sort((a, b) => a.r.puesto - b.r.puesto);
    const top = conPuesto[0];
    return `<div class="linea" style="--lc:${l.color}">
      <div class="linea-cab"><span class="linea-punto"></span><div><small>Línea de</small><a href="#/familias/${l.p.id}"><b>${esc(nameOf(l.p))}</b></a></div></div>
      <p class="linea-num">${l.desc.size} descendientes apuntados${enCasa.length ? ` · <b>${enCasa.length} en su palomar</b>` : ''}</p>
      ${top ? `<p class="linea-num">Mejor resultado: <b>${esc(nameOf(state.palomos.get(top.id)))}</b>, ${top.r.puesto}º ${esc(top.r.prueba || '')} ${anioRes(top.r) || ''}</p>` : ''}
      ${enCasa.length ? `<div class="linea-chips">${enCasa.map(p => `<a href="#/familias/${p.id}">${esc(nameOf(p))}</a>`).join('')}</div>` : ''}
    </div>`;
  }).join('')}</div>` : '<div class="card"><p class="muted" style="margin:0">Apunte el padre y la madre de sus palomos para ver sus líneas familiares.</p></div>';
  app.innerHTML = `<h1 class="grande">Árbol y familias</h1><p class="resumen">Árbol genealógico y líneas familiares</p>
    <p class="seccion">Árbol genealógico</p>
    <div class="selector">${enPalomar.map(p => `<a class="${p.id === actual ? 'on' : ''}" href="#/familias/${p.id}">${esc(nameOf(p))}</a>`).join('')}
      ${actual && !enPalomar.some(p => p.id === actual) ? `<a class="on" href="#/familias/${actual}">${esc(nameOf(state.palomos.get(actual)))}</a>` : ''}</div>
    ${actual ? arbolLlave(actual, lineas) : ''}
    ${lineas.length ? `<div class="ped-leyenda">${lineas.map(l => `<span><i style="background:${l.color}"></i>${esc(nameOf(l.p))}</span>`).join('')}</div>` : ''}
    <p class="hint" style="margin:6px 6px 0">Deslice el árbol hacia la izquierda para ver abuelos y bisabuelos. El color de cada palomo indica de qué línea viene; toque uno para ver su ficha.</p>
    <p class="seccion">Líneas familiares</p>
    ${lineasHtml}
    <p class="seccion">Compatibilidad entre machos y hembras</p>
    ${cuadroCompatibilidad()}`;
  const s = app.querySelector('.selector .on'); if (s) s.scrollIntoView({ inline: 'center', block: 'nearest' });
  window.scrollTo(0, 0);
}

/* ---------- Pantalla: cría ---------- */
const pareja = { m: null, h: null };
function viewCria() {
  setHeader('Cría', false);
  // Reproductores: los que crían en el palomar y cualquiera con hijos apuntados.
  const repro = [...state.palomos.values()].filter(p => childrenOf(p.id).length || (['cria', 'ambos'].includes(p.uso) && (p.estado || 'palomar') === 'palomar'))
    .map(p => {
      const hijos = childrenOf(p.id);
      const conRes = hijos.filter(h => resultsOf(h.id).length);
      const mejores = conRes.map(h => ({ h, r: bestResult(h.id) })).filter(x => Number(x.r.puesto) > 0).sort((a, b) => a.r.puesto - b.r.puesto);
      return { p, hijos, conRes, mejor: mejores[0] };
    })
    .map(x => ({ ...x, g: genDe(x.p.id) }))
    .sort((a, b) => (b.g.conDatos ? b.g.ebv : -9) - (a.g.conDatos ? a.g.ebv : -9) || b.conRes.length - a.conRes.length || b.hijos.length - a.hijos.length || byName(a.p, b.p));

  app.innerHTML = `<h1 class="grande">Cría</h1><p class="resumen">Las parejas más compatibles de su palomar</p>
    <div id="recom"></div>
    <p class="seccion">Comprobar otra pareja</p>
    <p class="muted" style="margin:0 6px 12px">Si quiere probar una pareja distinta, elija un macho y una hembra para ver qué se puede esperar de sus pichones y su consanguinidad.</p>
    <button type="button" class="pick" id="pm"></button>
    <button type="button" class="pick mt" id="ph"></button>
    <div id="pres"></div>
    <p class="seccion">Mis reproductores</p>
    <p class="muted" style="margin:0 6px 12px">Ordenados por su valor genético estimado: lo que se espera que transmitan a sus pichones.</p>
    ${repro.length ? `<div class="lista">${repro.map(x => `<a class="item" href="#/p/${x.p.id}">${avatar(x.p)}<div class="txt">
        <b>${esc(nameOf(x.p))}${x.g.conDatos ? ` <span class="mini-est${x.g.fiab < 0.35 ? ' poca' : ''}">${estrellas(x.g.indice)}</span>` : ''}</b>
        <small>${x.g.conDatos ? `Índice ${x.g.indice} · fiabilidad ${textoFiab(x.g.fiab)} · ` : 'Sin datos para estimar · '}${sexoTxt(x.p)} · ${x.hijos.length} ${x.hijos.length === 1 ? 'hijo' : 'hijos'} · ${x.conRes.length} con resultados</small>
        ${x.mejor ? `<span class="medalla">Mejor hijo: ${esc(nameOf(x.mejor.h))} · ${x.mejor.r.puesto}º</span>` : ''}
      </div>${CHEV}</a>`).join('')}</div>` : '<div class="card"><p class="muted">Aún no hay reproductores. Marque palomos como «Criar» o «Las dos», o apunte el padre y la madre de sus palomos.</p></div>'}`;

  const drawPick = (k, label) => {
    const p = state.palomos.get(pareja[k]);
    const b = $(k === 'm' ? '#pm' : '#ph');
    b.classList.toggle('set', !!p);
    b.innerHTML = p ? `${avatar(p, 's')}<span><span class="pl">${label}</span><b>${esc(nameOf(p))}</b></span>${CHEV}` : `<span><b>Elegir ${label.toLowerCase()}</b><span class="pl">Toque aquí</span></span>${CHEV}`;
  };
  const drawRes = () => {
    if (!pareja.m || !pareja.h || !state.palomos.has(pareja.m) || !state.palomos.has(pareja.h)) { $('#pres').innerHTML = ''; return; }
    const F = kinship(pareja.m, pareja.h);
    const comunes = commonAncestors(pareja.m, pareja.h);
    // Mostrar solo los antepasados comunes más cercanos (no los que vienen detrás de otro común).
    const cercanos = comunes.filter(c => !comunes.some(o => o.id !== c.id && ancestorsMap(o.id).has(c.id)));
    const extra = cercanos.length
      ? `<p>Antepasados en común: <b>${cercanos.slice(0, 4).map(c => esc(nameOf(state.palomos.get(c.id)))).join(', ')}</b>.</p>`
      : '<p>No tienen antepasados en común apuntados.</p>';
    $('#pres').innerHTML = `<a class="btn mt" href="#/arbolpareja/${pareja.m}/${pareja.h}">${ic('tree')} Ver el árbol de la pareja</a>` + tarjetaPareja(pareja.m, pareja.h) + inbreedBox(F, 'Consanguinidad de los pichones', extra);
  };
  drawPick('m', 'Macho'); drawPick('h', 'Hembra'); drawRes();
  // Parejas recomendadas: al tocar una se carga en «Comprobar una pareja».
  const rec = parejasRecomendadas();
  const avisoHembras = rec.hembrasPalomar === 0
    ? `<div class="card warn" style="margin-bottom:10px"><b>Aún no hay hembras en su palomar.</b><p style="margin:6px 0 0">Mientras tanto, las parejas usan sus machos con las hembras del pedigrí (de otros criadores), solo como orientación. Cuando apunte sus hembras de cría, con su padre y su madre si los sabe, las parejas serán las de verdad.</p><a class="btn sec mt" href="#/editar/nuevo">${ic('plus')} Añadir una hembra</a></div>`
    : '';
  const avisoPedigri = x => x.h.estado === 'referencia' || x.m.estado === 'referencia'
    ? '<span class="medalla gris tp-aviso">Incluye un palomo de pedigrí: compruebe que lo tiene</span>' : '';
  const arboles = rec.lista.slice(0, 3), resto = rec.lista.slice(3);
  $('#recom').innerHTML = avisoHembras + (rec.lista.length
    ? arboles.map((x, i) => arbolPareja(x.m.id, x.h.id, { abuelos: i === 0, puesto: i + 1, aviso: avisoPedigri(x) })).join('<div class="tp-sep"></div>')
      + (resto.length ? `<p class="seccion">Otras parejas buenas</p><div class="lista">${resto.map((x, i) => `<a class="item rec" href="#/arbolpareja/${x.m.id}/${x.h.id}">
        <div class="rec-n">${i + 4}</div>
        <div class="txt"><b>${esc(nameOf(x.m))} × ${esc(nameOf(x.h))}</b>
          <small>${Math.round(x.prob * 100)} % de pichones en el 25 % mejor · consanguinidad ${(x.F * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} % · fiabilidad ${textoFiab(x.fiab)}</small>
          ${avisoPedigri(x)}
        </div>${CHEV}</a>`).join('')}</div>` : '')
      + `<p class="hint" style="margin:10px 6px 0">La app prueba todas las combinaciones de machos y hembras y muestra las que dan mejores pichones. Se descartan las parejas con consanguinidad alta (medio hermanos o más cercanos). Toque un pichón para ver el árbol completo, o un palomo para ver su ficha.</p>`
    : '<div class="card"><p class="muted" style="margin:0">Todavía no hay datos suficientes para recomendar parejas. Apunte sus machos y hembras de cría y los resultados de sus familias.</p></div>');
  $('#pm').onclick = () => openPicker({ titulo: 'Elegir el macho', sexo: 'M', onPick: id => { pareja.m = id; drawPick('m', 'Macho'); drawRes(); } });
  $('#ph').onclick = () => openPicker({ titulo: 'Elegir la hembra', sexo: 'H', onPick: id => { pareja.h = id; drawPick('h', 'Hembra'); drawRes(); } });
}

/* ---------- Pantalla: copia de seguridad ---------- */
// Entrega un archivo: en el móvil abre «Compartir» (WhatsApp, correo, Drive…); si no se puede, lo descarga.
async function entregarArchivo(blob, nombre, titulo, avisoDescarga, modo = 'compartir') {
  const file = new File([blob], nombre, { type: blob.type });
  if (modo === 'compartir' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: titulo }); return 'compartido'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelado'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast(avisoDescarga);
  return 'descargado';
}
// Las librerías del PDF solo se cargan al pulsar el botón (necesita conexión la primera vez).
function cargarScript(src) {
  return new Promise((ok, mal) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('sin conexión'));
    document.head.appendChild(s);
  });
}
async function exportarPDF(modo) {
  const boton = $(modo === 'compartir' ? '#pdfComp' : '#pdf'); const texto = boton.innerHTML;
  boton.disabled = true; boton.textContent = 'Preparando el PDF…';
  try {
    await cargarScript('lib/jspdf.umd.min.js');
    await cargarScript('lib/jspdf.plugin.autotable.min.js');
  } catch (e) {
    toast('No se ha podido preparar el PDF. Recargue la app e inténtelo de nuevo.');
    boton.disabled = false; boton.innerHTML = texto; return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ANCHO = doc.internal.pageSize.getWidth(), M = 14;
  const TINTA = [28, 27, 25], GRIS = [110, 105, 96], ORO = [243, 210, 122], FONDO = [246, 245, 242];
  const fecha = new Date().toLocaleDateString('es-ES', { timeZone: ZONA, day: 'numeric', month: 'long', year: 'numeric' });
  const todos = [...state.palomos.values()];
  const res = [...state.resultados.values()];

  // Portada en la primera página
  doc.setFillColor(...ORO); doc.rect(M, 16, 24, 2, 'F');
  doc.setFont('times', 'bold'); doc.setFontSize(26); doc.setTextColor(...TINTA);
  doc.text('Colombaire', M, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...GRIS);
  doc.text(`Copia del palomar · ${fecha}`, M, 37);
  const enCasa = todos.filter(p => (p.estado || 'palomar') === 'palomar').length;
  doc.text(`${todos.length} palomos (${enCasa} en el palomar) · ${res.length} resultados de concursos`, M, 43);
  let y = 52;

  const nombreDe = id => { const x = state.palomos.get(id); return x ? nameOf(x) : ''; };
  const mejor = p => { const r = bestResult(p.id); return r ? [r.puesto ? r.puesto + 'º' : '', r.prueba, anioRes(r) || ''].filter(Boolean).join(' · ') : ''; };
  const indice = p => { const g = genDe(p.id); return g && g.conDatos ? String(g.indice) : ''; };
  const estilo = {
    theme: 'grid', margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: TINTA, lineColor: [225, 221, 213], lineWidth: 0.2, overflow: 'linebreak' },
    headStyles: { fillColor: TINTA, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: FONDO },
  };
  const titulo = (t, sub) => {
    if (y > 260) { doc.addPage(); y = 18; }
    doc.setFont('times', 'bold'); doc.setFontSize(15); doc.setTextColor(...TINTA); doc.text(t, M, y);
    if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRIS); doc.text(sub, M, y + 5); }
    y += sub ? 9 : 5;
  };

  // Palomos, por dónde están
  const grupos = [['palomar', 'En mi palomar'], ['referencia', 'Pedigrí (antepasados de otros palomares)'], ['historico', 'Histórico (ya no están)']];
  const otros = todos.filter(p => !grupos.some(([k]) => (p.estado || 'palomar') === k));
  const lista = grupos.map(([k, t]) => [t, todos.filter(p => (p.estado || 'palomar') === k)]).concat(otros.length ? [['Otros', otros]] : []);
  for (const [t, ps] of lista) {
    if (!ps.length) continue;
    titulo(t, `${ps.length} ${ps.length === 1 ? 'palomo' : 'palomos'}`);
    doc.autoTable({ ...estilo, startY: y,
      head: [['Nombre', 'Anilla', 'Sexo', 'Plumaje', 'Padre', 'Madre', 'Índice', 'Mejor resultado']],
      body: ps.sort(byName).map(p => [nameOf(p), p.nombre ? (p.anilla || '') : '', sexoTxt(p), p.plumaje || '', nombreDe(p.padreId), nombreDe(p.madreId), indice(p), mejor(p)]),
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 }, 1: { cellWidth: 23 }, 6: { halign: 'center', cellWidth: 13 } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Resultados de concursos
  if (res.length) {
    titulo('Resultados de concursos', `${res.length} resultados`);
    const filas = res.map(r => ({ r, n: nombreDe(r.palomoId) }))
      .sort((a, b) => a.n.localeCompare(b.n, 'es') || (anioRes(b.r) || 0) - (anioRes(a.r) || 0) || (Number(a.r.puesto) || 999) - (Number(b.r.puesto) || 999));
    doc.autoTable({ ...estilo, startY: y,
      head: [['Palomo', 'Puesto', 'Concurso', 'Lugar', 'Año']],
      body: filas.map(({ r, n }) => [n, r.puesto ? r.puesto + 'º' : '', r.prueba || '', r.lugar || '', String(anioRes(r) || '')]),
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 }, 1: { halign: 'center', cellWidth: 16 }, 4: { halign: 'center', cellWidth: 14 } },
    });
  }

  // Vacunas y tratamientos
  const tratos = todos.flatMap(p => (p.tratamientos || []).filter(t => !t.borrado).map(t => ({ p, t })));
  if (tratos.length) {
    y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : y;
    titulo('Vacunas y tratamientos', `${tratos.length} ${tratos.length === 1 ? 'tratamiento apuntado' : 'tratamientos apuntados'}`);
    tratos.sort((a, b) => nameOf(a.p).localeCompare(nameOf(b.p), 'es') || String(b.t.fecha || '').localeCompare(String(a.t.fecha || '')));
    doc.autoTable({ ...estilo, startY: y,
      head: [['Palomo', 'Tratamiento', 'Fecha', 'Producto', 'Notas']],
      body: tratos.map(({ p, t }) => [nameOf(p), nombreTrato(t), fechaES(t.fecha), [t.producto, t.lote && 'lote ' + t.lote].filter(Boolean).join(' · '), [t.dosis && 'Dosis: ' + t.dosis, t.notas].filter(Boolean).join('. ')]),
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 }, 2: { cellWidth: 22 } },
    });
  }

  // Pie de página
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(`Colombaire · ${fecha}`, M, 290);
    doc.text(`Página ${i} de ${paginas}`, ANCHO - M, 290, { align: 'right' });
  }

  const blob = doc.output('blob');
  const r = await entregarArchivo(blob, `colombaire-${today()}.pdf`, 'Colombaire en PDF',
    modo === 'compartir' ? 'Este móvil no permite compartir desde aquí: el PDF se ha guardado en Descargas' : 'PDF guardado en Descargas', modo);
  if (r === 'compartido') toast('PDF enviado');
  boton.disabled = false; boton.innerHTML = texto;
}
/* ---------- Copia de seguridad en un archivo y copia diaria automática ---------- */
const horaMin = () => new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).replace(':', '');
const nombreCopia = (conHora = true) => `colombaire-copia-${today()}${conHora ? '-' + horaMin() : ''}.json`;
const RE_COPIA = /^(colombaire|mi-palomar)-copia-\d{4}-\d{2}-\d{2}(-\d{4})?\.json$/;
const contarTratos = ps => ps.reduce((n, p) => n + (p.tratamientos || []).filter(t => !t.borrado).length, 0);
function datosCopia() {
  return { app: 'colombaire', version: 1, fecha: new Date().toISOString(), palomos: [...state.palomos.values()], resultados: [...state.resultados.values()] };
}
function marcarCopia() { try { localStorage.setItem('ultimaCopia', String(Date.now())); } catch (e) { /* sin almacenamiento */ } }
async function exportar() {
  const blob = new Blob([JSON.stringify(datosCopia())], { type: 'application/json' });
  const nombre = nombreCopia();
  const file = new File([blob], nombre, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Copia de Colombaire' }); marcarCopia(); toast('Copia enviada'); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  marcarCopia();
  toast('Copia guardada en Descargas');
}
async function importar(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { toast('Ese archivo no es una copia válida'); return; }
  if (!data || !['colombaire', 'mi-palomar'].includes(data.app) || !Array.isArray(data.palomos) || !Array.isArray(data.resultados)) { toast('Ese archivo no es una copia de Colombaire'); return; }
  const tratos = contarTratos(data.palomos);
  if (!confirm(`La copia tiene ${data.palomos.length} palomos, ${data.resultados.length} resultados${tratos ? ` y ${tratos} tratamientos` : ''}.\n\nSe sustituirán los datos actuales (${state.palomos.size} palomos). ¿Seguir?`)) return;
  await clearAll();
  await putMany('palomos', data.palomos);
  await putMany('resultados', data.resultados);
  toast('Copia recuperada');
  location.hash = '#/';
}

/* Copia diaria automática: el usuario elige una carpeta de su ordenador una sola vez y, al abrir la app cada día,
   se guarda allí la copia del día (conservando las últimas N). Solo funciona en Chrome/Edge de ordenador. Si el
   navegador necesita que se confirme el permiso, aparece un botón «Guardar la copia de hoy» (un toque). */
const copiaAuto = { handle: null, pendiente: false };
const soportaCarpeta = () => typeof window.showDirectoryPicker === 'function';
const cfgCopia = () => ({ activa: false, conservar: 30, diasAviso: 30, ultima: null, error: '', ...leerJSON('copiaAuto', {}) });
const guardarCfgCopia = c => guardarJSON('copiaAuto', c);
function ajustesDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('mi-palomar-ajustes', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function ajuste(k, v) {
  const d = await ajustesDB();
  return new Promise((res, rej) => {
    const t = d.transaction('kv', 'readwrite'), s = t.objectStore('kv');
    const r = v === undefined ? s.get(k) : v === null ? s.delete(k) : s.put(v, k);
    t.oncomplete = () => { d.close(); res(r.result); }; t.onerror = t.onabort = () => { d.close(); rej(t.error); };
  });
}
async function cargarCarpeta() {
  if (!copiaAuto.handle) { try { copiaAuto.handle = (await ajuste('carpeta')) || null; } catch (e) { /* sin carpeta */ } }
  return copiaAuto.handle;
}
async function elegirCarpeta() {
  const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'colombaire-copias' });
  copiaAuto.handle = h;
  try { await ajuste('carpeta', h); } catch (e) { /* se queda solo en memoria hasta cerrar la app */ }
  guardarCfgCopia({ ...cfgCopia(), activa: true, error: '' });
  return h;
}
async function quitarCarpeta() {
  copiaAuto.handle = null; copiaAuto.pendiente = false;
  try { await ajuste('carpeta', null); } catch (e) { /* nada que quitar */ }
  guardarCfgCopia({ ...cfgCopia(), activa: false, error: '' });
}
async function permisoCarpeta(h, pedir) {
  const o = { mode: 'readwrite' };
  if ((await h.queryPermission(o)) === 'granted') return true;
  return pedir ? (await h.requestPermission(o)) === 'granted' : false;
}
async function escribirCopiaEnCarpeta(h) {
  const nombre = nombreCopia(false); // una por día: si se repite, se sustituye
  const f = await h.getFileHandle(nombre, { create: true });
  const w = await f.createWritable(); await w.write(JSON.stringify(datosCopia())); await w.close();
  // Solo se borran copias con el nombre de las de la app, nunca otros archivos de la carpeta.
  const nombres = [];
  for await (const [n, e] of h.entries()) if (e.kind === 'file' && RE_COPIA.test(n)) nombres.push(n);
  nombres.sort().reverse();
  for (const n of nombres.slice(Math.max(1, cfgCopia().conservar))) { try { await h.removeEntry(n); } catch (e) { /* se queda */ } }
  return nombre;
}
// Devuelve: hecha | permiso (hace falta un toque) | error | vacia | inactiva
async function copiaAutomatica({ gesto = false } = {}) {
  const cfg = cfgCopia(); if (!cfg.activa || !soportaCarpeta()) return 'inactiva';
  if (!state.palomos.size && !state.resultados.size) return 'vacia'; // no se sustituyen copias buenas por una vacía
  const h = await cargarCarpeta();
  if (!h) { guardarCfgCopia({ ...cfg, error: 'No se encuentra la carpeta de copias. Elíjala de nuevo.' }); return 'error'; }
  try {
    if (!(await permisoCarpeta(h, gesto))) { copiaAuto.pendiente = true; return 'permiso'; }
    await escribirCopiaEnCarpeta(h);
    guardarCfgCopia({ ...cfgCopia(), ultima: Date.now(), error: '' }); marcarCopia(); copiaAuto.pendiente = false;
    return 'hecha';
  } catch (e) {
    guardarCfgCopia({ ...cfgCopia(), error: 'No se pudo guardar la copia: ' + ((e && e.message) || e) });
    return 'error';
  }
}
const fechaDe = ms => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
async function copiaDiariaSiToca() {
  const cfg = cfgCopia();
  if (!cfg.activa || !nube.sesion || (cfg.ultima && fechaDe(cfg.ultima) === today())) return;
  await copiaAutomatica();
  if (copiaAuto.pendiente && ['', '#/'].includes(location.hash) && !document.querySelector('form')) route();
}
function avisoCopiaPendiente() {
  return copiaAuto.pendiente ? `<div class="card warn mt2"><b>Falta guardar la copia de hoy</b><p>El navegador necesita que confirme el permiso para escribir en su carpeta de copias.</p><button type="button" class="btn mt" id="copiaHoy">${ic('down')} Guardar la copia de hoy</button></div>` : '';
}
function conectarAvisoCopia() {
  const b = $('#copiaHoy'); if (!b) return;
  b.onclick = async () => { const r = await copiaAutomatica({ gesto: true }); toast(r === 'hecha' ? 'Copia guardada' : 'No se pudo guardar la copia'); route(); };
}
function bloqueCopiaAuto() {
  if (!soportaCarpeta()) {
    return `<p class="seccion">Copia diaria automática</p><div class="card"><p class="muted" style="margin:0">Solo está disponible en el ordenador, con Chrome o Edge. Allí podrá elegir una carpeta y la app guardará una copia cada día que la abra.</p></div>`;
  }
  const c = cfgCopia();
  const cuando = c.ultima ? fechaHora(c.ultima) : 'todavía no';
  return `<p class="seccion">Copia diaria automática</p>
    <div class="card">
      ${c.activa ? `<div class="dato" style="padding:0 0 12px"><span>Carpeta</span><b id="carpetaNombre">…</b></div>
        <div class="dato" style="padding:12px 0;border-top:1px solid var(--line)"><span>Última copia</span><b>${esc(cuando)}</b></div>
        ${c.error ? `<p class="err">${esc(c.error)}</p>` : ''}
        ${campo('conservar', 'Copias que se conservan', `<select id="conservar">${[7, 14, 30, 60, 90].map(n => `<option value="${n}" ${c.conservar === n ? 'selected' : ''}>Las últimas ${n}</option>`).join('')}</select>`)}`
      : '<p class="muted" style="margin:0">Elija una carpeta de su ordenador. Cada día que abra la app, guardará allí una copia con todos sus datos.</p>'}
      ${campo('diasAviso', 'Avisarme si pasan sin copia', `<select id="diasAviso">${[7, 15, 30, 60].map(n => `<option value="${n}" ${c.diasAviso === n ? 'selected' : ''}>${n} días</option>`).join('')}</select>`)}
    </div>
    ${c.activa ? `<button class="btn mt" type="button" id="copiaYa">${ic('down')} Guardar una copia ahora en la carpeta</button>
      <button class="btn sec mt" type="button" id="copiaCambiar">Cambiar de carpeta</button>
      <button class="btn sec mt" type="button" id="copiaQuitar">Desactivar la copia diaria</button>`
    : `<button class="btn mt" type="button" id="copiaElegir">${ic('plus')} Elegir carpeta y activar</button>`}`;
}
function conectarBloqueCopia() {
  const c = cfgCopia();
  if ($('#carpetaNombre')) cargarCarpeta().then(h => { const e = $('#carpetaNombre'); if (e) e.textContent = h ? h.name : 'No se encuentra'; });
  const elegir = async () => {
    try { await elegirCarpeta(); } catch (e) { if (e.name !== 'AbortError') toast('No se pudo elegir la carpeta'); return; }
    const r = await copiaAutomatica({ gesto: true }); toast(r === 'hecha' ? 'Copia diaria activada' : 'Carpeta elegida'); route();
  };
  if ($('#copiaElegir')) $('#copiaElegir').onclick = elegir;
  if ($('#copiaCambiar')) $('#copiaCambiar').onclick = elegir;
  if ($('#copiaYa')) $('#copiaYa').onclick = async () => { const r = await copiaAutomatica({ gesto: true }); toast(r === 'hecha' ? 'Copia guardada' : r === 'vacia' ? 'No hay datos que guardar' : 'No se pudo guardar la copia'); route(); };
  if ($('#copiaQuitar')) $('#copiaQuitar').onclick = async () => { if (!confirm('¿Desactivar la copia diaria? Las copias ya guardadas en la carpeta no se borran.')) return; await quitarCarpeta(); route(); };
  if ($('#conservar')) $('#conservar').onchange = e => guardarCfgCopia({ ...cfgCopia(), conservar: Number(e.target.value) });
  if ($('#diasAviso')) $('#diasAviso').onchange = e => guardarCfgCopia({ ...cfgCopia(), diasAviso: Number(e.target.value) });
  conectarAvisoCopia();
}
// Recuadro de la cuenta: quién ha entrado, última sincronización y acciones.
function bloqueNube() {
  if (!nube.sesion) return '';
  const cuando = nube.ultima ? fechaHora(nube.ultima) : 'todavía no';
  return `<div class="card">
      <div class="dato" style="padding:0 0 12px"><span>Cuenta</span><b>${esc(nube.sesion.user.email)}</b></div>
      <div class="dato" style="padding:12px 0 0;border-top:1px solid var(--line)"><span>Última copia</span><b>${nube.ocupada ? 'Guardando…' : esc(cuando)}</b></div>
      ${nube.sinConexion || !navigator.onLine ? '<p class="muted" style="margin:10px 0 0">Sin conexión: los cambios se guardarán en su cuenta cuando vuelva internet.</p>' : ''}
      ${nube.error ? `<p class="err">No se pudo guardar en la nube: ${esc(nube.error)}</p>` : ''}
    </div>
    <button class="btn tonal mt" type="button" id="nsync">Guardar ahora en la nube</button>
    <button class="btn sec mt" type="button" id="ncambiar">Cambiar la contraseña</button>
    <button class="btn sec mt" type="button" id="nsalir">Cerrar la sesión</button>`;
}
function conectarBloqueNube() {
  if ($('#nsync')) $('#nsync').onclick = async () => { $('#nsync').textContent = 'Guardando…'; await sincronizar(); toast(nube.error ? 'No se pudo guardar' : 'Guardado en la nube'); route(); };
  if ($('#ncambiar')) $('#ncambiar').onclick = () => { nube.cambiandoClave = true; nube.voluntario = true; route(); };
  if ($('#nsalir')) $('#nsalir').onclick = cerrarSesion;
}
function viewMas() {
  setHeader('Mi cuenta', false);
  const correo = nube.sesion && nube.sesion.user && nube.sesion.user.email;
  app.innerHTML = `<h1 class="grande">Mi cuenta</h1><p class="resumen">${esc(correo || '')}</p>
    <div id="nube">${bloqueNube()}</div>
    <p class="seccion">Mis datos</p>
    <div class="card"><p style="margin-top:0"><b>${state.palomos.size} palomos · ${state.resultados.size} resultados</b></p>
      <p class="muted" style="margin-bottom:0">Están en su cuenta y en este dispositivo, y solo usted los ve. Haga además una copia en un archivo de vez en cuando y guárdela en otro sitio (por ejemplo, en el ordenador). Si algo falla, la copia le permite recuperarlo todo.</p></div>
    <p class="seccion">Copia en un archivo</p>
    <button class="btn" type="button" id="exp">${ic('down')} Guardar una copia</button>
    <label class="btn sec mt"><input type="file" accept="application/json,.json" id="imp" hidden>${ic('up')} Recuperar una copia</label>
    ${bloqueCopiaAuto()}
    <a class="btn sec mt2" href="#/instalar">${ic('share')} Instalar en el móvil (código QR)</a>
    <p class="seccion">Copia en PDF</p>
    <p class="muted" style="margin:0 6px 12px">Un documento para leer o imprimir con todos sus palomos, padres, índices y resultados. Sirve para consultarlo o enseñarlo, pero no para recuperar los datos: para eso use «Guardar una copia».</p>
    <button class="btn" type="button" id="pdf">${ic('doc')} Guardar en PDF</button>
    <button class="btn sec mt" type="button" id="pdfComp">${ic('share')} Compartir el PDF</button>
    <p class="seccion">Borrar</p>
    <button class="btn danger" type="button" id="borrar">Borrar todos los datos</button>`;
  $('#exp').onclick = exportar;
  $('#pdf').onclick = () => exportarPDF('guardar');
  $('#pdfComp').onclick = () => exportarPDF('compartir');
  $('#imp').onchange = e => { if (e.target.files[0]) importar(e.target.files[0]); };
  conectarBloqueNube();
  conectarBloqueCopia();
  $('#borrar').onclick = async () => {
    if (!confirm(`¿Borrar TODOS los datos (${state.palomos.size} palomos)? No se puede deshacer.\n\nSi no tiene copia, cancele y guarde una antes.`)) return;
    if (!confirm('¿Seguro? Esta es la última confirmación.')) return;
    await clearAll(); toast('Datos borrados'); location.hash = '#/';
  };
}

/* ---------- Acceso: cuenta obligatoria, código por correo y contraseña propia ----------
   Solo entran personas invitadas (el registro está cerrado en Supabase). Cómo se entra:
   1) Primera vez («Active su cuenta») o contraseña olvidada: se pide un código de un solo uso, que llega por correo.
      Escribirlo confirma que el correo es del usuario. Son dos pantallas distintas con el mismo mecanismo.
   2) Después de cualquier entrada con código, la app obliga a elegir una contraseña propia antes de dejar usar nada.
   3) Siguientes veces: correo y contraseña. La sesión queda guardada y la app funciona sin conexión. */
// En un dispositivo donde nadie ha entrado nunca, se abre directamente «Active su cuenta» (solo el correo, sin contraseña).
const yaEntroAqui = () => { try { return localStorage.getItem('yaEntro') === '1'; } catch (e) { return false; } };
const entrada = { modo: yaEntroAqui() ? 'entrar' : 'activar', correo: '', hasta: 0, motivo: 'activar' }; // modo: entrar | activar | olvido | verificar
let accesoMostrado = null;
// Qué debe ver el usuario: la app (ok), la entrada, la elección de contraseña o un aviso de servicio no disponible.
function estadoAcceso() {
  if (!nubeConfigurada() || !window.supabase || !nube.sb) return 'noservicio';
  if (!nube.sesion) return 'entrar';
  const md = (nube.sesion.user && nube.sesion.user.user_metadata) || {};
  if (nube.cambiandoClave || !md.clave_elegida) return 'clave';
  return 'ok';
}
function mensajeError(e) {
  const m = (e && e.message) || '';
  if (/invalid login|invalid credentials/i.test(m)) return 'El correo o la contraseña no son correctos. Si es su primera vez, active su cuenta; si la ha olvidado, pida un código nuevo.';
  if (/token has expired|otp.*expired|expired|invalid.*(token|otp)|otp/i.test(m)) return 'El código no es correcto o ya ha caducado. Pida uno nuevo.';
  if (/only request this after|security purposes/i.test(m)) return 'Espere un minuto antes de pedir otro código.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos seguidos. Espere unos minutos y vuelva a probar.';
  if (/failed to fetch|network/i.test(m)) return 'No hay conexión a internet. Inténtelo de nuevo cuando tenga cobertura.';
  if (/different from the old/i.test(m)) return 'La contraseña nueva tiene que ser distinta de la anterior.';
  if (/password should be|at least/i.test(m)) return 'La contraseña es demasiado corta o demasiado fácil.';
  return m || 'No se ha podido completar. Inténtelo de nuevo.';
}
const CLAVES_FLOJAS = ['12345678', '123456789', '1234567890', '87654321', 'password', 'password1', 'contraseña', 'contrasena1', 'qwertyui', 'qwerty123', '11111111', '00000000', 'palomos123', 'palomar123'];
function validarClave(c, correo) {
  if (c.length < 8) return 'La contraseña tiene que tener al menos 8 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(c) || !/\d/.test(c)) return 'Use letras y al menos un número.';
  if (CLAVES_FLOJAS.includes(c.toLowerCase()) || (correo && c.toLowerCase() === correo.toLowerCase())) return 'Esa contraseña es demasiado fácil de adivinar. Elija otra.';
  return '';
}
const cabeceraAcceso = '<p class="eyebrow-c">Colombicultura</p><h1 class="grande">Colombaire</h1>';
function viewAcceso(estado) {
  document.title = 'Entrar · Colombaire';
  document.body.dataset.top = 'no';
  if (estado === 'noservicio') return viewSinServicio();
  if (estado === 'clave') return viewElegirClave();
  return viewEntrar();
}
function viewSinServicio() {
  const sinConfig = !nubeConfigurada();
  app.innerHTML = `<div class="entrar">${cabeceraAcceso}
    <div class="card mt2"><h2 style="margin:0 0 6px">${sinConfig ? 'La app no está configurada' : 'No se puede entrar ahora'}</h2>
      <p class="muted" style="margin:0">${sinConfig ? 'Falta conectar la app con su base de datos (archivo config.js).' : 'No se ha podido cargar el servicio de acceso. Compruebe que tiene conexión a internet e inténtelo de nuevo.'}</p>
      ${sinConfig ? '' : '<button class="btn mt2" type="button" id="reint">Reintentar</button>'}</div></div>`;
  if (!sinConfig) $('#reint').onclick = () => location.reload();
}
function viewEntrar() {
  const m = entrada.modo;
  let correo = entrada.correo; if (!correo) { try { correo = localStorage.getItem('ultimoCorreo') || ''; } catch (e) { /* sin almacenamiento */ } }
  const titulo = { entrar: 'Entrar', activar: 'Active su cuenta', olvido: 'He olvidado mi contraseña', verificar: 'Escriba el código' }[m];
  const ayuda = {
    entrar: 'Escriba su correo y su contraseña.',
    activar: 'Solo para la primera vez. Escriba el correo con el que le han invitado y le enviaremos un código de 6 cifras para activar su cuenta. Después elegirá su contraseña.',
    olvido: 'Escriba su correo y le enviaremos un código de 6 cifras para elegir una contraseña nueva.',
    verificar: `Si su correo está autorizado, en unos instantes recibirá un código en ${esc(entrada.correo)} (mire también en «No deseado»). Caduca en 10 minutos.`,
  }[m];
  const campos = {
    entrar: campo('ce', 'Correo electrónico', `<input id="ce" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="nombre@correo.com" value="${esc(correo)}">`)
      + campo('cc', 'Contraseña', '<input id="cc" type="password" autocomplete="current-password" placeholder="Su contraseña">')
      + '<label class="chk"><input type="checkbox" id="ver"> Mostrar la contraseña</label>',
    activar: campo('ce', 'Correo electrónico', `<input id="ce" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="nombre@correo.com" value="${esc(correo)}">`),
    olvido: campo('ce', 'Correo electrónico', `<input id="ce" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="nombre@correo.com" value="${esc(correo)}">`),
    verificar: campo('cd', 'Código de 6 cifras', '<input id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="000000">'),
  }[m];
  const boton = { entrar: 'Entrar', activar: 'Enviarme el código', olvido: 'Enviarme el código', verificar: 'Comprobar el código' }[m];
  const enlaces = {
    entrar: '<button type="button" class="btn sec" data-m="activar">Es mi primera vez: activar mi cuenta</button><button type="button" class="enlace" data-m="olvido">He olvidado mi contraseña</button>',
    activar: '<button type="button" class="btn sec" data-m="entrar">Ya tengo contraseña: entrar</button><button type="button" class="enlace" data-m="olvido">He olvidado mi contraseña</button>',
    olvido: '<button type="button" class="btn sec" data-m="entrar">Volver a «Entrar»</button><button type="button" class="enlace" data-m="activar">Es mi primera vez: activar mi cuenta</button>',
    verificar: `<button type="button" class="btn sec" id="reenviar" disabled>Pedir otro código</button><button type="button" class="enlace" data-m="${entrada.motivo}">Cambiar de correo</button>`,
  }[m];
  app.innerHTML = `<div class="entrar">${cabeceraAcceso}
    <p class="resumen">Sus palomos, su pedigrí y sus concursos, siempre a mano.</p>
    <div class="card mt2"><h2 style="margin:0 0 6px">${titulo}</h2><p class="muted" style="margin:0 0 4px">${ayuda}</p>
      <form id="fe" novalidate>${campos}<div id="eerr"></div><button class="btn mt2" type="submit" id="eok">${boton}</button></form></div>
    <div class="entrar-links">${enlaces}</div></div>`;
  app.querySelectorAll('[data-m]').forEach(b => { b.onclick = () => { entrada.modo = b.dataset.m; if (['activar', 'olvido'].includes(b.dataset.m)) entrada.motivo = b.dataset.m; entrada.correo = ($('#ce') && $('#ce').value.trim()) || entrada.correo; route(); }; });
  const ver = $('#ver'); if (ver) ver.onchange = () => { $('#cc').type = ver.checked ? 'text' : 'password'; };
  const aviso = (t, ok) => { $('#eerr').innerHTML = `<p class="${ok ? 'ok-msg' : 'err'}">${esc(t)}</p>`; };
  const pedirCodigo = async email => {
    const { error } = await nube.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    // Un correo no invitado da el mismo mensaje que uno invitado, para no revelar quién tiene cuenta.
    if (error && !/signups? not allowed|user not found|not allowed/i.test(error.message || '')) throw error;
    entrada.modo = 'verificar'; entrada.correo = email; entrada.hasta = Date.now() + 60000; route();
  };
  if (m === 'verificar') {
    const re = $('#reenviar'); const t = setInterval(() => {
      if (!re.isConnected) return clearInterval(t);
      const s = Math.ceil((entrada.hasta - Date.now()) / 1000);
      if (s > 0) re.textContent = `Pedir otro código (${s} s)`; else { re.textContent = 'Pedir otro código'; re.disabled = false; clearInterval(t); }
    }, 500);
    re.onclick = async () => { re.disabled = true; try { await pedirCodigo(entrada.correo); } catch (x) { aviso(mensajeError(x)); } };
  }
  $('#fe').onsubmit = async e => {
    e.preventDefault();
    const b = $('#eok'); const texto = b.textContent;
    try {
      if (m === 'verificar') {
        const token = $('#cd').value.replace(/\s/g, '');
        if (!/^\d{6,8}$/.test(token)) return aviso('Escriba las cifras del código que le hemos enviado.');
        b.disabled = true; b.textContent = 'Un momento…';
        nube.cambiandoClave = true; nube.voluntario = false; // tras un código siempre se elige contraseña propia
        const { error } = await nube.sb.auth.verifyOtp({ email: entrada.correo, token, type: 'email' });
        if (error) { nube.cambiandoClave = false; throw error; }
        await nube.sb.auth.updateUser({ data: { clave_elegida: false } });
        entrada.modo = 'entrar';
        if (nube.sesion) { nube.sesion = { ...nube.sesion, user: { ...nube.sesion.user, user_metadata: { ...(nube.sesion.user.user_metadata || {}), clave_elegida: false } } }; }
        route();
        return;
      }
      const email = $('#ce').value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return aviso('Escriba un correo válido, por ejemplo nombre@gmail.com.');
      try { localStorage.setItem('ultimoCorreo', email); } catch (x) { /* sin almacenamiento */ }
      b.disabled = true; b.textContent = 'Un momento…';
      if (m === 'activar' || m === 'olvido') { entrada.motivo = m; await pedirCodigo(email); }
      else {
        const password = $('#cc').value;
        if (!password) { b.disabled = false; b.textContent = texto; return aviso('Escriba su contraseña.'); }
        const { error } = await nube.sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast('Bienvenido');
      }
    } catch (x) { aviso(mensajeError(x)); }
    finally { if (b.isConnected) { b.disabled = false; b.textContent = texto; } }
  };
}
// Elegir contraseña propia: obligatorio tras entrar con un código; voluntario desde «Cuenta → Cambiar la contraseña».
function viewElegirClave() {
  const voluntario = nube.voluntario;
  document.body.dataset.top = 'no';
  app.innerHTML = `<div class="entrar">${cabeceraAcceso}
    <div class="card mt2"><h2 style="margin:0 0 6px">${voluntario ? 'Cambiar la contraseña' : entrada.motivo === 'olvido' ? 'Elija su contraseña nueva' : 'Su cuenta está activada'}</h2>
      <p class="muted" style="margin:0">${voluntario ? 'Escriba la contraseña nueva.' : entrada.motivo === 'olvido' ? 'Hemos comprobado su correo. Elija una contraseña nueva: con ella entrará la próxima vez. Apúntela en un sitio seguro.' : 'Hemos comprobado su correo. Para terminar, elija una contraseña solo suya: con ella entrará la próxima vez, sin necesitar códigos. Apúntela en un sitio seguro.'}</p>
      <form id="fn" novalidate>
        ${campo('cn', 'Contraseña nueva', '<input id="cn" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres, con un número">')}
        ${campo('cn2', 'Repítala', '<input id="cn2" type="password" autocomplete="new-password" placeholder="La misma contraseña">')}
        <label class="chk"><input type="checkbox" id="ver"> Mostrar la contraseña</label>
        <div id="eerr"></div>
        <button class="btn mt2" type="submit" id="eok">Guardar la contraseña</button>
      </form></div>
    <div class="entrar-links">${voluntario ? '<button type="button" class="btn sec" id="cancelar">Cancelar</button>' : '<button type="button" class="enlace" id="salir">Salir y entrar con otro correo</button>'}</div></div>`;
  $('#ver').onchange = e => { $('#cn').type = $('#cn2').type = e.target.checked ? 'text' : 'password'; };
  if (voluntario) $('#cancelar').onclick = () => { nube.cambiandoClave = false; nube.voluntario = false; route(); };
  else $('#salir').onclick = async () => { nube.cambiandoClave = false; await nube.sb.auth.signOut(); };
  $('#fn').onsubmit = async e => {
    e.preventDefault();
    const err = t => { $('#eerr').innerHTML = `<p class="err">${esc(t)}</p>`; };
    const c = $('#cn').value, correo = (nube.sesion && nube.sesion.user && nube.sesion.user.email) || '';
    const flojo = validarClave(c, correo);
    if (flojo) return err(flojo);
    if (c !== $('#cn2').value) return err('Las dos contraseñas no coinciden.');
    const b = $('#eok'); b.disabled = true; b.textContent = 'Un momento…';
    const { error } = await nube.sb.auth.updateUser({ password: c, data: { clave_elegida: true } });
    if (error) { b.disabled = false; b.textContent = 'Guardar la contraseña'; return err(mensajeError(error)); }
    if (nube.sesion) nube.sesion = { ...nube.sesion, user: { ...nube.sesion.user, user_metadata: { ...(nube.sesion.user.user_metadata || {}), clave_elegida: true } } };
    nube.cambiandoClave = false; nube.voluntario = false;
    toast(voluntario ? 'Contraseña cambiada' : 'Contraseña guardada');
    location.hash = voluntario ? '#/mas' : '#/'; route(); sincronizar();
  };
}
// Cerrar sesión: primero se guarda todo en la nube y después se vacía este dispositivo.
// Si no se ha podido guardar, antes de vaciar se descarga una copia para no perder nada.
async function cerrarSesion() {
  if (!confirm('¿Cerrar la sesión en este dispositivo?\n\nSus palomos quedan guardados en su cuenta y volverán a aparecer al entrar de nuevo.')) return;
  await sincronizar();
  if (nube.error || nube.sinConexion || !navigator.onLine) {
    if (!confirm('No se han podido guardar los últimos cambios en la nube' + (nube.error ? ' (' + nube.error + ')' : '') + '.\n\nSi cierra la sesión ahora se descargará una copia de seguridad y se borrarán los datos de este dispositivo. ¿Cerrar igualmente?')) return;
    await exportar();
  }
  await nube.sb.auth.signOut();
  await borrarLocal();
  nube.ultima = null; entrada.modo = 'entrar'; entrada.correo = '';
  location.hash = '#/'; route(); toast('Sesión cerrada');
}

/* ---------- Navegación ---------- */
function route() {
  if (!modal.hidden) closeModalDom();
  // La cuenta es obligatoria: sin sesión (o sin contraseña propia elegida) solo se ve la pantalla de acceso.
  const acceso = estadoAcceso(); accesoMostrado = acceso; nube.refrescarLuego = false; pintarEstadoRed();
  if (acceso === 'ok') { try { localStorage.setItem('yaEntro', '1'); } catch (e) { /* sin almacenamiento */ } }
  document.body.classList.toggle('sin-sesion', acceso !== 'ok');
  if (acceso !== 'ok') { $('#fab').hidden = true; return viewAcceso(acceso); }
  depthMemo.clear();
  const parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
  const [v, a, b, c] = parts;
  window.scrollTo(0, 0);
  $('#fab').hidden = !!v; // el botón «Añadir palomo» solo en la lista
  switch (v) {
    case '': case undefined: setTab('lista'); return viewLista();
    case 'p': setTab('lista'); return viewFicha(a);
    case 'editar': setTab('lista'); return viewEditar(a);
    case 'resultado': setTab('lista'); return viewResultado(a, b);
    case 'arbol': setTab('lista'); return viewArbol(a);
    case 'arbolpareja': setTab('cria'); return viewArbolPareja(a, b);
    case 'cria': setTab('cria'); return viewCria();
    case 'familias': setTab('familias'); return viewFamilias(a);
    case 'foto': setTab('lista'); return viewFoto();
    case 'tratamiento': setTab('lista'); return viewTratamiento(a, b);
    case 'completar': setTab('lista'); return viewCompletar();
    case 'instalar': setTab('mas'); return viewInstalar();
    case 'concursos': setTab('lista'); return viewConcursos();
    case 'sanidad': setTab('sanidad'); return a === 'aplicar' ? viewAplicar(b, c) : viewSanidad();
    case 'mas': setTab('mas'); return viewMas();
    default: location.replace('#/');
  }
}
$('#back').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/'; };

(async () => {
  try { db = await idbOpen(); await loadAll(); }
  catch (e) { app.innerHTML = '<div class="card mt"><p>No se pudo abrir la base de datos de este navegador. Pruebe a abrir la app en Chrome.</p></div>'; return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  try { localStorage.removeItem('diseno'); } catch (e) { /* sin almacenamiento */ }
  window.addEventListener('hashchange', route);
  window.addEventListener('online', sincronizar);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
  try { await iniciarNube(); } catch (e) { /* sin servicio de acceso: se muestra el aviso */ }
  route();
  copiaDiariaSiToca().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Cuando llega una versión nueva de la app, se recarga sola una vez para mostrarla.
    const habiaVersion = !!navigator.serviceWorker.controller;
    let recargada = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (habiaVersion && !recargada) { recargada = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  }
})();
