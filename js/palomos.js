'use strict';
/* Colombaire — Pantallas: lista y ficha del palomo. (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */
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

/* ---------- Nombre del palomar (lo escribe cada usuario) ---------- */
const perfilPalomar = () => {
  const p = leerJSON('perfilPalomar', {});
  return { nombre: String((p && p.nombre) || '').trim().split(/\s+/)[0].slice(0, 16), licencia: String((p && p.licencia) || '').trim().slice(0, 40) };
};
function nombrePalomarHtml(nombre) { return esc(nombre); }
function editarPerfilPalomar() {
  const perfil = perfilPalomar();
  modal.hidden = false;
  document.body.classList.add('noscroll');
  history.pushState({ modal: 1 }, '');
  modal.innerHTML = `<div class="sheet" role="dialog" aria-label="Nombre del palomar">
    <div class="sheet-h"><h2>Su palomar</h2><button class="icon-btn x" type="button" aria-label="Cerrar"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    ${campo('pnom', 'Nombre (una palabra)', `<input id="pnom" maxlength="16" autocapitalize="words" autocomplete="off" placeholder="Una sola palabra. Ej.: Olivos" value="${esc(perfil.nombre)}">`)}
    <button class="btn mt2" type="button" id="psave">Guardar</button></div>`;
  $('.x', modal).onclick = closeModal;
  $('#pnom', modal).oninput = e => { e.target.value = e.target.value.replace(/\s+/g, ''); };
  $('#pnom', modal).focus();
  $('#psave', modal).onclick = () => {
    guardarJSON('perfilPalomar', { nombre: $('#pnom', modal).value.replace(/\s+/g, '').slice(0, 16) });
    closeModal();
    viewLista();
    toast('Guardado');
  };
}
function portadaPalomar() {
  const { nombre } = perfilPalomar();
  const enCasa = [...state.palomos.values()].filter(p => (p.estado || 'palomar') === 'palomar').length;
  const anio = String(new Date().getFullYear());
  const parejas = [...state.nidadas.values()].filter(n => String(n.anio) === anio).length;
  const primeros = [...state.resultados.values()].filter(r => Number(r.puesto) === 1).length;
  return `<section class="hero-pal">
      <div class="hero-marca">
        <img class="hero-logo" src="media/cabecera.png" alt="Fe de Rates">
        <div class="hero-fila"><div class="hero-nombre">${nombre ? nombrePalomarHtml(nombre) : 'Palomar'}</div></div>
      </div>
      <button type="button" class="hero-edit" id="pEdit" aria-label="Cambiar el nombre del palomar" title="Cambiar el nombre">${ic('edit')}</button>
    </section>
    <div class="contadores">
      <div><b>${enCasa}</b><span>${enCasa === 1 ? 'palomo' : 'palomos'}</span></div>
      <div><b>${parejas}</b><span title="Nidadas de ${anio}">${parejas === 1 ? 'nidada' : 'nidadas'}</span></div>
      <div class="acc"><b>${primeros || '–'}</b><span title="Primeros puestos en concursos">${primeros === 1 ? 'victoria' : 'victorias'}</span></div>
    </div>`;
}
// Encoge el nombre del palomar hasta que quepa entero en el rombo de la cinta del logo.
function ajustarNombrePalomar() {
  const n = $('.hero-nombre');
  if (!n) return;
  n.style.fontSize = '';
  let px = parseFloat(getComputedStyle(n).fontSize);
  while (px > 9 && (n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1)) { px -= 1; n.style.fontSize = px + 'px'; }
}
let ajusteNombreListo = false;
function conectarPortada() {
  ajustarNombrePalomar();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarNombrePalomar);
  if (!ajusteNombreListo) { ajusteNombreListo = true; window.addEventListener('resize', ajustarNombrePalomar); }
  const a = $('#pEdit');
  if (a) a.onclick = editarPerfilPalomar;
}

function viewLista() {
  setHeader('Mis palomos', false);
  if (!state.palomos.size) {
    app.innerHTML = `${portadaPalomar()}
      <div class="card empty mt2"><p>Empiece añadiendo su primer palomo. Solo hace falta el nombre o la anilla; lo demás se puede completar después.</p>
      <a class="btn mt" href="#/editar/nuevo">${ic('plus')} Añadir mi primer palomo</a>
      <a class="btn tonal mt" href="#/foto">${ic('camera')} Añadir desde la libreta (foto)</a></div>`;
    conectarPortada();
    return;
  }
  app.innerHTML = `${portadaPalomar()}
    <h1 class="subtit">En el palomar</h1>
    ${avisoVacunasLista()}
    ${avisoCriaLista()}
    <div class="row accesos"><a class="btn sec" href="#/concursos">${ic('trophy')} Concursos</a><a class="btn sec" href="#/completar">${ic('edit')} Completar${totalPorCompletar() ? ' · ' + totalPorCompletar() : ''}</a></div>
    <a class="btn tonal desde-foto" href="#/foto">${ic('camera')} Añadir desde la libreta (foto)</a>
    <div class="buscar">${ic('search')}<input id="q" type="search" placeholder="Buscar nombre o anilla" value="${esc(ui.q)}" aria-label="Buscar"></div>
    ${chips('filtro', [['todos', 'Todos'], ['competicion', 'Compiten'], ['cria', 'Crían']], ui.filtro)}
    <label class="chk"><input type="checkbox" id="vt" ${ui.verTodos ? 'checked' : ''}> Ver también los que ya no están y los de pedigrí</label>
    <div id="res"></div>${avisoCopiaPendiente()}${backupReminder()}`;
  conectarAvisoCopia();
  conectarPortada();
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
    ${fotoSegura(p.foto)
      ? `<div class="foto"><img src="${esc(p.foto)}" alt="Foto de ${esc(nameOf(p))}"></div>`
      : `<a class="foto vacia" href="#/editar/${id}"><span class="ini">${esc(iniciales(p))}</span><span>${ic('camera')} Añadir una foto</span></a>`}
    <div class="carnet-cab"><span>Ficha</span><span>${esc([sexoTxt(p), p.anio].filter(Boolean).join(' · '))}</span></div>
    <div class="anilla-grande${p.anilla ? '' : ' sin'}">${esc(p.anilla || 'Sin anilla')}</div>
    ${p.nombre ? `<h2 class="pname">${esc(p.nombre)}</h2>` : ''}

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
