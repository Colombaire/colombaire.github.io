'use strict';
/* Colombaire — Utilidades, constantes e iconos. (Se carga en orden desde index.html; comparte el ámbito global con los demás archivos de js/.) */

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Toda la app usa la fecha y la hora de España, vaya donde vaya el móvil o el ordenador.
const ZONA = 'Europe/Madrid';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); // AAAA-MM-DD
const anioHoy = () => Number(today().slice(0, 4));
const fechaHora = ms => new Date(ms).toLocaleString('es-ES', { timeZone: ZONA, dateStyle: 'medium', timeStyle: 'short' });

const USO = { competicion: 'Compite', cria: 'Cría', ambos: 'Compite y cría' };
const ESTADO = { palomar: 'En mi palomar', vendido: 'Vendido o regalado', muerto: 'Muerto', historico: 'Histórico (ya no está)', referencia: 'Solo para el pedigrí' };
const PLUMAJES = ['Azul', 'Rojo', 'Bayo', 'Toscado', 'Moracho', 'Gavino', 'Pinto', 'Blanco', 'Negro', 'Prieto', 'Ahumado', 'Rodado', 'Pío', 'Fresa'];
const PRUEBAS = ['Concurso social', 'Comarcal', 'Intercomarcal', 'Regional', 'Regional de jóvenes', 'Copa Comunitats', 'Copa Federación',
  'Campeonato Comunidad Valenciana', 'Campeonato de España CCAA', 'Campeonato de España (Copa del Rey)'];

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  doc: '<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  cross: '<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  tree: '<path d="M12 21v-9M12 12H6V8M12 12h6V8M6 8V5M18 8V5"/><circle cx="12" cy="12" r="1.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M9 17h6"/>',
  down: '<path d="M12 3v12m0 0-4-4m4 4 4-4M5 20h14"/>',
  up: '<path d="M12 15V3m0 0L8 7m4-4 4 4M5 20h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  bird: '<path d="M4 14c3 0 5-2 7-5 1.5-2.2 3-3 5-3a3 3 0 0 1 3 3l2 .5-2 .5c0 5-4 8-9 8H6z"/><path d="M9 20h2M13 20h2"/>',
};
