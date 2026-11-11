# Colombaire

Aplicación web (PWA) para llevar el registro de palomos deportivos: fichas, pedigrí, resultados de concursos, sanidad (vacunas y desparasitaciones) y cría. Cada persona entra con su cuenta y solo ve sus propios datos.

## Qué hace

- **Mis palomos**: lista con buscador por nombre o anilla y filtros «Compiten» / «Crían». Accesos a **Concursos** y a **Por completar**.
- **Ficha**: foto, anilla, sexo, plumaje, año, uso, dónde está, criador, notas, padres, hijos, resultados y sanidad.
- **Árbol**: padres, abuelos y bisabuelos; se puede tocar un hueco para completarlo.
- **Resultados**: prueba, lugar, puesto, puntos y fecha (o solo el año). La pantalla **Concursos** los agrupa por año, prueba y lugar.
- **Por completar**: lista lo que falta (año, padres, anilla, plumaje, puesto de un resultado) sin inventar nada.
- **Cría**: consanguinidad de una pareja (coeficiente de Wright), valor genético estimado, parejas recomendadas y árbol de la pareja (ver más abajo).
- **Sanidad**: ver su sección.
- **Cuenta**: cerrar sesión, cambiar la contraseña, copias de seguridad, PDF e instalar en el móvil.
- **Añadir desde la libreta**: pasar a limpio hojas escritas a mano con Google Lens.

La app es **offline-first**: los datos viven en el dispositivo (IndexedDB) y se sincronizan con la cuenta del usuario cuando hay conexión.

## Cuentas y acceso

La cuenta es **obligatoria** y el registro es **solo por invitación**.

1. La persona administradora da de alta el correo de cada usuario en Supabase (ver «Puesta en marcha»).
2. **Primera vez:** en un dispositivo donde nadie ha entrado nunca, la app abre directamente **«Active su cuenta»** (solo pide el correo, sin contraseña). El usuario escribe su correo y recibe un **código de 6 cifras** (caduca en 10 minutos). Escribirlo confirma que el correo es suyo.
3. **Antes de usar nada**, la app le obliga a elegir una contraseña propia (mínimo 8 caracteres, con letras y un número, nada obvio). Esto ocurre siempre que se entra con un código.
4. Las veces siguientes entra con correo y contraseña. La sesión queda guardada y la app funciona sin conexión.
5. **Cambiar la contraseña** y **cerrar sesión** desde la pestaña **«Cuenta»**. **Olvido:** pantalla propia, **«He olvidado mi contraseña»**, que envía otro código y lleva a elegir una contraseña nueva. Es el mismo mecanismo que la primera vez, con textos distintos.
6. Un correo que no esté dado de alta recibe el mismo mensaje que uno autorizado, para no revelar quién tiene cuenta.

Medidas de privacidad:
- Cada tabla de la base de datos solo permite leer y escribir las filas del propio usuario (`user_id = auth.uid()`), ver `supabase/schema.sql`.
- **Los datos del dispositivo pertenecen a una sola cuenta.** Si entra otra cuenta, la app pregunta antes de mezclar nada y siempre descarga una copia antes de borrar.
- **Datos de antes de existir las cuentas** (de versiones antiguas, guardados en el dispositivo): nunca se muestran ni se suben a una cuenta cualquiera. Se descargan en una copia y el dispositivo se vacía, sin preguntar. Solo las cuentas marcadas con `recuperar_datos_locales` los conservan. Para marcar una cuenta, en *SQL Editor* de Supabase:

  ```sql
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"recuperar_datos_locales": true}'::jsonb
  where email = 'correo@ejemplo.com';
  ```
- «Cerrar sesión» guarda todo en la nube y vacía el dispositivo; si no se pudo guardar, descarga antes una copia.
- Una sesión ya abierta funciona **sin conexión** aunque el permiso haya caducado (se renueva al volver internet).
- Ningún dato personal ni de palomos está en el código: los datos de cada usuario viven solo en su cuenta.

## Puesta en marcha (una sola vez)

**En Supabase** (los nombres de los menús pueden cambiar; compruébelos en el panel):

1. Crear un proyecto (región de Europa).
2. *SQL Editor*: pegar y ejecutar `supabase/schema.sql` (tablas `palomos` y `resultados` y sus reglas por usuario).
3. *Authentication → Sign In / Providers → Email*: **desactivar «Allow new users to sign up»** (registro cerrado) y dejar activa la confirmación de correo. Caducidad del código: 600 segundos. Longitud mínima de contraseña: 8.
4. *Authentication → SMTP Settings*: conectar un servicio de envío de correo (por ejemplo Resend o Brevo, con plan gratuito). El correo incluido en Supabase está muy limitado y, hasta donde se sabe, solo envía a miembros del equipo del proyecto.
5. *Authentication → Email Templates → Magic Link*: que el correo muestre el código en español, por ejemplo:

   ```
   <h2>Su código de acceso a Colombaire</h2>
   <p>Escríbalo en la app: <b>{{ .Token }}</b></p>
   <p>Caduca en 10 minutos. Si no lo ha pedido usted, ignore este correo.</p>
   ```
6. *Authentication → Users → Add user*: dar de alta cada correo permitido, con confirmación automática y una contraseña aleatoria que nadie usará (el usuario entra por código y elige la suya).
7. *Authentication → URL Configuration*: Site URL y Redirect URL con la dirección donde esté publicada la app.
8. *Project Settings → API*: copiar la «Project URL» y la clave pública «publishable» en `config.js`. **Nunca** la clave `service_role` ni la secreta.

Sin `config.js` configurado, la app muestra «La app no está configurada».

**Dirección de la app:** GitHub Pages u otro alojamiento estático con `https`. Para instalarla en el móvil: «Cuenta → Instalar en el móvil (código QR)».

## Copias de seguridad

- **Copia en un archivo** (`colombaire-copia-AAAA-MM-DD-HHMM.json`): guardar y recuperar desde «Cuenta». Incluye palomos, resultados y tratamientos. El plan gratuito de Supabase **no** hace copias automáticas, así que conviene hacer estas.
- **Copia diaria automática** (solo Chrome o Edge en ordenador): en «Cuenta», elegir una carpeta una vez. Cada día que se abra la app se guarda allí la copia del día (`colombaire-copia-AAAA-MM-DD.json`) y se conservan las últimas 7, 14, 30, 60 o 90 (a elegir). Si el navegador pide confirmar el permiso, aparece el botón «Guardar la copia de hoy». Nunca borra archivos que no tengan el nombre de las copias de la app, ni guarda una copia vacía. Se desactiva al cerrar sesión.
- **Aviso de copia atrasada** configurable (7, 15, 30 o 60 días).
- **Copia en PDF** (palomos, padres, índice, resultados y tratamientos) para leer o imprimir; no sirve para recuperar datos.
- El plan gratuito de Supabase **pausa el proyecto tras una semana sin uso**: mientras esté pausado no se puede entrar en dispositivos nuevos (los que ya tienen sesión siguen funcionando). Se reactiva desde el panel.

## Sanidad (vacunas y desparasitaciones)

- **Ficha → Sanidad**: tratamientos del palomo por año, con el estado de cada vacuna o tratamiento con frecuencia (al día hasta…, venció el…). «Apuntar vacuna o tratamiento»: tipo (paramixovirus, salmonela, viruela, desparasitación interna o externa, otro), fecha, producto, dosis, lote y notas.
- **Pestaña Sanidad**: por año, cuántos palomos del palomar tienen cada tratamiento y cuáles faltan. «Apuntar a los N que faltan» pone el mismo tratamiento a todos (o a los marcados) de una vez.
- **Avisos**: tratamientos vencidos o que vencen en menos de un mes (en «Mis palomos» y en «Sanidad»), y **calendario** de los próximos 90 días. Solo avisa de los palomos del palomar que ya lo tienen apuntado una vez.
- **Frecuencia**: las vacunas vienen con «cada año». Las desparasitaciones no avisan hasta que se configure cada cuánto se repiten («Sanidad → Cada cuánto se repite»; se guarda en el dispositivo).
- Los tratamientos van dentro de la ficha de cada palomo (copias y sincronización incluidas). Si dos dispositivos añaden tratamientos distintos al mismo palomo, **se conservan los de los dos**.

## Añadir desde la libreta (Google Lens)

«Mis palomos → Añadir desde la libreta» (`#/foto`) pasa a limpio hojas escritas a mano **sin IA de pago**:

1. Abrir la foto de la hoja en el móvil, tocar **Lens** → **Texto** → **Seleccionar todo** → **Copiar**.
2. Volver a la app, pegar el texto y pulsar **«Pasar a limpio»**. Se pueden pegar varias hojas seguidas y **«Añadir más hojas»**.
3. La app entiende las fichas de la Federació (libro registro de palomos, hoja de hembras y libro de parejas de cría) y corrige errores típicos de lectura (O↔0, l↔1, «ROZO» por «ROJO»…). Reconoce los nombres de los palomos que ya están en la cuenta aunque estén mal leídos.
4. **Pantalla de revisión editable.** Al guardar: si el palomo ya existe (misma anilla o nombre) solo se rellenan los huecos y se añaden los resultados nuevos; si no, se crea en «En mi palomar»; el padre y la madre se enlazan con palomos existentes o de la misma tanda, o se crean como «pedigrí».
5. También se pueden cargar **hojas ya pasadas a limpio desde un archivo** (`.json` con `"app": "colombaire-hojas"` o `"mi-palomar-hojas"`).

## Fecha y hora

La app usa siempre la **fecha y la hora de España** (`Europe/Madrid`, con horario de verano e invierno), vaya donde vaya el dispositivo.

## Sin internet y sin servicios externos

Las librerías (`lib/`: Supabase, jsPDF, QR) y las tipografías (`fuentes/`: Inter y Source Serif 4, licencia SIL OFL) están **dentro del proyecto**; la app no pide nada a otros sitios para cargarse, y el service worker las guarda para abrirla sin conexión. Versiones: supabase-js 2.118.0, jsPDF 2.5.1, jsPDF-AutoTable 3.8.2, qrcode-generator 1.4.4.

## Pruebas

```bash
npm test
```

Ejecuta, sin instalar nada (solo Node 20 o más), las pruebas de `tests/`: fecha de España, vencimientos y avisos de sanidad, fusión de tratamientos, contraseñas, mensajes de acceso, nombres de copias, parentesco, lector de Google Lens y «Por completar». También hay una prueba de privacidad que falla si aparece en el código algún dato de palomos privados.

## Probar en el ordenador

```bash
python -m http.server 8131
```

Abrir http://localhost:8131

## Valor genético y probabilidad de los pichones

La app estima el valor genético de cada palomo (en `app.js`, sección «Genética»):

1. **Puntos por resultado** = peso del campeonato × factor del puesto. Pesos: comarcal 1, comarcal de jóvenes 0,8, Copa Federación 1,3, intercomarcal 1,5, regional de jóvenes 1,6, regional 2, Copa Comunitats 2,5, Comunidad Valenciana 3, CCAA 3,5, Copa del Rey 4. Factor del puesto: 1 / (1 + (puesto − 1) / 10). Sin puesto: 0,4.
2. **Rendimiento** = mejor resultado + ½ del 2º + ¼ del 3º, expresado en desviaciones típicas respecto a la media del palomar.
3. **Valor genético estimado**: media de los rendimientos del palomo y de sus parientes, pesada por el parentesco aditivo (2 × coeficiente de parentesco) y por el número efectivo de resultados (repetibilidad 0,4), y encogida hacia la media con λ = (1 − h²) / h², con heredabilidad h² = 0,25. Fiabilidad = peso / (peso + λ): baja < 0,35 ≤ media < 0,65 ≤ alta.
4. **Índice 0-100** = Φ(valor / √h²). Estrellas: ≥ 80 cinco, ≥ 65 cuatro, ≥ 45 tres, ≥ 30 dos.
5. **Pareja**: valor esperado del pichón = media de los padres − 2 × consanguinidad. Probabilidad de quedar en el 25 % mejor = 1 − Φ((0,6745 − valor) / √(1 − h²/2 × fiabilidad)).
6. **Probabilidad en concursos** (ficha, «Si compitiera hoy»): en un concurso de 100 palomos cada rival tiene una fuerza Normal(nivel, 1) y un factor del día Normal(0, 1). Nivel de los rivales: comarcal −0,3, intercomarcal 0,2, regional 0,5, Copa Comunitats 0,9, Comunidad Valenciana 1,2, CCAA 1,5, Copa del Rey 1,9. Cada resultado con puesto se convierte en la actuación de ese día (nivel + √2 · Φ⁻¹(1 − (puesto − 0,5)/100)); la fuerza del palomo es la media de sus actuaciones junto con una previa (−0,3 + 2 × valor genético), y su incertidumbre 1/(1 + n). La probabilidad de quedar entre los k primeros se calcula por integración numérica. Un palomo cualquiera: 10 % entre los 10 primeros y 1 % de ganar.
7. **Parejas recomendadas** (Cría): todas las combinaciones de machos y hembras del palomar (y del pedigrí, avisando), ordenadas por la probabilidad de los pichones; se descartan las de consanguinidad ≥ 12,5 %.
8. **Árbol de la pareja** (`#/arbolpareja/macho/hembra`): el pichón esperado arriba y, debajo, padre, madre y abuelos con sus estrellas, índice y probabilidad en un comarcal.
9. **Árbol y familias** (pestaña «Árbol», `#/familias/id`): árbol de cuatro generaciones, líneas familiares y compatibilidad (verde ≥ 55 %, ámbar 40–54 %, rojo si son demasiado parientes).

Son estimaciones prudentes: la heredabilidad no está medida para el palomo deportivo. Ganan precisión a medida que se apuntan padres, pichones y resultados.

## Plan de trabajo e ideas

El plan, lo hecho y lo pendiente están en [PLAN.md](PLAN.md).

### Red social de palomos (anotado, sin empezar)

A partir de usuarios registrados, que los criadores puedan compartir competiciones, logros y palomos que quieran mostrar.

- **Base**: lo privado sigue con la regla «solo el dueño»; lo público iría en tablas aparte (`publicaciones`): lectura para cualquier usuario registrado, escritura solo del dueño. Al publicar se guarda una copia de lo que el usuario elige mostrar; por defecto todo es privado.
- **Fases propuestas**: 1) perfil (usuario, club, localidad) y aviso de privacidad; 2) «Compartir» y muro de solo lectura; 3) seguir, reaccionar y comentar; 4) moderación y borrado de cuenta.
- **A decidir antes de empezar**: quién la usa (club pequeño o toda España) y cómo se modera.
- **Ojo**: RGPD (aviso, consentimiento, borrar datos), moderación de fotos y comentarios, costes de Supabase si crece, y que los resultados no están verificados.
