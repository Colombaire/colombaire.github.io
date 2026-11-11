'use strict';
/* Colombaire — Utilidades de datos, consanguinidad, genética y probabilidades. (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */
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
