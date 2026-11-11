'use strict';
/* Colombaire — Árbol genealógico, líneas familiares y cría. (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */
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

  app.innerHTML = `<h1 class="grande">Cría</h1><p class="resumen">Nidadas, pichones y parejas de su palomar</p>
    ${seccionNidadas()}
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
