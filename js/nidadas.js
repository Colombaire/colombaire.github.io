'use strict';
/* Colombaire — Cría: nidadas (pareja + puesta, con sus huevos y pichones), avisos e historial de parejas.
   (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.)

   Una nidada se guarda así (tabla `nidadas`):
   { id, machoId, hembraId, machoNombre, hembraNombre, anio, fecha1, fecha2, notas,
     huevos:   [{ id, estado: '' | 'fertil' | 'claro' | 'roto' }],
     pichones: [{ id, nacimiento, anilla, nombre, sexo: 'M' | 'H', estado: 'vivo' | 'muerto' | 'vendido', palomoId }] } */

const ESTADO_HUEVO = { '': 'Sin revisar', fertil: 'Fértil', claro: 'Claro (sin embrión)', roto: 'Roto o abandonado' };
const ESTADO_PICHON = { vivo: 'Vivo', muerto: 'Murió', vendido: 'Vendido o regalado' };
// Plazos que se pueden cambiar (se guardan en este dispositivo): días de incubación desde el segundo huevo y día en que se anilla.
const diasIncubacion = () => Number(leerJSON('criaIncubacion', 18)) || 18;
const diasAnillado = () => Number(leerJSON('criaAnillado', 7)) || 7;
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = f => (typeof f === 'string' && FECHA_OK.test(f) && !Number.isNaN(Date.parse(f)) ? f : '');

function sumarDias(fecha, n) {
  const [y, m, d] = String(fecha).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const nidadaVacia = (machoId, hembraId, fecha1) => ({
  id: uid(), machoId, hembraId, anio: Number(String(fecha1 || today()).slice(0, 4)), fecha1: fechaValida(fecha1) || today(), fecha2: '', notas: '', huevos: [], pichones: [], creado: Date.now(),
});

/* ---------- Lógica (sin pantalla, para poder probarla) ---------- */
// El segundo huevo se pone unos dos días después del primero; si no está apuntado, se cuenta así.
const fechaBaseIncubacion = n => fechaValida(n.fecha2) || (fechaValida(n.fecha1) ? sumarDias(n.fecha1, 2) : '');
const eclosionEsperada = n => { const b = fechaBaseIncubacion(n); return b ? sumarDias(b, diasIncubacion()) : ''; };
const edadPichon = (h, hoy = today()) => (fechaValida(h.nacimiento) ? diasEntre(h.nacimiento, hoy) : null);
const tieneFicha = h => !!(h.palomoId && state.palomos.has(h.palomoId));
const pichonVivo = h => (h.estado || 'vivo') === 'vivo';
// incubando | criando | cerrada | sinfecha
function faseNidada(n, hoy = today()) {
  const pich = n.pichones || [], huevos = n.huevos || [];
  if (pich.length) return pich.some(h => pichonVivo(h) && !tieneFicha(h)) ? 'criando' : 'cerrada';
  if (huevos.length && huevos.every(h => h.estado === 'claro' || h.estado === 'roto')) return 'cerrada';
  const e = eclosionEsperada(n);
  if (!e) return 'sinfecha';
  return diasEntre(e, hoy) > 7 ? 'cerrada' : 'incubando'; // una semana de margen después de lo esperado
}
const FASE_TXT = { incubando: 'Incubando', criando: 'Con pichones', cerrada: 'Terminada', sinfecha: 'Sin fecha de puesta' };

// Eclosión que se acerca (o que ya debería haber ocurrido) y pichones que toca anillar.
function avisosCria(hoy = today()) {
  const out = [];
  for (const n of state.nidadas.values()) {
    if (!(n.pichones || []).length && faseNidada(n, hoy) === 'incubando') {
      const fecha = eclosionEsperada(n), dias = diasEntre(hoy, fecha);
      if (dias <= 3) out.push({ tipo: 'eclosion', n, fecha, dias });
    }
    for (const h of n.pichones || []) {
      const edad = edadPichon(h, hoy);
      if (pichonVivo(h) && !h.anilla && !tieneFicha(h) && edad !== null && edad >= diasAnillado() - 2 && edad <= 30) out.push({ tipo: 'anillar', n, h, edad, dias: diasAnillado() - edad });
    }
  }
  return out.sort((a, b) => a.dias - b.dias);
}
const textoAvisoCria = a => a.tipo === 'eclosion'
  ? (a.dias < 0 ? `Debería haber eclosionado el ${fechaES(a.fecha)}` : a.dias === 0 ? 'Eclosión esperada hoy' : `Eclosión esperada el ${fechaES(a.fecha)} (en ${a.dias} ${a.dias === 1 ? 'día' : 'días'})`)
  : `Pichón de ${a.edad} ${a.edad === 1 ? 'día' : 'días'} por anillar`;

// Lo que ha dado una pareja a lo largo de los años.
function historialPareja(machoId, hembraId) {
  const ns = [...state.nidadas.values()].filter(n => n.machoId === machoId && n.hembraId === hembraId);
  const pich = ns.flatMap(n => n.pichones || []);
  const fichas = pich.filter(tieneFicha).map(h => state.palomos.get(h.palomoId));
  const conRes = fichas.filter(p => resultsOf(p.id).length);
  const puestos = conRes.map(p => bestResult(p.id)).map(r => Number(r && r.puesto)).filter(x => x > 0);
  return { nidadas: ns.length, huevos: ns.reduce((s, n) => s + (n.huevos || []).length, 0), pichones: pich.length, vivos: pich.filter(pichonVivo).length,
    fichas: fichas.length, conResultados: conRes.length, mejorPuesto: puestos.length ? Math.min(...puestos) : null };
}
// Todas las parejas con nidadas, las de más pichones primero.
function parejasCria() {
  const claves = new Map();
  for (const n of state.nidadas.values()) if (n.machoId && n.hembraId) claves.set(n.machoId + '|' + n.hembraId, [n.machoId, n.hembraId]);
  return [...claves.values()].map(([m, h]) => ({ m, h, ...historialPareja(m, h) })).sort((a, b) => b.pichones - a.pichones || b.nidadas - a.nidadas);
}
// Crea la ficha del palomo de un pichón (con su padre y su madre ya puestos) y la deja enlazada en la nidada.
async function crearFichaPichon(nidadaId, pichonId) {
  const n = state.nidadas.get(nidadaId), h = n && (n.pichones || []).find(x => x.id === pichonId);
  if (!n || !h || tieneFicha(h) || !(h.anilla || h.nombre)) return null;
  const p = { id: uid(), nombre: h.nombre || '', anilla: h.anilla || '', sexo: h.sexo === 'H' ? 'H' : 'M', uso: 'competicion', estado: 'palomar',
    anio: String((fechaValida(h.nacimiento) || fechaValida(n.fecha1) || today()).slice(0, 4)), creado: Date.now() };
  if (n.machoId && state.palomos.has(n.machoId)) p.padreId = n.machoId;
  if (n.hembraId && state.palomos.has(n.hembraId)) p.madreId = n.hembraId;
  await put('palomos', p);
  h.palomoId = p.id;
  await put('nidadas', n);
  return p;
}

/* ---------- Pantallas ---------- */
const nombrePadre = (id, copia) => { const p = state.palomos.get(id); return p ? nameOf(p) : (copia || 'Palomo borrado'); };
const nombresPareja = n => `${nombrePadre(n.machoId, n.machoNombre)} × ${nombrePadre(n.hembraId, n.hembraNombre)}`;
const nidadasOrdenadas = () => [...state.nidadas.values()].sort((a, b) => (Number(b.anio) || 0) - (Number(a.anio) || 0) || String(b.fecha1 || '').localeCompare(String(a.fecha1 || '')));
function subNidada(n) {
  const fase = faseNidada(n), e = eclosionEsperada(n), pi = (n.pichones || []).length;
  return [n.anio, FASE_TXT[fase], fase === 'incubando' && e ? 'eclosión ' + fechaES(e) : '', pi ? `${pi} ${pi === 1 ? 'pichón' : 'pichones'}` : ''].filter(Boolean).join(' · ');
}
function filaNidada(n) {
  return `<a class="item" href="#/nidada/${esc(n.id)}"><div class="txt"><b>${esc(nombresPareja(n))}</b><small>${esc(subNidada(n))}</small></div>${CHEV}</a>`;
}
// Aviso para la lista de palomos (como el de tratamientos).
function avisoCriaLista() {
  const av = avisosCria(); if (!av.length) return '';
  const ecl = av.filter(a => a.tipo === 'eclosion').length, ani = av.length - ecl;
  return `<a class="card warn mt aviso-vac" href="#/cria"><b>Cría</b><span>${[ecl ? `${ecl} ${ecl === 1 ? 'nidada a punto de eclosionar' : 'nidadas a punto de eclosionar'}` : '', ani ? `${ani} ${ani === 1 ? 'pichón' : 'pichones'} por anillar` : ''].filter(Boolean).join(' · ')}. Toque para ver cuáles.</span></a>`;
}
// Bloque que aparece arriba en la pestaña Cría.
function seccionNidadas() {
  const av = avisosCria(), ns = nidadasOrdenadas(), parejas = parejasCria();
  const avisos = av.length ? `<div class="card warn mt"><b>Avisos de cría</b><div class="lista mt">${av.map(a => `<a class="item" href="#/nidada/${esc(a.n.id)}"><div class="txt"><b>${esc(nombresPareja(a.n))}</b><small>${esc(textoAvisoCria(a))}</small></div>${CHEV}</a>`).join('')}</div></div>` : '';
  const hist = parejas.length ? `<p class="seccion">Historial de parejas</p><div class="lista">${parejas.map(x => `<a class="item" href="#/arbolpareja/${esc(x.m)}/${esc(x.h)}"><div class="txt"><b>${esc(nombrePadre(x.m))} × ${esc(nombrePadre(x.h))}</b><small>${esc([`${x.nidadas} ${x.nidadas === 1 ? 'nidada' : 'nidadas'}`, `${x.pichones} ${x.pichones === 1 ? 'pichón' : 'pichones'}`, x.conResultados ? `${x.conResultados} con resultados` : '', x.mejorPuesto ? `mejor puesto ${x.mejorPuesto}º` : ''].filter(Boolean).join(' · '))}</small></div>${CHEV}</a>`).join('')}</div>` : '';
  return `${avisos}
    <a class="btn mt2" href="#/nidada/nueva">${ic('plus')} Nueva nidada</a>
    <p class="seccion">Mis nidadas</p>
    ${ns.length ? `<div class="lista">${ns.map(filaNidada).join('')}</div>` : '<div class="card"><p class="muted" style="margin:0">Todavía no hay nidadas. Cuando empareje una pareja, apunte aquí la puesta, los huevos y los pichones.</p></div>'}
    ${hist}
    <p class="seccion">Parejas recomendadas</p>`;
}

// Nueva nidada: se elige la pareja y la fecha del primer huevo.
const nueva = { m: null, h: null, fecha1: '' };
function viewNidadaNueva() {
  setHeader('Nueva nidada', true);
  if (!nueva.fecha1) nueva.fecha1 = today();
  app.innerHTML = `<form id="f" novalidate><p class="resumen" style="margin-top:4px">Elija la pareja y apunte cuándo puso el primer huevo.</p>
    ${etq('Macho')}<button type="button" class="pick" id="pm"></button>
    ${etq('Hembra')}<button type="button" class="pick" id="ph"></button>
    ${campo('fecha1', 'Primer huevo', `<input id="fecha1" type="date" value="${esc(nueva.fecha1)}">`)}
    <div id="pres"></div><div id="ferr"></div>
    <div class="savebar"><button class="btn" type="submit">Crear la nidada</button></div></form>`;
  const boton = (b, p, label, sexo, clave) => {
    b.className = 'pick' + (p ? ' set' : '');
    b.innerHTML = p ? `${avatar(p, 's')}<span><span class="pl">${label}</span><b>${esc(nameOf(p))}</b></span>${CHEV}` : `<span><b>Elegir ${label.toLowerCase()}</b><span class="pl">Toque aquí</span></span>${CHEV}`;
    b.onclick = () => openPicker({ titulo: 'Elegir ' + label.toLowerCase(), sexo, permitirNuevo: true, onPick: id => { nueva[clave] = id; viewNidadaNueva(); } });
  };
  boton($('#pm'), state.palomos.get(nueva.m), 'Macho', 'M', 'm');
  boton($('#ph'), state.palomos.get(nueva.h), 'Hembra', 'H', 'h');
  if (nueva.m && nueva.h && state.palomos.has(nueva.m) && state.palomos.has(nueva.h)) {
    $('#pres').innerHTML = tarjetaPareja(nueva.m, nueva.h) + inbreedBox(kinship(nueva.m, nueva.h), 'Consanguinidad de los pichones');
  }
  $('#fecha1').onchange = e => { nueva.fecha1 = e.target.value; };
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const f = fechaValida($('#fecha1').value);
    if (!nueva.m || !nueva.h) { $('#ferr').innerHTML = '<p class="err">Elija el macho y la hembra.</p>'; return; }
    if (!f) { $('#ferr').innerHTML = '<p class="err">Indique la fecha del primer huevo.</p>'; return; }
    const n = nidadaVacia(nueva.m, nueva.h, f);
    n.machoNombre = nameOf(state.palomos.get(nueva.m)); n.hembraNombre = nameOf(state.palomos.get(nueva.h));
    await put('nidadas', n);
    nueva.m = nueva.h = null; nueva.fecha1 = '';
    location.hash = '#/nidada/' + n.id;
  };
}

// Una nidada: fechas, huevos, pichones y notas. Cada cambio se guarda al momento.
function viewNidada(id) {
  const n = state.nidadas.get(id);
  if (!n) { setHeader('No encontrada', true); app.innerHTML = '<div class="card mt"><p>Esta nidada ya no existe.</p><a class="btn mt" href="#/cria">Volver a la cría</a></div>'; return; }
  setHeader('Nidada', true);
  const guardar = async () => {
    const m = state.palomos.get(n.machoId), h = state.palomos.get(n.hembraId);
    if (m) n.machoNombre = nameOf(m); if (h) n.hembraNombre = nameOf(h);
    await put('nidadas', n);
  };
  const eclo = () => { const e = eclosionEsperada(n); return e ? `Eclosión esperada: <b>${esc(fechaES(e))}</b> (${diasIncubacion()} días desde el segundo huevo)` : 'Apunte la fecha del primer huevo para calcular la eclosión.'; };
  const pintar = () => {
    const hist = historialPareja(n.machoId, n.hembraId);
    const enlace = (pid, copia) => state.palomos.has(pid) ? `<a href="#/p/${esc(pid)}">${esc(nameOf(state.palomos.get(pid)))}</a>` : esc(copia || 'Palomo borrado');
    app.innerHTML = `<h1 class="grande">${enlace(n.machoId, n.machoNombre)} × ${enlace(n.hembraId, n.hembraNombre)}</h1>
      <p class="resumen">${esc(FASE_TXT[faseNidada(n)])} · ${esc(n.anio)}</p>
      <div class="card"><p id="eclo" style="margin:0">${eclo()}</p>
        ${campo('fecha1', 'Primer huevo', `<input id="fecha1" type="date" data-k="fecha1" value="${esc(n.fecha1)}">`)}
        ${campo('fecha2', 'Segundo huevo (si no lo apunta, se cuentan 2 días)', `<input id="fecha2" type="date" data-k="fecha2" value="${esc(n.fecha2)}">`)}</div>
      <p class="seccion">Huevos · ${(n.huevos || []).length}</p>
      ${(n.huevos || []).length ? `<div class="lista">${n.huevos.map((x, i) => `<div class="item"><div class="txt"><b>Huevo ${i + 1}</b></div>
        <select data-h="${i}" aria-label="Estado del huevo ${i + 1}">${Object.entries(ESTADO_HUEVO).map(([v, l]) => `<option value="${v}" ${(x.estado || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button type="button" class="icon-btn" data-delh="${i}" aria-label="Quitar el huevo ${i + 1}">${ic('trash')}</button></div>`).join('')}</div>` : ''}
      <button class="btn sec mt" type="button" id="addh">${ic('plus')} Añadir un huevo</button>
      <p class="seccion">Pichones · ${(n.pichones || []).length}</p>
      ${(n.pichones || []).map((h, i) => {
        const edad = edadPichon(h), ficha = tieneFicha(h) ? state.palomos.get(h.palomoId) : null;
        return `<div class="card mt" data-pi="${i}"><b>Pichón ${i + 1}${edad !== null ? ` · ${edad} ${edad === 1 ? 'día' : 'días'}` : ''}</b>
          ${campo('nac' + i, 'Nació el', `<input id="nac${i}" type="date" data-k="nacimiento" value="${esc(h.nacimiento)}">`)}
          ${campo('ani' + i, 'Anilla', `<input id="ani${i}" data-k="anilla" value="${esc(h.anilla)}" placeholder="Cuando se anille" autocapitalize="characters">`)}
          ${campo('nom' + i, 'Nombre (opcional)', `<input id="nom${i}" data-k="nombre" value="${esc(h.nombre)}" autocapitalize="words">`)}
          ${campo('sex' + i, 'Sexo', `<select id="sex${i}" data-k="sexo"><option value="M" ${h.sexo !== 'H' ? 'selected' : ''}>Macho</option><option value="H" ${h.sexo === 'H' ? 'selected' : ''}>Hembra</option></select>`)}
          ${campo('est' + i, 'Estado', `<select id="est${i}" data-k="estado">${Object.entries(ESTADO_PICHON).map(([v, l]) => `<option value="${v}" ${(h.estado || 'vivo') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
          ${ficha ? `<a class="btn tonal mt" href="#/p/${esc(ficha.id)}">Ver su ficha</a>` : `<button type="button" class="btn tonal mt" data-ficha="${i}">Crear su ficha</button>`}
          <button type="button" class="btn danger mt" data-delp="${i}">Quitar este pichón</button></div>`;
      }).join('')}
      <button class="btn sec mt" type="button" id="addp">${ic('plus')} Añadir un pichón</button>
      <p class="seccion">Notas</p>
      <div class="campo"><textarea id="notas" data-k="notas" placeholder="Nido, jaula, cómo fue la puesta…">${esc(n.notas)}</textarea></div>
      <p class="seccion">Esta pareja</p>
      <div class="card"><p style="margin:0">${hist.nidadas} ${hist.nidadas === 1 ? 'nidada' : 'nidadas'} · ${hist.pichones} ${hist.pichones === 1 ? 'pichón' : 'pichones'}${hist.conResultados ? ` · ${hist.conResultados} con resultados` : ''}${hist.mejorPuesto ? ` · mejor puesto ${hist.mejorPuesto}º` : ''}</p>
        ${state.palomos.has(n.machoId) && state.palomos.has(n.hembraId) ? `<a class="btn tonal mt" href="#/arbolpareja/${esc(n.machoId)}/${esc(n.hembraId)}">${ic('tree')} Ver el árbol de la pareja</a>` : ''}</div>
      <button type="button" class="btn danger mt2" id="delnid">Borrar esta nidada</button>`;
  };
  pintar();
  // Cambios de texto, fecha y selección: se guardan sin repintar (así no se pierde el cursor).
  app.onchange = async e => {
    const t = e.target;
    if (t.dataset.h !== undefined) { n.huevos[Number(t.dataset.h)].estado = t.value; await guardar(); return; }
    const k = t.dataset.k; if (!k) return;
    const carta = t.closest('[data-pi]');
    if (carta) {
      const h = n.pichones[Number(carta.dataset.pi)]; if (!h) return;
      h[k] = k === 'nacimiento' ? fechaValida(t.value) : k === 'anilla' ? t.value.trim().toUpperCase() : t.value.trim();
      await guardar();
      if (k === 'nacimiento') { const b = carta.querySelector('b'); const ed = edadPichon(h); if (b) b.textContent = `Pichón ${Number(carta.dataset.pi) + 1}${ed !== null ? ` · ${ed} ${ed === 1 ? 'día' : 'días'}` : ''}`; }
      return;
    }
    n[k] = k === 'fecha1' || k === 'fecha2' ? fechaValida(t.value) : t.value;
    if (k === 'fecha1' && n.fecha1) n.anio = Number(n.fecha1.slice(0, 4));
    await guardar();
    if (k !== 'notas') $('#eclo').innerHTML = eclo();
  };
  app.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'addh') { n.huevos = [...(n.huevos || []), { id: uid(), estado: '' }]; await guardar(); pintar(); return; }
    if (b.id === 'addp') { n.pichones = [...(n.pichones || []), { id: uid(), nacimiento: today(), anilla: '', nombre: '', sexo: 'M', estado: 'vivo' }]; await guardar(); pintar(); return; }
    if (b.dataset.delh !== undefined) { n.huevos.splice(Number(b.dataset.delh), 1); await guardar(); pintar(); return; }
    if (b.dataset.delp !== undefined) {
      if (!confirm('¿Quitar este pichón de la nidada? Si ya tiene ficha, la ficha no se borra.')) return;
      n.pichones.splice(Number(b.dataset.delp), 1); await guardar(); pintar(); return;
    }
    if (b.dataset.ficha !== undefined) {
      const h = n.pichones[Number(b.dataset.ficha)];
      if (!h.anilla && !h.nombre) { toast('Apunte primero la anilla o el nombre'); return; }
      const p = await crearFichaPichon(n.id, h.id);
      if (p) { toast('Ficha creada'); location.hash = '#/p/' + p.id; }
      return;
    }
    if (b.id === 'delnid') {
      if (!confirm('¿Borrar esta nidada? No se borran las fichas de los pichones.')) return;
      await delMany('nidadas', [n.id]); location.hash = '#/cria';
    }
  };
}
