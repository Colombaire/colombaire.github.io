'use strict';
/* Colombaire — Añadir desde la libreta: foto, Google Lens y lector de hojas. (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */
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
