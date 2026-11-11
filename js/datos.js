'use strict';
/* Colombaire — Base de datos del dispositivo y sincronización con la cuenta (Supabase). (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */
/* ---------- Iniciales para palomos sin foto ---------- */
function iniciales(p) {
  const n = (p && (p.nombre || p.anilla) || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
  return ((n[0] || '?')[0] + (n.length > 1 ? n[1][0] : '')).toUpperCase();
}

const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

/* ---------- Base de datos ---------- */
let db;
// Tablas que se guardan en el dispositivo y se sincronizan con la cuenta (la nube las guarda con el mismo nombre).
const TABLAS = ['palomos', 'resultados', 'nidadas'];
const state = { palomos: new Map(), resultados: new Map(), nidadas: new Map() };

/* ---------- Defensa ante datos manipulados ----------
   Los datos pueden venir de un archivo de copia que alguien nos pase o de la nube. Antes de guardarlos o pintarlos se
   limpian los campos que acaban dentro de HTML (ids, enlaces y foto), para que un archivo manipulado no pueda ejecutar código. */
const ID_SEGURO = /^[A-Za-z0-9_-]{1,64}$/;
const FOTO_SEGURA = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const idSeguro = x => typeof x === 'string' && ID_SEGURO.test(x);
const fotoSegura = f => typeof f === 'string' && f.length < 4_000_000 && FOTO_SEGURA.test(f);
// Devuelve el registro limpio (modificado en el sitio) o null si no sirve y hay que descartarlo.
function limpiarRegistro(tabla, o) {
  if (!o || typeof o !== 'object' || !idSeguro(o.id)) return null;
  if (tabla === 'palomos') {
    for (const k of ['padreId', 'madreId']) if (o[k] != null && !idSeguro(o[k])) delete o[k];
    if (o.foto != null && !fotoSegura(o.foto)) delete o.foto;
    if (Array.isArray(o.tratamientos)) o.tratamientos = o.tratamientos.filter(t => t && idSeguro(t.id));
    else if (o.tratamientos != null) delete o.tratamientos;
  } else if (tabla === 'nidadas') {
    for (const k of ['machoId', 'hembraId']) if (o[k] != null && !idSeguro(o[k])) delete o[k];
    o.huevos = Array.isArray(o.huevos) ? o.huevos.filter(h => h && idSeguro(h.id)).slice(0, 30) : [];
    o.pichones = Array.isArray(o.pichones) ? o.pichones.filter(h => h && idSeguro(h.id)).slice(0, 30) : [];
    for (const h of o.pichones) if (h.palomoId != null && !idSeguro(h.palomoId)) delete h.palomoId;
  } else if (!idSeguro(o.palomoId)) return null;
  return o;
}

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('mi-palomar', 2); // versión 2: añade las nidadas (cría)
    r.onupgradeneeded = () => {
      for (const t of TABLAS) if (!r.result.objectStoreNames.contains(t)) r.result.createObjectStore(t, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function txDone(t) { return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); }
async function loadAll() {
  for (const st of TABLAS) {
    const all = await new Promise((res, rej) => {
      const r = db.transaction(st).objectStore(st).getAll();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    state[st].clear();
    all.map(x => limpiarRegistro(st, x)).filter(Boolean).forEach(x => state[st].set(x.id, x));
  }
}
// Cada cambio hecho en el móvil lleva la hora (`actualizado`) para saber qué versión es la más nueva
// al sincronizar con Supabase. Lo que llega de la nube se guarda tal cual ({ remoto: true }).
async function putMany(st, objs, { remoto = false } = {}) {
  objs = objs.map(o => limpiarRegistro(st, o)).filter(Boolean);
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
  const t = db.transaction(TABLAS, 'readwrite');
  TABLAS.forEach(n => t.objectStore(n).clear());
  await txDone(t);
  TABLAS.forEach(n => state[n].clear()); invalidarGenetica();
  guardarJSON('borradosPendientes', []);
  try { ['propietario', 'ultimaCopia', 'ultimaSync', 'copiaAuto'].forEach(k => localStorage.removeItem(k)); } catch (e) { /* sin almacenamiento */ }
  copiaAuto.handle = null; copiaAuto.pendiente = false; ajuste('carpeta', null).catch(() => {});
}
async function clearAll() {
  const ids = Object.fromEntries(TABLAS.map(n => [n, [...state[n].keys()]]));
  const t = db.transaction(TABLAS, 'readwrite');
  TABLAS.forEach(n => t.objectStore(n).clear());
  await txDone(t);
  TABLAS.forEach(n => state[n].clear()); invalidarGenetica();
  TABLAS.forEach(n => apuntarBorrados(n, ids[n]));
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
    // marcadas con `recuperar_datos_locales` en `app_metadata` (solo el administrador puede ponerla, desde Supabase). Para el resto, se baja una copia y se vacía el
    // dispositivo, sin preguntar.
    if (((nube.sesion.user && nube.sesion.user.app_metadata) || {}).recuperar_datos_locales === true) { poner(); return true; }
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
    nube.sinTablaCria = false;
    for (const tabla of TABLAS) {
      const { data, error } = await nube.sb.from(tabla).select('id, data, actualizado, borrado');
      // Si la tabla de cría aún no existe en la nube (falta volver a ejecutar supabase/schema.sql), se salta sin romper el resto.
      if (error && tabla === 'nidadas' && (['42P01', 'PGRST205'].includes(error.code) || /nidadas/i.test(error.message || ''))) { nube.sinTablaCria = true; continue; }
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
    guardarJSON('borradosPendientes', nube.sinTablaCria ? pendientes.filter(b => b.tabla === 'nidadas') : []);
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
