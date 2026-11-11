# Plan de trabajo de Colombaire

Nacido de la auditoría de noviembre de 2026. Estado a fecha 11 de noviembre de 2026.
Regla general: nada se sube a GitHub, se publica en Supabase ni se commitea sin que se pida.

## Decisiones tomadas

1. **Arquitectura**: la app va en internet (alojamiento estático con `https` + Supabase), con una cuenta por usuario; cada uno ve solo lo suyo. El ordenador sirve para copias locales (manuales o diarias automáticas).
2. **Cuenta obligatoria**, correo confirmado con un **código de 6 cifras de un solo uso**, que se cambia por la contraseña propia del usuario. **Registro abierto: cada usuario crea su propia cuenta** (nadie las da de alta a mano; cambio del 11 nov 2026, antes era solo por invitación). El correo confirmado con código es la barrera. Hasta que se cambie en Supabase y en la app, el registro sigue cerrado.
3. **Lectura de hojas de la libreta solo con Google Lens**, sin IA de pago (la función `leer-hoja` se eliminó).
4. **Fecha y hora de España** (`Europe/Madrid`) en toda la app.
5. **El servidor del ordenador (`server.js`) se eliminó**: se saltaba las cuentas.
6. **Ningún dato de palomos ni de personas va en el código ni en GitHub.** Los datos de cada usuario viven solo en su cuenta. Los datos de la cuenta piloto están en una carpeta local privada (`privado/`, ignorada por git; copia en `Documentos\mi-palomar-privado`) para importarlos desde «Recuperar una copia» en su cuenta.

## Hecho

| Fase | Qué | Estado |
|---|---|---|
| 0 | README al día, `.gitignore` con `privado/` y `datos/`, datos privados fuera del código, historial de GitHub limpio y app publicada | Hecho. |
| 1B | Cuenta obligatoria: entrada por código, contraseña propia obligatoria, cambio de contraseña, comprobación del dueño de los datos del dispositivo, sesión sin conexión, cerrar sesión con copia | Hecho en la app. **Probado con un Supabase simulado**; falta el recorrido real (ver «Pruebas reales»). |
| 2 | Copia manual con hora; copia diaria automática en carpeta (Chrome/Edge); aviso de copia atrasada configurable | Hecho. La lógica está probada con una carpeta simulada; el selector real de carpetas lo prueba la usuaria. |
| 3 | Sincronización: fusión de tratamientos entre dispositivos, no repintar mientras se escribe, aviso de «sin conexión» | Hecho y probado. |
| 4 | Librerías y tipografías dentro del proyecto, sin peticiones externas; service worker las guarda | Hecho y probado. |
| 5 | Sanidad: frecuencia configurable por tratamiento (desparasitaciones sin aviso hasta configurarlas), calendario de 90 días, dosis y lote | Hecho y probado. |
| 6 | «Por completar» y «Concursos» | Hecho y probado. |
| 7 (parte) | Pruebas automáticas (`npm test`, incluida una de privacidad) | Hecho. |
| — | Pantalla «Instalar en el móvil» con código QR | Hecho. |

## Pendiente

**1. ~~Commits y limpieza del historial de GitHub~~ HECHO (11 nov 2026).** Se borró el repositorio antiguo y se creó uno nuevo con un único commit limpio, sin datos privados, que se transfirió a la organización de GitHub **Colombaire**. La app está publicada en **https://colombaire.github.io/** (GitHub Pages); la dirección anterior ya no existe. La copia del historial antiguo está solo en local (`Documentos\colombaire-respaldo-repo`). El repositorio se recreó una segunda vez para eliminar un commit antiguo con un correo personal: ahora tiene un único commit con el correo privado de GitHub. **Falta:** poner la dirección nueva en Supabase (*Authentication → URL Configuration*).

**2. Pruebas reales con Supabase (las hace la usuaria).** *11 nov 2026: hechos con éxito el proyecto nuevo (tablas, registro cerrado, SMTP con Gmail de la app, plantilla), el correo con el código, la entrada y la elección de contraseña en `localhost`. Quedan los puntos 3 a 7.*
1. Crear el proyecto y configurarlo (README, «Puesta en marcha»), con SMTP propio.
2. Darse de alta a sí misma y recibir el código; entrar, elegir contraseña y comprobar que no se puede saltar.
3. Cerrar sesión y entrar con correo y contraseña; «olvidé mi contraseña»: código y cambio.
4. Probar con un correo **no** dado de alta: no debe entrar ni revelar nada.
5. Dos usuarios: cada uno ve solo lo suyo. Móvil y ordenador sincronizan.
6. Con la cuenta piloto: «Recuperar una copia» con `privado/cuenta-piloto-palomar.json` (62 palomos, 112 resultados) y «Cargar hojas desde un archivo» con `privado/cuenta-piloto-libreta.json` (30 hojas). **La cuenta piloto se crea mañana.**
7. Probar la copia diaria automática eligiendo una carpeta real.

**3. Datos de configuración que faltan.**
- Servicio de envío de correo (Resend, Brevo u otro).
- Cada cuánto se desparasita (interna y externa) y otros tratamientos habituales.
- Dirección donde se publica la app (para el código QR y los correos).

**4. ~~Fase 7 (resto): dividir `app.js`~~ HECHO (11 nov 2026).** `app.js` son ahora 13 archivos en `js/` (base, datos, genética, interfaz, palomos, libreta, editar, sanidad, instalar, familias, copias, acceso, arranque), cargados en ese orden desde `index.html` y guardados por `sw.js` (caché v53). Es un corte sin cambios de código; las 14 pruebas pasan (el cargador de pruebas lee el orden de `index.html`). **Falta:** comprobarlo en el navegador real (no se pudo abrir el panel de vista previa).

**5. Fase 8: cría (nidadas). CONSTRUIDA en el código (11 nov 2026), aprobada por la usuaria; falta probarla en el navegador y en Supabase.** Para que sincronice hay que **volver a ejecutar `supabase/schema.sql`** (crea la tabla `nidadas`); hasta entonces las nidadas se guardan en el dispositivo y la app sigue funcionando (salta esa tabla al sincronizar). Código en `js/nidadas.js`; pruebas en `tests/cria.test.js`. Pendiente de decidir con la usuaria: qué más apuntar de cada pareja (nido, jaula), si hay que ajustar los plazos (18 días de incubación, anillado a los 7) y, si hace falta, una pantalla para cambiarlos (hoy se guardan en el dispositivo y no tienen ajuste visible). Diseño original:

*Idea:* una sola cosa nueva, la **nidada**, en lugar de tres pantallas separadas. Una nidada es «esta pareja, esta puesta» y reúne los huevos y los pichones. Así se apunta lo habitual con pocos toques y todo cuelga del macho y la hembra que ya existen en la ficha.

*Datos de cada nidada* (tabla nueva `nidadas`, igual que `palomos` y `resultados`: por usuario, con seguridad por filas y los mismos límites):
- Macho y hembra (palomos ya apuntados), temporada (año) y notas.
- Fecha del primer huevo y del segundo (de ahí se calcula la **eclosión esperada**: unos 17-18 días desde el segundo huevo; el plazo se podrá cambiar).
- Huevos: cuántos, y de cada uno si fue fértil, claro (sin embrión) o se rompió/abandonó.
- Pichones: de cada uno, fecha de nacimiento, anilla (cuando se anilla), estado (vivo, muerto, vendido…) y el **palomo de la ficha** al que corresponde.

*Cómo se usa:*
1. En la pestaña Cría, botón **«Nueva nidada»**: se elige macho y hembra (con la comprobación de consanguinidad que ya existe) y la fecha del primer huevo.
2. En la nidada se van apuntando huevos y, al nacer, pichones.
3. Al anillar un pichón, botón **«Crear su ficha»**: crea el palomo con padre y madre ya puestos. Entra solo en el árbol, la genética y las probabilidades que ya existen. No se vuelve a escribir nada.
4. Cada pareja muestra su historial (nidadas por año, pichones logrados, cuántos compiten y sus mejores puestos): sirve para decidir con qué parejas seguir.
5. **Avisos** (como los de sanidad): eclosión esperada próxima y pichones por anillar (se suele anillar en la primera semana; plazo configurable).

*Lo que NO entra todavía* (para mantenerlo sencillo): peso, comportamiento, alimentación, calendario de suelta, separación de pichones.

*Trabajo técnico:* tabla `nidadas` en Supabase (y en `schema.sql`) + base local versión 2 + sincronización y copias de seguridad con la tabla nueva (las copias antiguas siguen valiendo) + limpieza de ids en `limpiarRegistro` + pantallas nuevas en `js/` (`cria.js`) + pruebas + avisos en Sanidad/Por completar. Si se borra un palomo, sus nidadas se conservan con el nombre guardado.

*Preguntas abiertas:* ¿una nidada con dos pichones es lo normal, o también apuntan huevos sueltos? ¿Qué más querrían apuntar de cada pareja (por ejemplo, el nido o jaula)? ¿Quieren los avisos de eclosión y anillado?

## Pensar en muchos usuarios (anotado 11 nov 2026)

La app no es solo para la cuenta piloto: **cuantos más usuarios, mejor**. Todo lo que se diseñe debe valer para decenas o cientos de cuentas. Ya está bien encaminado: cada fila lleva su dueño y Supabase aplica seguridad por filas (cada usuario ve solo lo suyo). Lo que hay que revisar:

1. **Registro abierto y autónomo.** Cada usuario se crea su cuenta: en Supabase hay que activar el alta de usuarios nuevos y en la app hay que cambiar las pantallas («Active su cuenta» pasa a «Crear cuenta»; fuera los textos y el control de «solo invitados»). Como ya no hay filtro de invitación, hace falta defenderse del abuso: límite de envíos por correo y por IP, CAPTCHA (Cloudflare Turnstile o similar, que Supabase soporta) y aceptar las condiciones al registrarse. El correo no revelará si una cuenta ya existe.
2. **Correo.** El Gmail de la app tiene tope diario de envíos y los códigos de 6 cifras dependen de él. Pasar a Resend/Brevo antes de abrir a muchos (ya está en «Datos de configuración que faltan»).
3. **Límites del plan gratuito de Supabase** (espacio, usuarios activos, pausa por inactividad, sin copias automáticas). Revisar cuándo se quedan cortos y qué cuesta el siguiente plan.
4. **Ajustes por usuario en la nube.** La frecuencia de tratamientos hoy vive en el dispositivo: pasarla a la cuenta para que cada usuario la tenga en todos sus aparatos.
5. **Borrar cuenta y datos** (derecho al olvido): con muchos usuarios deja de ser opcional. Requiere función de servidor.
6. **Rendimiento y aislamiento.** Probar con muchas cuentas y muchos palomos (índices por dueño en las tablas) y repetir la prueba de «dos usuarios ven solo lo suyo» con tres o más.
7. **Condiciones y privacidad.** Con usuarios ajenos a la familia, texto de privacidad y condiciones de uso, y un contacto de soporte.
8. **Cría y red social** (fases futuras) deben diseñarse ya pensando en varios usuarios: qué es privado y qué se comparte, siempre por decisión del usuario.

## Seguridad (revisión del 11 nov 2026)

**Corregido:** (1) fallo de XSS con copias manipuladas: la foto y los ids se validan al guardar, cargar y sincronizar (`limpiarRegistro` en `js/datos.js`) y la foto se escapa al pintarla; (2) política de contenido (CSP) en `index.html` que solo permite código propio; (3) jsPDF actualizado de 2.5.1 a 4.2.1 y jspdf-autotable de 3.8.2 a 5.0.9 (descargados del registro oficial de npm; probados generando un PDF con tabla en Node, falta verlo en el navegador); (4) la marca `recuperar_datos_locales` ahora se lee de `app_metadata` (el usuario no puede ponérsela; el README tiene el SQL nuevo). Pruebas nuevas en `tests/seguridad.test.js`.

**Pendiente:**
- Comprobar en el navegador real que la CSP no bloquea nada (cuenta, sincronización, PDF, copias, QR). No se pudo abrir el panel de vista previa.
- **Hecho en el código (11 nov 2026), falta ejecutarlo en Supabase:** límite de 1 MB por registro y de 5.000 palomos / 20.000 resultados por cuenta, y borrado de cuenta («Cuenta → Borrar mi cuenta y mis datos», pide escribir BORRAR y descarga una copia antes). **Hay que volver a ejecutar `supabase/schema.sql` en el SQL Editor** (no se probó contra un Postgres real) y probar el borrado con una cuenta de prueba.
- Con el registro abierto: límites de envío de códigos en *Authentication → Rate Limits* y mínimo de contraseña también en Supabase.
- En Supabase: confirmar que `rowsecurity` es true en las dos tablas y revisar el *Security Advisor*.

## Limitaciones conocidas

- La frecuencia de los tratamientos se guarda **en el dispositivo** (no se sincroniza entre dispositivos).
- La marca de «contraseña elegida» solo guía al usuario; la seguridad real es que el código llega a su correo.
- Borrar una cuenta y sus datos (derecho al olvido) necesita una función de servidor; queda para más adelante.
- La primera entrada en un dispositivo necesita internet.
- El plan gratuito de Supabase se pausa tras una semana sin uso y no incluye copias automáticas.
- Si dos dispositivos cambian el mismo palomo a la vez, los tratamientos se fusionan, pero en el resto de campos gana el último cambio.

## Futuro (anotado, sin empezar)

- **Red social de palomos**: ver el README.
- Verificación de resultados con marca «verificado».
- Programa en el ordenador para copias sin abrir la app.
