# Plan de trabajo de Colombaire

Nacido de la auditoría de noviembre de 2026. Estado a fecha 11 de noviembre de 2026.
Regla general: nada se sube a GitHub, se publica en Supabase ni se commitea sin que se pida.

## Decisiones tomadas

1. **Arquitectura**: la app va en internet (alojamiento estático con `https` + Supabase), con una cuenta por usuario; cada uno ve solo lo suyo. El ordenador sirve para copias locales (manuales o diarias automáticas).
2. **Cuenta obligatoria**, correo confirmado con un **código de 6 cifras de un solo uso**, que se cambia por la contraseña propia del usuario. **Registro solo por invitación.**
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

**1. ~~Commits y limpieza del historial de GitHub~~ HECHO (11 nov 2026).** Se borró el repositorio antiguo y se creó uno nuevo con un único commit limpio, sin datos privados, que se transfirió a la organización de GitHub **Colombaire**. La app está publicada en **https://colombaire.github.io/** (GitHub Pages); la dirección anterior ya no existe. La copia del historial antiguo está solo en local (`Documentos\colombaire-respaldo-repo`). **Faltan:** (a) poner la dirección nueva en Supabase (*Authentication → URL Configuration*); (b) cambiar el autor del único commit por el correo privado de GitHub (requiere `push --force`).

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

**4. Fase 7 (resto): dividir `app.js` en archivos por áreas** (datos y sincronización, genética, sanidad, libreta, PDF, pantallas). Se deja para después: ahora hay pruebas que detectan roturas, pero es un cambio grande y conviene hacerlo en una sesión aparte.

**5. Fase 8: cría (parejas, puestas, pichones).** Requiere un diseño previo (modelo de datos y tabla nueva en Supabase) y saber qué datos quiere apuntar exactamente la usuaria.

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
