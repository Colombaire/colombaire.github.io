'use strict';
/* Colombaire — Copia de seguridad y copia diaria automática. (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */
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
  return { app: 'colombaire', version: 1, fecha: new Date().toISOString(), palomos: [...state.palomos.values()], resultados: [...state.resultados.values()], nidadas: [...state.nidadas.values()] };
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
  const nidadas = Array.isArray(data.nidadas) ? data.nidadas : []; // las copias antiguas no las tienen
  const tratos = contarTratos(data.palomos);
  if (!confirm(`La copia tiene ${data.palomos.length} palomos, ${data.resultados.length} resultados${nidadas.length ? `, ${nidadas.length} nidadas` : ''}${tratos ? ` y ${tratos} tratamientos` : ''}.\n\nSe sustituirán los datos actuales (${state.palomos.size} palomos). ¿Seguir?`)) return;
  await clearAll();
  await putMany('palomos', data.palomos);
  await putMany('resultados', data.resultados);
  await putMany('nidadas', nidadas);
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
    <button class="btn danger" type="button" id="borrar">Borrar todos los datos</button>
    <p class="muted" style="margin:12px 6px 8px">Si ya no quiere usar Colombaire, puede borrar su cuenta: se eliminan para siempre su acceso y todos sus datos de la nube.</p>
    <button class="btn danger" type="button" id="borrarCuenta">Borrar mi cuenta y mis datos</button>`;
  $('#exp').onclick = exportar;
  $('#pdf').onclick = () => exportarPDF('guardar');
  $('#pdfComp').onclick = () => exportarPDF('compartir');
  $('#imp').onchange = e => { if (e.target.files[0]) importar(e.target.files[0]); };
  conectarBloqueNube();
  conectarBloqueCopia();
  $('#borrarCuenta').onclick = borrarCuenta;
  $('#borrar').onclick = async () => {
    if (!confirm(`¿Borrar TODOS los datos (${state.palomos.size} palomos)? No se puede deshacer.\n\nSi no tiene copia, cancele y guarde una antes.`)) return;
    if (!confirm('¿Seguro? Esta es la última confirmación.')) return;
    await clearAll(); toast('Datos borrados'); location.hash = '#/';
  };
}
