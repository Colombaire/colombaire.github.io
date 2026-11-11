'use strict';
/* Colombaire — Navegación y arranque de la app. (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */
/* ---------- Navegación ---------- */
function route() {
  if (!modal.hidden) closeModalDom();
  // La cuenta es obligatoria: sin sesión (o sin contraseña propia elegida) solo se ve la pantalla de acceso.
  const acceso = estadoAcceso(); accesoMostrado = acceso; nube.refrescarLuego = false; pintarEstadoRed();
  if (acceso === 'ok') { try { localStorage.setItem('yaEntro', '1'); } catch (e) { /* sin almacenamiento */ } }
  document.body.classList.toggle('sin-sesion', acceso !== 'ok');
  if (acceso !== 'ok') { $('#fab').hidden = true; return viewAcceso(acceso); }
  depthMemo.clear();
  app.onclick = app.onchange = app.oninput = null; // cada pantalla pone los suyos
  const parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
  const [v, a, b, c] = parts;
  window.scrollTo(0, 0);
  $('#fab').hidden = !!v; // el botón «Añadir palomo» solo en la lista
  switch (v) {
    case '': case undefined: setTab('lista'); return viewLista();
    case 'p': setTab('lista'); return viewFicha(a);
    case 'editar': setTab('lista'); return viewEditar(a);
    case 'resultado': setTab('lista'); return viewResultado(a, b);
    case 'arbol': setTab('lista'); return viewArbol(a);
    case 'arbolpareja': setTab('cria'); return viewArbolPareja(a, b);
    case 'cria': setTab('cria'); return viewCria();
    case 'nidada': setTab('cria'); return a === 'nueva' ? viewNidadaNueva() : viewNidada(a);
    case 'familias': setTab('familias'); return viewFamilias(a);
    case 'foto': setTab('lista'); return viewFoto();
    case 'tratamiento': setTab('lista'); return viewTratamiento(a, b);
    case 'completar': setTab('lista'); return viewCompletar();
    case 'instalar': setTab('mas'); return viewInstalar();
    case 'concursos': setTab('lista'); return viewConcursos();
    case 'sanidad': setTab('sanidad'); return a === 'aplicar' ? viewAplicar(b, c) : viewSanidad();
    case 'mas': setTab('mas'); return viewMas();
    default: location.replace('#/');
  }
}
$('#back').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/'; };

(async () => {
  try { db = await idbOpen(); await loadAll(); }
  catch (e) { app.innerHTML = '<div class="card mt"><p>No se pudo abrir la base de datos de este navegador. Pruebe a abrir la app en Chrome.</p></div>'; return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  try { localStorage.removeItem('diseno'); } catch (e) { /* sin almacenamiento */ }
  window.addEventListener('hashchange', route);
  window.addEventListener('online', sincronizar);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
  try { await iniciarNube(); } catch (e) { /* sin servicio de acceso: se muestra el aviso */ }
  route();
  copiaDiariaSiToca().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Cuando llega una versión nueva de la app, se recarga sola una vez para mostrarla.
    const habiaVersion = !!navigator.serviceWorker.controller;
    let recargada = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (habiaVersion && !recargada) { recargada = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  }
})();
