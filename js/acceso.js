'use strict';
/* Colombaire — Acceso: cuenta obligatoria, código por correo y contraseña. (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */
/* ---------- Acceso: cuenta obligatoria, código por correo y contraseña propia ----------
   Solo entran personas invitadas (el registro está cerrado en Supabase). Cómo se entra:
   1) Primera vez («Active su cuenta») o contraseña olvidada: se pide un código de un solo uso, que llega por correo.
      Escribirlo confirma que el correo es del usuario. Son dos pantallas distintas con el mismo mecanismo.
   2) Después de cualquier entrada con código, la app obliga a elegir una contraseña propia antes de dejar usar nada.
   3) Siguientes veces: correo y contraseña. La sesión queda guardada y la app funciona sin conexión. */
// En un dispositivo donde nadie ha entrado nunca, se abre directamente «Active su cuenta» (solo el correo, sin contraseña).
const yaEntroAqui = () => { try { return localStorage.getItem('yaEntro') === '1'; } catch (e) { return false; } };
const entrada = { modo: yaEntroAqui() ? 'entrar' : 'activar', correo: '', hasta: 0, motivo: 'activar' }; // modo: entrar | activar | olvido | verificar
let accesoMostrado = null;
// Qué debe ver el usuario: la app (ok), la entrada, la elección de contraseña o un aviso de servicio no disponible.
function estadoAcceso() {
  if (!nube.sesion && !nube.pidiendoEntrada) return 'ok'; // sin cuenta: la app se abre directamente con los datos de este dispositivo
  if (!nubeConfigurada() || !window.supabase || !nube.sb) return 'noservicio';
  if (!nube.sesion) return 'entrar';
  const md = (nube.sesion.user && nube.sesion.user.user_metadata) || {};
  if (nube.cambiandoClave || !md.clave_elegida) return 'clave';
  return 'ok';
}
function mensajeError(e) {
  const m = (e && e.message) || '';
  if (/invalid login|invalid credentials/i.test(m)) return 'El correo o la contraseña no son correctos. Si es su primera vez, active su cuenta; si la ha olvidado, pida un código nuevo.';
  if (/token has expired|otp.*expired|expired|invalid.*(token|otp)|otp/i.test(m)) return 'El código no es correcto o ya ha caducado. Pida uno nuevo.';
  if (/only request this after|security purposes/i.test(m)) return 'Espere un minuto antes de pedir otro código.';
  if (/error sending|sending (confirmation|magic|recovery|email|otp)|smtp|unexpected_failure/i.test(m)) return 'Ahora mismo no se ha podido enviar el correo con el código. No es un fallo suyo: inténtelo de nuevo en unos minutos y, si sigue igual, avise a quien administra la app.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos seguidos. Espere unos minutos y vuelva a probar.';
  if (/failed to fetch|network/i.test(m)) return 'No hay conexión a internet. Inténtelo de nuevo cuando tenga cobertura.';
  if (/different from the old/i.test(m)) return 'La contraseña nueva tiene que ser distinta de la anterior.';
  if (/password should be|at least/i.test(m)) return 'La contraseña es demasiado corta o demasiado fácil.';
  return m || 'No se ha podido completar. Inténtelo de nuevo.';
}
const CLAVES_FLOJAS = ['12345678', '123456789', '1234567890', '87654321', 'password', 'password1', 'contraseña', 'contrasena1', 'qwertyui', 'qwerty123', '11111111', '00000000', 'palomos123', 'palomar123'];
function validarClave(c, correo) {
  if (c.length < 8) return 'La contraseña tiene que tener al menos 8 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(c) || !/\d/.test(c)) return 'Use letras y al menos un número.';
  if (CLAVES_FLOJAS.includes(c.toLowerCase()) || (correo && c.toLowerCase() === correo.toLowerCase())) return 'Esa contraseña es demasiado fácil de adivinar. Elija otra.';
  return '';
}
// Guardar la contraseña de verdad en el gestor de contraseñas del dispositivo (Credential Management API).
// La app nunca guarda la contraseña por su cuenta: la custodia el navegador/móvil, que la rellena al entrar.
async function guardarCredencial(email, password) {
  try {
    if (window.PasswordCredential && navigator.credentials && email && password) {
      await navigator.credentials.store(new PasswordCredential({ id: email, password, name: email }));
      return true;
    }
  } catch (e) { /* el navegador no lo permite: se usará el aviso normal de «guardar contraseña» */ }
  return false;
}
async function credencialGuardada() {
  try {
    if (window.PasswordCredential && navigator.credentials) {
      const c = await navigator.credentials.get({ password: true, mediation: 'optional' });
      if (c && c.id && c.password) return c;
    }
  } catch (e) { /* sin credencial */ }
  return null;
}
const cabeceraAcceso = '<section class="hero-pal hero-entrada"><div class="hero-marca"><img class="hero-logo" src="media/cabecera.png" alt="Fe de Rates"><div class="hero-fila"><div class="hero-nombre">Colombaire</div></div></div></section><p class="eyebrow-c entrada-lema">Sus palomos, su pedigrí y sus concursos, siempre a mano</p>';
function viewAcceso(estado) {
  document.title = 'Entrar · Colombaire';
  document.body.dataset.top = 'no';
  if (estado === 'noservicio') viewSinServicio();
  else if (estado === 'clave') viewElegirClave();
  else viewEntrar();
  // El nombre «Colombaire» de la banda del logo se ajusta al tamaño de la banda.
  if (typeof ajustarNombrePalomar === 'function') {
    ajustarNombrePalomar();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarNombrePalomar);
  }
}
function viewSinServicio() {
  const sinConfig = !nubeConfigurada();
  app.innerHTML = `<div class="entrar">${cabeceraAcceso}
    <div class="card mt2"><h2 style="margin:0 0 6px">${sinConfig ? 'La app no está configurada' : 'No se puede entrar ahora'}</h2>
      <p class="muted" style="margin:0">${sinConfig ? 'Falta conectar la app con su base de datos (archivo config.js).' : 'No se ha podido cargar el servicio de acceso. Compruebe que tiene conexión a internet e inténtelo de nuevo.'}</p>
      ${sinConfig ? '' : '<button class="btn mt2" type="button" id="reint">Reintentar</button>'}</div></div>`;
  if (!sinConfig) $('#reint').onclick = () => location.reload();
}
function viewEntrar() {
  const m = entrada.modo;
  let correo = entrada.correo; if (!correo) { try { correo = localStorage.getItem('ultimoCorreo') || ''; } catch (e) { /* sin almacenamiento */ } }
  const titulo = { entrar: 'Entrar', activar: 'Active su cuenta', olvido: 'He olvidado mi contraseña', verificar: 'Escriba el código' }[m];
  const ayuda = {
    entrar: 'Escriba su correo y su contraseña.',
    activar: 'Solo para la primera vez. Escriba el correo con el que le han invitado y le enviaremos un código de 6 cifras para activar su cuenta. Después elegirá su contraseña.',
    olvido: 'Escriba su correo y le enviaremos un código de 6 cifras para elegir una contraseña nueva.',
    verificar: `Si su correo está autorizado, en unos instantes recibirá un código en ${esc(entrada.correo)} (mire también en «No deseado»). Caduca en 10 minutos.`,
  }[m];
  const campos = {
    entrar: campo('ce', 'Correo electrónico', `<input id="ce" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="nombre@correo.com" value="${esc(correo)}">`)
      + campo('cc', 'Contraseña', '<input id="cc" type="password" autocomplete="current-password" placeholder="Su contraseña">')
      + '<label class="chk"><input type="checkbox" id="ver"> Mostrar la contraseña</label>',
    activar: campo('ce', 'Correo electrónico', `<input id="ce" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="nombre@correo.com" value="${esc(correo)}">`),
    olvido: campo('ce', 'Correo electrónico', `<input id="ce" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="nombre@correo.com" value="${esc(correo)}">`),
    verificar: campo('cd', 'Código de 6 cifras', '<input id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="000000">'),
  }[m];
  const boton = { entrar: 'Entrar', activar: 'Enviarme el código', olvido: 'Enviarme el código', verificar: 'Comprobar el código' }[m];
  const enlaces = {
    entrar: '<button type="button" class="btn sec" data-m="activar">Es mi primera vez: activar mi cuenta</button><button type="button" class="enlace" data-m="olvido">He olvidado mi contraseña</button><button type="button" class="enlace" id="sincuenta">Seguir sin cuenta</button>',
    activar: '<button type="button" class="btn sec" data-m="entrar">Ya tengo contraseña: entrar</button><button type="button" class="enlace" data-m="olvido">He olvidado mi contraseña</button>',
    olvido: '<button type="button" class="btn sec" data-m="entrar">Volver a «Entrar»</button><button type="button" class="enlace" data-m="activar">Es mi primera vez: activar mi cuenta</button>',
    verificar: `<button type="button" class="btn sec" id="reenviar" disabled>Pedir otro código</button><button type="button" class="enlace" data-m="${entrada.motivo}">Cambiar de correo</button>`,
  }[m];
  app.innerHTML = `<div class="entrar">${cabeceraAcceso}
    <div class="card mt2"><h2 style="margin:0 0 6px">${titulo}</h2><p class="muted" style="margin:0 0 4px">${ayuda}</p>
      <form id="fe" novalidate>${campos}<div id="eerr"></div><button class="btn mt2" type="submit" id="eok">${boton}</button></form></div>
    <div class="entrar-links">${enlaces}</div></div>`;
  app.querySelectorAll('[data-m]').forEach(b => { b.onclick = () => { entrada.modo = b.dataset.m; if (['activar', 'olvido'].includes(b.dataset.m)) entrada.motivo = b.dataset.m; entrada.correo = ($('#ce') && $('#ce').value.trim()) || entrada.correo; route(); }; });
  if ($('#sincuenta')) $('#sincuenta').onclick = () => { nube.pidiendoEntrada = false; location.hash = '#/mas'; route(); };
  const ver = $('#ver'); if (ver) ver.onchange = () => { $('#cc').type = ver.checked ? 'text' : 'password'; };
  // Si el dispositivo tiene una contraseña guardada, se rellena sola y se entra con un toque.
  if (m === 'entrar') credencialGuardada().then(c => {
    if (!c || !$('#ce') || !$('#ce').isConnected) return;
    $('#ce').value = c.id; $('#cc').value = c.password;
    const b = $('#eok'); if (b) { b.textContent = 'Entrar con la contraseña guardada'; }
  });
  const aviso = (t, ok) => { $('#eerr').innerHTML = `<p class="${ok ? 'ok-msg' : 'err'}">${esc(t)}</p>`; };
  const pedirCodigo = async email => {
    const { error } = await nube.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    // Un correo no invitado da el mismo mensaje que uno invitado, para no revelar quién tiene cuenta.
    if (error && !/signups? not allowed|user not found|not allowed/i.test(error.message || '')) throw error;
    entrada.modo = 'verificar'; entrada.correo = email; entrada.hasta = Date.now() + 60000; route();
  };
  if (m === 'verificar') {
    const re = $('#reenviar'); const t = setInterval(() => {
      if (!re.isConnected) return clearInterval(t);
      const s = Math.ceil((entrada.hasta - Date.now()) / 1000);
      if (s > 0) re.textContent = `Pedir otro código (${s} s)`; else { re.textContent = 'Pedir otro código'; re.disabled = false; clearInterval(t); }
    }, 500);
    re.onclick = async () => { re.disabled = true; try { await pedirCodigo(entrada.correo); } catch (x) { aviso(mensajeError(x)); } };
  }
  $('#fe').onsubmit = async e => {
    e.preventDefault();
    const b = $('#eok'); const texto = b.textContent;
    try {
      if (m === 'verificar') {
        const token = $('#cd').value.replace(/\s/g, '');
        if (!/^\d{6,8}$/.test(token)) return aviso('Escriba las cifras del código que le hemos enviado.');
        b.disabled = true; b.textContent = 'Un momento…';
        nube.cambiandoClave = true; nube.voluntario = false; // tras un código siempre se elige contraseña propia
        const { error } = await nube.sb.auth.verifyOtp({ email: entrada.correo, token, type: 'email' });
        if (error) { nube.cambiandoClave = false; throw error; }
        await nube.sb.auth.updateUser({ data: { clave_elegida: false } });
        entrada.modo = 'entrar';
        if (nube.sesion) { nube.sesion = { ...nube.sesion, user: { ...nube.sesion.user, user_metadata: { ...(nube.sesion.user.user_metadata || {}), clave_elegida: false } } }; }
        route();
        return;
      }
      const email = $('#ce').value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return aviso('Escriba un correo válido, por ejemplo nombre@gmail.com.');
      try { localStorage.setItem('ultimoCorreo', email); } catch (x) { /* sin almacenamiento */ }
      b.disabled = true; b.textContent = 'Un momento…';
      if (m === 'activar' || m === 'olvido') { entrada.motivo = m; await pedirCodigo(email); }
      else {
        const password = $('#cc').value;
        if (!password) { b.disabled = false; b.textContent = texto; return aviso('Escriba su contraseña.'); }
        const { error } = await nube.sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        guardarCredencial(email, password);
        toast('Bienvenido');
      }
    } catch (x) { aviso(mensajeError(x)); }
    finally { if (b.isConnected) { b.disabled = false; b.textContent = texto; } }
  };
}
// Elegir contraseña propia: obligatorio tras entrar con un código; voluntario desde «Cuenta → Cambiar la contraseña».
function viewElegirClave() {
  const voluntario = nube.voluntario;
  document.body.dataset.top = 'no';
  app.innerHTML = `<div class="entrar">${cabeceraAcceso}
    <div class="card mt2"><h2 style="margin:0 0 6px">${voluntario ? 'Cambiar la contraseña' : entrada.motivo === 'olvido' ? 'Elija su contraseña nueva' : 'Su cuenta está activada'}</h2>
      <p class="muted" style="margin:0">${voluntario ? 'Escriba la contraseña nueva.' : entrada.motivo === 'olvido' ? 'Hemos comprobado su correo. Elija una contraseña nueva: con ella entrará la próxima vez. Apúntela en un sitio seguro.' : 'Hemos comprobado su correo. Para terminar, elija una contraseña solo suya: con ella entrará la próxima vez, sin necesitar códigos. Apúntela en un sitio seguro.'}</p>
      <form id="fn" novalidate>
        <input type="email" autocomplete="username" value="${esc((nube.sesion && nube.sesion.user && nube.sesion.user.email) || '')}" hidden readonly>
        ${campo('cn', 'Contraseña nueva', '<input id="cn" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres, con un número">')}
        ${campo('cn2', 'Repítala', '<input id="cn2" type="password" autocomplete="new-password" placeholder="La misma contraseña">')}
        <label class="chk"><input type="checkbox" id="ver"> Mostrar la contraseña</label>
        <div id="eerr"></div>
        <button class="btn mt2" type="submit" id="eok">Guardar la contraseña</button>
      </form></div>
    <div class="entrar-links">${voluntario ? '<button type="button" class="btn sec" id="cancelar">Cancelar</button>' : '<button type="button" class="enlace" id="salir">Salir y entrar con otro correo</button>'}</div></div>`;
  $('#ver').onchange = e => { $('#cn').type = $('#cn2').type = e.target.checked ? 'text' : 'password'; };
  if (voluntario) $('#cancelar').onclick = () => { nube.cambiandoClave = false; nube.voluntario = false; route(); };
  else $('#salir').onclick = async () => { nube.cambiandoClave = false; nube.pidiendoEntrada = true; await nube.sb.auth.signOut(); };
  $('#fn').onsubmit = async e => {
    e.preventDefault();
    const err = t => { $('#eerr').innerHTML = `<p class="err">${esc(t)}</p>`; };
    const c = $('#cn').value, correo = (nube.sesion && nube.sesion.user && nube.sesion.user.email) || '';
    const flojo = validarClave(c, correo);
    if (flojo) return err(flojo);
    if (c !== $('#cn2').value) return err('Las dos contraseñas no coinciden.');
    const b = $('#eok'); b.disabled = true; b.textContent = 'Un momento…';
    const { error } = await nube.sb.auth.updateUser({ password: c, data: { clave_elegida: true } });
    if (error) { b.disabled = false; b.textContent = 'Guardar la contraseña'; return err(mensajeError(error)); }
    if (nube.sesion) nube.sesion = { ...nube.sesion, user: { ...nube.sesion.user, user_metadata: { ...(nube.sesion.user.user_metadata || {}), clave_elegida: true } } };
    nube.cambiandoClave = false; nube.voluntario = false;
    guardarCredencial(correo, c);
    toast(voluntario ? 'Contraseña cambiada' : 'Contraseña guardada');
    location.hash = voluntario ? '#/mas' : '#/'; route(); sincronizar();
  };
}
// Borrar la cuenta y todos sus datos (nube y dispositivo). Antes se descarga una copia y se pide escribir BORRAR.
// Necesita la función `borrar_mi_cuenta` de supabase/schema.sql.
async function borrarCuenta() {
  if (!nube.sb || !nube.sesion) return;
  if (!navigator.onLine || nube.sinConexion) { toast('Para borrar la cuenta hace falta conexión a internet'); return; }
  if (!confirm('Va a BORRAR su cuenta y todos sus datos (palomos, resultados y tratamientos), en la nube y en este dispositivo. No se puede deshacer.\n\nAntes se descargará una copia de seguridad. ¿Continuar?')) return;
  const frase = prompt('Para confirmar, escriba BORRAR (en mayúsculas):');
  if (frase === null) return;
  if (frase.trim() !== 'BORRAR') { toast('No coincide: no se ha borrado nada'); return; }
  try { await exportar(); } catch (e) { if (!confirm('No se pudo guardar la copia de seguridad. ¿Borrar la cuenta igualmente?')) return; }
  const { error } = await nube.sb.rpc('borrar_mi_cuenta');
  if (error) { toast('No se pudo borrar la cuenta. Inténtelo de nuevo más tarde.'); return; }
  try { await nube.sb.auth.signOut(); } catch (e) { /* la sesión ya no existe */ }
  await borrarLocal();
  try { localStorage.clear(); } catch (e) { /* sin almacenamiento */ }
  nube.sesion = null; nube.ultima = null; entrada.modo = 'activar'; entrada.correo = '';
  location.hash = '#/'; route(); toast('Su cuenta y sus datos se han borrado');
}
// Cerrar sesión: primero se guarda todo en la nube y después se vacía este dispositivo.
// Si no se ha podido guardar, antes de vaciar se descarga una copia para no perder nada.
async function cerrarSesion() {
  if (!confirm('¿Cerrar la sesión en este dispositivo?\n\nSus palomos quedan guardados en su cuenta y volverán a aparecer al entrar de nuevo.')) return;
  await sincronizar();
  if (nube.error || nube.sinConexion || !navigator.onLine) {
    if (!confirm('No se han podido guardar los últimos cambios en la nube' + (nube.error ? ' (' + nube.error + ')' : '') + '.\n\nSi cierra la sesión ahora se descargará una copia de seguridad y se borrarán los datos de este dispositivo. ¿Cerrar igualmente?')) return;
    await exportar();
  }
  await nube.sb.auth.signOut();
  await borrarLocal();
  nube.ultima = null; nube.pidiendoEntrada = false; entrada.modo = 'entrar'; entrada.correo = '';
  location.hash = '#/'; route(); toast('Sesión cerrada');
}
