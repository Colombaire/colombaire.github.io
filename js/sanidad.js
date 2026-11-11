'use strict';
/* Colombaire — Sanidad, «Por completar» y concursos. (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */
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
