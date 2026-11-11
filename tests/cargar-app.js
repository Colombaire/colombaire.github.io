'use strict';
/* Carga los archivos de js/ (en el orden de index.html) tal cual en un entorno simulado (sin navegador) para poder probar sus funciones desde Node.
   No hace falta instalar nada: solo Node 20 o más. Uso: `npm test` (o `node --test tests/`). */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Objeto «comodín»: acepta cualquier llamada o propiedad y devuelve otro comodín (para el DOM que no se prueba).
const comodin = new Proxy(function () {}, {
  get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : comodin),
  set: () => true,
  apply: () => comodin,
});

function cargarApp({ localStorage = {} } = {}) {
  const almacen = new Map(Object.entries(localStorage));
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Intl, URL, Blob, File: globalThis.File,
    fetch: async () => { throw new Error('sin red'); },
    crypto: globalThis.crypto, navigator: { onLine: true }, history: { length: 1, state: null },
    confirm: () => true, alert: () => {}, indexedDB: undefined,
    location: { hash: '#/', protocol: 'file:', origin: 'null', pathname: '/' },
    localStorage: {
      getItem: k => (almacen.has(k) ? almacen.get(k) : null), setItem: (k, v) => almacen.set(k, String(v)), removeItem: k => almacen.delete(k),
      key: i => [...almacen.keys()][i] ?? null, get length() { return almacen.size; },
    },
    document: { querySelector: () => comodin, querySelectorAll: () => [], addEventListener() {}, createElement: () => comodin, body: comodin, activeElement: null, title: '' },
  };
  ctx.window = ctx; ctx.MI_PALOMAR_CONFIG = {};
  ctx.addEventListener = () => {}; ctx.scrollTo = () => {};
  vm.createContext(ctx);
  const raiz = path.join(__dirname, '..');
  const scripts = [...fs.readFileSync(path.join(raiz, 'index.html'), 'utf8').matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
  // Se juntan en un solo programa, como si fueran etiquetas <script> seguidas que comparten ámbito.
  vm.runInContext(scripts.map(f => fs.readFileSync(path.join(raiz, f), 'utf8')).join('\n'), ctx, { filename: 'js/app-completa.js' });
  // Evalúa una expresión dentro de la app (sirve también para constantes y funciones no globales).
  const ev = codigo => vm.runInContext(codigo, ctx);
  return { ctx, ev, almacen };
}
module.exports = { cargarApp };
