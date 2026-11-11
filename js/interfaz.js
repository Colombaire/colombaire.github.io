'use strict';
/* Colombaire — Piezas de interfaz y ventana para elegir palomo. (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */
/* ---------- Piezas de interfaz ---------- */
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
function avatar(p, size = '') {
  if (p && fotoSegura(p.foto)) return `<img class="av ${size}" src="${esc(p.foto)}" alt="">`;
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
