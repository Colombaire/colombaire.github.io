'use strict';
/* Guardián de privacidad: el código que se publica no puede llevar datos de palomos ni de personas.
   La lista de términos prohibidos NO está en este archivo (se publicaría): vive en `privado/terminos-prohibidos.txt`,
   que git ignora. Una expresión regular por línea; las líneas que empiezan por # se ignoran.
   Sin ese archivo la primera prueba se salta (por ejemplo, en una copia nueva del proyecto).
   Mira todos los archivos que git subiría (los rastreados y los nuevos no ignorados). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const LISTA = path.join(RAIZ, 'privado', 'terminos-prohibidos.txt');
const EXTENSIONES = new Set(['.js', '.html', '.css', '.md', '.json', '.sql', '.webmanifest', '.bat', '.svg', '.txt', '.ts']);

function archivosPublicables() {
  const salida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: RAIZ, encoding: 'utf8' });
  return salida.split('\0').filter(Boolean).filter(f => fs.existsSync(path.join(RAIZ, f)));
}

test('ningún archivo publicable contiene datos de palomos ni nombres de personas', t => {
  if (!fs.existsSync(LISTA)) { t.skip('no hay privado/terminos-prohibidos.txt'); return; }
  const prohibido = fs.readFileSync(LISTA, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => new RegExp(l, 'i'));
  let archivos;
  try { archivos = archivosPublicables(); } catch (e) { t.skip('git no está disponible'); return; }
  const hallazgos = [];
  for (const f of archivos.map(x => x.replace(/\\/g, '/'))) {
    if (f.startsWith('lib/') || f.startsWith('fuentes/')) continue;
    if (!EXTENSIONES.has(path.extname(f).toLowerCase())) continue;
    const texto = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    for (const re of prohibido) if (re.test(texto)) hallazgos.push(`${f}: ${re}`);
  }
  assert.deepEqual(hallazgos, [], 'Datos privados en archivos que se publicarían:\n' + hallazgos.join('\n'));
});

test('la carpeta privada y los datos locales están ignorados por git', () => {
  const ignorados = execFileSync('git', ['check-ignore', 'privado/x.json', 'datos/x.json'], { cwd: RAIZ, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.equal(ignorados.length, 2);
});
