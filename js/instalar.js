'use strict';
/* Colombaire — Instalar en el móvil (código QR). (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */
/* ---------- Instalar en el móvil: código QR con la dirección de la app ---------- */
const direccionApp = () => location.protocol.startsWith('http') ? location.origin + location.pathname.replace(/index\.html$/, '') : '';
function viewInstalar() {
  setHeader('Instalar en el móvil', true);
  const url = direccionApp();
  let qr = '';
  try { if (url && window.qrcode) { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 6, margin: 4, scalable: true }); } } catch (e) { /* sin QR */ }
  app.innerHTML = `<h1 class="grande">En el móvil</h1><p class="resumen">Instale la app para abrirla como cualquier otra</p>
    ${qr ? `<div class="card qr">${qr}<p class="muted" style="margin:10px 0 0;text-align:center">Apunte la cámara del móvil a este código</p></div>` : ''}
    ${url ? `<div class="card mt"><div class="dato" style="padding:0"><span>Dirección</span><b>${esc(url)}</b></div></div>` : ''}
    <p class="seccion">Pasos</p>
    <div class="card"><ol class="pasos">
      <li>Abra la dirección en <b>Chrome</b> (Android) o en <b>Safari</b> (iPhone).</li>
      <li>Android: menú <b>⋮</b> → <b>Añadir a pantalla de inicio</b> (o <b>Instalar aplicación</b>). iPhone: botón compartir → <b>Añadir a pantalla de inicio</b>.</li>
      <li>Abra la app y entre con su correo. Si es su primera vez, pida el código.</li>
    </ol></div>`;
}
