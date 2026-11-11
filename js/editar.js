'use strict';
/* Colombaire — Pantallas: añadir/editar palomo y resultado de concurso. (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */
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
    $('#fimg').innerHTML = fotoSegura(d.foto)
      ? `<img src="${esc(d.foto)}" alt=""><div class="cambiar">Cambiar la foto</div>`
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
