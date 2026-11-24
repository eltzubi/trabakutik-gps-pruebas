# Decisiones tomadas, para no volver a proponerlas

Cosas que ya se plantearon, se midieron o se probaron, y que el autor
**decidió**. Están aquí para que nadie —ni una sesión futura— las vuelva a
sacar como si fueran una idea nueva.

## Los avisos no dicen nombres de sitios (12 de noviembre de 2026)

El aviso de subida dice **«Empieza una subida de 5,5 kilómetros y 344 metros
de desnivel»**. Se ofreció decir además hasta dónde —«subida hasta
Zengotitagane»— cogiendo los topónimos como hace `make_places.py` en la web.
El autor dijo que no: **«los nombres prefiero no meterlos, por si hay
equivocación»**.

Y tiene razón medida. En la web está contado: de los 96 lugares que nombran
los títulos de las rutas, la mediana está a 16 m del track, pero `argineta`
nombra **Trabakua a 763 m**, `iturreta` y `exigente` nombran **Barinaga a
495 m**, y 16 de 96 pasan de 150 m. Para un título eso vale —nombra por
dónde pasa la ruta—; para una **voz en marcha**, no: oír «subida hasta
Zengotitagane» cuando el alto es otro es peor que no oír nada, porque te hace
tomar una decisión con un dato falso.

Lo mismo vale para cualquier otro aviso hablado: **los metros y la distancia
son datos del propio track y no se pueden equivocar; un nombre, sí**.

## Dónde se afina el aviso de subida

Una subida se detecta cuando en 200 m se sube el 10 %, se sigue hasta la cima
—acaba al perder 25 m desde el punto más alto— y se canta una sola vez si
sube 60 m o mide 600. Esos dos últimos números son el dial, en
`NavigationMetrics.java`. Mover el listón apenas cambia la cuenta: con 40/400
son 265 avisos en las 72 rutas y con 100/1200, 193. Lo que quitó el ruido fue
**juntar la subida entera**, de 794 avisos a 238.

## La batería: primero medir, luego bajarla (12 de noviembre de 2026)

El autor preguntó cuánto gasta la aplicación. No se contesta a ojo, así que
la aplicación **se mide a sí misma**: mientras graba, el servicio apunta una
línea cada cinco minutos en `bateria.tsv` —minutos, nivel de batería, metros
y posiciones recibidas— y al parar deja el resumen de la salida:
**«6 h 12 min · 42,3 km · 34 % de batería · 5,5 % por hora · 58
posiciones/min»**. Sale en el mismo aviso de «Salida finalizada».

Tres reglas del resumen, para que no mienta:

- **Con menos de 15 minutos no hay «% por hora».** A diez minutos, un solo
  punto de batería daría 6 %/h o 0 %/h según cuándo lo marque el teléfono.
- **Si iba cargando, o el nivel subió, se dice y no se da número.** Un gasto
  falso es peor que ninguno.
- **Si el teléfono no da el nivel, se dice**; no se inventa un 0 %.

**La primera medida, en coche** (12 de noviembre de 2026): 24 min, 17,7 km,
4 % de batería, **10,0 % por hora**, 60 posiciones/min, pantalla apagada y voz
en marcha. Ojo con el margen: a 24 minutos, un punto de batería son 2,5 %/h,
así que el gasto real está entre 7,5 y 12,5. Y el coche es el peor caso, que a
44 km/h de media se cruzan 44 km de mapa cada hora.

**Y ahí se encontró lo primero, que no era el GPS.** Con una salida en marcha
`MainActivity.onStop()` **no dormía la página**: volvía sin tocar nada si el
servicio estaba activo. Con la pantalla apagada, el mapa seguía moviéndose y
**bajando teselas para nadie**. Ahora la pregunta que se le hace a la página
distingue tres estados —0 no se toca, 1 parada, 2 la salida la lleva el
servicio— y en el 2 **también se duerme**: el GPS, los avisos de voz y el GPX
son del servicio, y la página sólo pinta. No se pierde ni un punto, porque al
volver relee el trazado entero del servicio.

Lo que **todavía no se ha tocado** es el GPS. La idea pendiente es pedir
posiciones más despacio cuando el siguiente cruce está lejos, pero eso se
decide **con dos salidas reales delante** —una andando o en bici, y otra con
el mapa ya guardado, para separar lo que gasta la radio de lo que gasta el
GPS—: tocar la frecuencia a ciegas es arriesgar la grabación para ahorrar algo
que no se ha medido.

## El navegador se monta por piezas (12 de noviembre de 2026)

`nuevo.html` ya no se toca a mano: lo monta `node scripts/construye.cjs` con
las diez piezas de **`src/js/`**, en el orden que dicen sus nombres. La
comprobación de integración falla si los dos no cuadran byte a byte.

**Por qué, con números.** Eran 3.698 líneas de JavaScript en un solo ámbito,
154 funciones y 73 variables compartidas; y las pruebas cogían el código
**recortándolo por marcadores de texto** —76 rodajas en los `.cjs` y 14 en
los `.py`—. Mover una línea rompía una prueba que no tenía nada que ver.

**El orden importa y por eso van numeradas.** Las 73 variables se declaran en
un sitio y se usan en otro: juntar las piezas en otro orden cambiaría cuándo
existe cada cosa. Ya pasó una vez, con `hayMapaGuardado` declarada después de
usarse.

**El primer corte no cambió ni un byte**, y está comprobado: el sha256 de
`nuevo.html` antes y después del reparto es el mismo,
`1a3a852a30f6e592d63dc358928000d90b1b0851d4453281a590f4d2b4494b10`. Lo que
venga detrás —darle a cada pieza su propio estado y que sus pruebas pidan el
fichero en vez de recortar texto— se hace pieza a pieza, no de golpe.

**Lo que NO se hace: empezar de cero.** El autor lo ofreció. Se revisó todo
el JavaScript con un corrector y no hay un solo defecto vivo; lo que falta
son barandillas para editarlo. Y en esos comentarios están las decisiones
medidas de meses —por qué Valhalla y no OSRM, por qué el IGN y no OSM para
guardar mapa, la regla de los cruces—, que una reescritura tira y hay que
volver a aprender a base de fallos en el monte.

## El sentido de la marcha lo decide el servicio (13 de noviembre de 2026)

El autor hizo al revés una ruta del día anterior y la aplicación le cantó
**todos los giros al lado contrario**: «cuando era derecha me decía
izquierda». Los avisos caían en el sitio justo; el lado, no. Y al salirse de
la ruta le avisó, pero **al volver no le dijo nada**.

**La causa del lado, medida, y es nuestra.** El sentido (+1 como está
grabada, −1 al revés) lo decidía la página y se lo mandaba al servicio con
`setSentido`. En la 4.9.17 dormimos la página con la pantalla apagada para
que no se comiera la batería (10,0 %/h medidos en coche), y una página
dormida no decide nada: el servicio se quedaba con el +1 de salida y
anunciaba los giros tal como estaban grabados. Peor que un lado al revés:
con el sentido equivocado los giros que vienen quedan *detrás* en el cálculo,
así que lo que se oye es el cruce que ya tienes a treinta metros anunciado
como «ahora» y por el lado de enfrente.

**La regla que queda.** Nada que se oiga con la pantalla apagada puede
depender de que la página esté despierta. El servicio ya tiene el avance
sobre la ruta —el mismo número con el que elige los giros—, así que la cuenta
es suya: los mismos 30 m netos de avance que usa la página (no se comparan
rumbos; en una lazada el tramo más cercano puede ser el de vuelta, y en 3 km
eso daba ocho cambios falsos). Lo que manda la página se sigue aceptando como
una opinión: cuando estás mirando el móvil decide con la primera posición,
sin esperar los 30 m, y las dos cuentas son la misma.

**La franja muerta del «de nuevo en la ruta».** El aviso de salir pedía pasar
de `precisión+7` metros y el de volver pedía bajar de `precisión+4`, y entre
los dos no pasaba nada: si vuelves y te quedas ahí —lo normal cuando el track
se grabó por el otro lado del camino o del carril— te quedabas «fuera de
ruta» para siempre, sin que te lo dijeran y, lo gordo, **sin avisos de giro**,
porque fuera de ruta se callan. Ahora la franja también devuelve, con los
mismos 4 s que saca: cuatro segundos fuera para avisar, cuatro dentro para
volver. Pegado a la ruta sigue siendo inmediato.

**Lo prueba el código de producción**, no una copia: `test-native-turns.py`
compila `decideSentido`, `checkDeviation` y `checkTurns` del servicio y hace
la ruta al revés sin mandar ningún sentido. Con la contraprueba al lado: sin
decidir el sentido, los dos giros salen al lado de enfrente.

## El track se corta por el hueco, no por la velocidad (13 de noviembre de 2026)

El resumen de una salida en coche decía «ATENCIÓN: el track tiene 2 cortes
por pérdida de señal» y el autor mandó el GPX. Medido sobre él (22 min,
20,41 km, tres tramos):

| hueco | tiempo | salto | velocidad en recta |
|---|---|---|---|
| 1 | 8 s | 177 m | 80 km/h |
| 2 | 78 s | 1.911 m | 88 km/h |

El segundo es el túnel y es un corte de verdad: faltan 1,9 km de recorrido,
y por eso la salida sale como 20,4 km cuando de punta a punta fueron 22,3.
**El primero es falso**: 177 m en 8 s a 80 km/h es el coche yendo normal.
Cortaba porque la regla eran 100 m fijos, y 100 m a 80 km/h se hacen en
cuatro segundos y medio.

**La regla pasa a ser por tiempo, como todo lo demás aquí**: se corta si el
hueco pasa de 20 s, o si el salto no cabe en el tiempo que ha pasado
(40 m/s, 144 km/h, más que cualquier carretera de aquí), con suelo de 100 m
para que un teletransporte del GPS parado o andando siga cortando. Pasado el
GPX entero por la regla nueva: **1 corte**, el túnel.

Por qué importa que no grite por nada: el aviso dice «este track no es el
recorrido entero». Si salta por ir deprisa, deja de creérselo nadie.

**Lo que NO se hace: unir los extremos del túnel con una recta.** El GPX
abre `<trkseg>` nuevo y la distancia no cuenta el hueco. Un kilómetro y
medio de línea recta por dentro de la montaña sería inventarse el recorrido.

## Los avisos de «ya está bien» también suenan (13 de noviembre de 2026)

El autor, saliendo de un túnel: «la pérdida avisó, la recuperada no creo,
igual que no dijo cuando recuperó ruta después de unos kilómetros». Vio el
patrón antes que nosotros: **fallaban los avisos de vuelta, no los de
alarma**.

**La frase sí se decía.** `sin_senal_gps.py` ya comprobaba desde hace
semanas que «Señal GPS recuperada» se dice al volver la señal, y se sigue
comprobando. Lo que pasaba es otra cosa, y se ve contando los sonidos:

| suceso | sonido | voz |
|---|---|---|
| sin señal GPS | 2 pitidos lentos | sí |
| fuera del recorrido | 4 pitidos rápidos | sí |
| señal recuperada | **nada** | sí |
| de nuevo en la ruta | **nada** | sí |

Las alarmas te hacen levantar la oreja; las vueltas eran lo único mudo de la
aplicación. En el coche, a 80 km/h y con ruido, una frase corta de tres
palabras sin nada que la anuncie se pierde. No es que no se dijera: es que
no había forma de oírla.

**Suena distinto a propósito, y no con otro ritmo.** Las tandas de 1, 2, 3 y
4 pitidos ya están cogidas —los giros y el fuera de ruta—, y una quinta no se
distingue conduciendo. Las vueltas usan `TONE_PROP_ACK`, el «ti-ti» de
confirmación, que no suena a alarma, que es justo lo que hay que decir.

Las dos pruebas llevan su contraprueba: quitando el sonido, fallan.

## Más de 400 avisos de giro (13 de noviembre de 2026) — ARREGLADO en la APK siguiente a la 4.9.22

El puente `setJunctions` (`MainActivity.java`) **tira la lista entera** si
trae más de 400 avisos o pasa de 40.000 caracteres: no escribe nada y no
avisa al servicio. El comentario de `08-cruces.js` dice que el servicio «se
planta en 400», como si recortara, y no es así.

Lo que pasa entonces: al cargar la ruta la página ya había dejado la lista
del servicio vacía, así que el servicio arranca con **cero giros** y con la
pantalla apagada no se oye ninguno. Mirando el móvil sí, porque avisa la
página.

Cuándo: nunca con las rutas de la web (la que más tiene, hirutxikiak, 88).
Solo con una ruta creada o un GPX importado enorme: a un aviso cada 615 m
dentro de Mallabia, unos 250 km.

Arreglo propuesto: mandar los **400 primeros** en vez de ninguno. Necesita
APK nueva, y por lo raro que es **el autor decidió no hacer una APK solo
para esto**: va con la próxima vez que haya que tocar `android/`.

## El APK se firma siempre con la misma llave (13 de noviembre de 2026)

El autor: «cuando hay una actualización no dejan nunca nunca nunca instalar
por encima; hay que borrar siempre la anterior». Medido: la 4.9.19, la 4.9.20
y la 4.9.21 llevaban **tres certificados distintos**. El flujo compilaba con
la llave de depuración que se inventa cada máquina nueva de GitHub, y Android
no deja instalar encima una app firmada con otra llave. Desinstalar, además,
borra las grabaciones que la app guarda dentro.

Se eligió la llave **protegida por contraseña** (opción A) y no dejarla a la
vista en el repositorio público (B), que habría permitido a cualquiera firmar
un APK que se instalara encima del suyo:

- La contraseña es el secreto **`FIRMA_CLAVE`** de GitHub. Solo la sabe el autor.
- La llave, `android/firma/trabakutik.p12`, la crea el flujo la primera vez y
  la guarda en el repositorio; sin la contraseña no sirve de nada.
- **No borrar ese fichero ni cambiar el secreto**: cualquiera de las dos cosas
  es una llave nueva, y con ella otra desinstalación obligada.
- `scripts/firma-apk.py` tumba la publicación si el APK no sale con esa llave,
  para que una llave al azar no vuelva a colarse sin que nadie lo vea.

El cambio de llave obliga a desinstalar **una última vez**: la primera versión
con la llave fija no entra encima de la 4.9.21. De ahí en adelante, sí.

**Cómo quedó (13 de noviembre de 2026).** Al repasar el navegador con un
segundo modelo salió que era peor de lo apuntado: la lista no se quedaba
vacía, se quedaba **la de la ruta anterior**. `loadSaved` y `selectRoute`
mandan los puntos nuevos con los giros que aún tenía la página (los de la
ruta de antes) y luego los nuevos; si estos se rechazaban, el servicio, y el
fichero que leería el siguiente «Empezar», avisaban cruces de otra ruta.

En vez de mandar «los 400 primeros», que deja sin avisos el final (o el
principio, yendo al revés):
- el tope sube a **2000 giros y 200.000 bytes** en el puente y en el servicio
  (`TrackingService.GIROS_MAX`); la ruta con más de la web tiene 88;
- si aun así se pasa, el puente escribe una **lista vacía**, nunca «nada»;
- y el servicio ignora un giro en el punto 0, que en `checkTurns` dejaba
  mudos todos los de detrás (la página no genera ninguno ahí).

Lo prueba `tests/giros_limite.py`.

## El aviso de caída (15 de noviembre de 2026)

Lo pidió el autor con la idea de Garmin delante: un golpe fuerte, una cuenta
atrás y, si nadie la para, un SOS al contacto que meta cada usuario. Lo que
se decidió y por qué:

- **30 segundos**, como Garmin. Con 10, aturdido o con guantes, es fácil no
  llegar a cancelar, y un SOS falso asusta a quien lo recibe.
- **Activado de serie**, pero sin contactos no arranca: no habría a quién
  avisar. Solo funciona mientras se graba o se navega, porque lo hace el
  servicio (con la pantalla apagada la página se duerme).
- **Por SMS y no por correo.** Un correo sin que nadie toque nada necesita un
  servidor de correo con su clave, y en una app instalada esa clave quedaría a
  la vista. El SMS lo manda el propio teléfono y sale con menos cobertura que
  los datos. WhatsApp no deja enviar sin que alguien pulse.
- **Tres condiciones seguidas** (DetectorCaidas): ir en marcha, un golpe de 3 g
  y quedarse quieto 8 s dentro de los 30 s siguientes. Los números son de
  partida, sin ninguna caída real medida: el registro de golpes de la hoja SOS
  está para ajustarlos con salidas de verdad.
- **En los Android nuevos**, enviar SMS desde una app que no viene de Google
  Play puede venir bloqueado: hay que permitirlo a mano («Permitir ajustes
  restringidos»). La hoja SOS lo dice si falta el permiso.
- Es una ayuda: no avisa al 112 y no detecta todas las caídas. Garmin dice lo
  mismo de la suya.
- **Revisado con GPT el mismo día**, y cambiado: el SMS se da por enviado solo
  cuando el teléfono confirma cada trozo (EnvioSms), y se dice a quién ha
  salido y a quién no; apagar el aviso durante la cuenta atrás la cancela; el
  detector solo se arma con permiso de SMS y notificaciones (sin ellas no
  salen los botones para cancelar); un segundo cuenta como quieto solo con al
  menos 10 muestras, y un hueco de más de 1 s vuelve a empezar la cuenta.
- **Lo que queda abierto, a sabiendas:** la cuenta atrás vive en el servicio;
  si Android matara el proceso en esos 30 s, el SOS no saldría. Es un
  servicio en primer plano con el GPS y un wakelock, así que es improbable,
  pero no imposible. Y parar la grabación durante la cuenta atrás la cancela,
  porque parar es un gesto consciente.


## Los picos del GPX no son giros (15 de noviembre de 2026)

- **Lo que pasó:** en el km 1,17 de Trabakua-Mendibil, quien grabó la ruta se
  metió 15 m por una pista lateral, estuvo parado unos 20 s y volvió. Con un
  cruce de OSM a 6 m, la app cantaba «izquierda» y, al revés, «derecha», yendo
  recto. El autor: «solo tiene que indicar giros de verdad o cruces de verdad,
  todo lo demás se deja sin indicar».
- **Lo que se hace:** `quitaPicos` (08-cruces.js) salta, solo para calcular
  los avisos, las salidas cortas con una sola punta estrecha de la que se
  vuelve y tras la que se sigue con el mismo rumbo (a 25 y a 50 m). Los
  números están en el código.
- **Medido en las 74 rutas, ida y vuelta:** 5.922 avisos iguales, 43 quitados
  y 7 movidos o con otro tipo. Revisados a mano los quitados en cruce o con
  giro grande: eran picos hacia un ramal (Mendibil, Trabakua-Ondarroa,
  Garaiurdaixa, Intxorta), picos sin cruce o herraduras falsas en sobrepasos.
- **Lo que se paró a tiempo:** las primeras versiones se comían giros de
  verdad donde el GPS bailó parado en el cruce (Hiru Txikiak). Lo arreglan el
  ángulo de la punta (menos de 60°; allí da 89) y la comprobación a 50 m. Las
  dos cosas tienen su prueba con los datos reales.
- **El riesgo que queda, a sabiendas:** es geometría, no sabe la intención.
  Un paso obligatorio con forma de pico de 20 m o menos, como dos senderos en
  T a pocos metros con un obstáculo entre ellos, perdería su aviso. No ha
  salido en ninguna de las 74 rutas. Revisado con GPT, que lo señaló.

## El panel de abajo y «desde donde empiezas» (15 de noviembre de 2026)

- **Lo eligió el autor, entre ocho maquetas:** un panel oscuro de lado a
  lado, como el de su captura y sin el botón de foto. Lleva el nombre de la
  ruta, tres columnas (distancia, desnivel y GPS), el perfil ancho con tu
  punto y los botones Pausa / Seguir, Parar y Mandos. Pidió «solo distancias
  y alturas»: el tiempo de salida y el ritmo se quitaron.
- **Va en el flujo, debajo del mapa, no flotando encima.** Flotando, el
  botón de mandos tapaba las tarjetas. Mientras se guía ocupa el sitio de la
  barra «Perfil de altura», que lleva dentro. Con el mapa más bajo, la
  tarjeta del giro se estrecha si no cabe y deja libre la columna de botones
  (en 320x568, 320x640 y 1280x800 tapaba el + y el −).
- **Todo cuenta desde donde empiezas tú, no desde el principio de la
  ruta.** Salió 1,5 km antes de Trabakua-Mendibil, y otro día arrancó en la
  cima. Lo que muestra cada dato:
  - **hechos:** lo andado grabado, sin sumar los cortes de grabación. Sin
    grabar sale «—»: restar posiciones sobre la ruta no es lo andado;
  - **barra:** lo andado frente a lo andado más lo que queda;
  - **subido y bajado:** se recorre tu trazado grabado sobre el perfil de la
    ruta, con continuidad entre puntos, para no saltar de rama en una ida y
    vuelta. Vale con la pantalla apagada, porque el trazado lo da el
    servicio;
  - **falta por subir:** se cuenta desde tu punto exacto y en tu sentido.
    Restar acumulados desde el principio daba mal al revés: en 0 → 4 → 10 m
    salían 6 en vez de 10;
  - **antes de llegar a la ruta:** el panel sale igual, con la distancia en
    línea recta hasta ella.
- **Las alturas son las del perfil de la ruta, no las del GPS.** La altura
  del GPS de Android va sobre el elipsoide (unos 50 m de más aquí), se
  equivoca 10-20 m y el trazado del servicio ni la trae. Sin barómetro, lo
  andado lejos de la ruta no suma subida y la cifra lleva «~» delante: es una
  estimación parcial. Al principio era «≥», y GPT lo tumbó en la segunda
  revisión, porque prometía un mínimo que no está garantizado.
- **Con barómetro, mandan sus cifras** (APK nueva, `AlturaBarometrica.java`).
  Mide diferencias de presión con precisión de decímetros, también fuera de
  la ruta, y no depende de que la página esté despierta. La altitud absoluta
  no la da: 1 hPa de cambio de tiempo son unos 8 m. Se suaviza 10 s, se
  cuenta con un umbral de 3 m y en pausa no cuenta. Una lectura por segundo,
  en lotes de 10 s. Probado con trazas sintéticas en `tests/barometro.py`.
- **Segunda revisión con GPT, sobre el código final,** y arreglado:
  - al despertar con un trazado largo se podían dar cientos de millones de
    vueltas; ahora 20.000 puntos tardan 46 ms en Chromium y 300 ms con la
    CPU frenada 4x;
  - un punto en un vértice de una recta caía 10 m por detrás;
  - una altitud vieja se daba como actual con una posición mala;
  - sin grabar, la barra volvía a contar desde el principio de la ruta;
  - un tramo sin alturas se rellenaba con la altura del vecino.
- **Las rutas guardadas e importadas usan todos sus puntos para el perfil,**
  no la copia simplificada del mapa, que se comía las cimas en mitad de una
  recta.
- Revisado con GPT antes de escribir el código. Las pruebas de la ida y
  vuelta, el 0 → 4 → 10, empezar en la cima y llegar desde fuera están en
  `tests/navigation.test.cjs`.

## Comparado con otros navegadores (15 de noviembre de 2026)

Buscado en la documentación de OsmAnd y Locus, en la ayuda de AllTrails y
Wikiloc, y en quejas de usuarios de Komoot. Cifras para ir andando:

| | OsmAnd | Locus | AllTrails | HiiKER | Trabakutik |
|---|---|---|---|---|---|
| Aviso «gira en X m» | 22 s antes (24 m) | lo elige el usuario | — | — | voz a 35 m (unos 31 s), pitidos a 50 m, 8-30 m y en el cruce |
| «Gira ya» | 12 m como mínimo | — | — | — | 3 pitidos en el cruce |
| Fuera de ruta | 22 m (20 s) | 30-100 m, a elegir | unos 50 m | 50 m | 15 m (o la precisión + 7 m) durante 4 s |
| Repetir el aviso de fuera de ruta | no | opcional | no; se puede silenciar | — | no |
| Sin señal GPS | a los 20 s | — | — | — | sí |
| Callarse si vas al revés | sí | — | — | — | se calcula la lista al revés |
| Llegada al final | sí | sí | — | — | **no lo tenía: añadido** |
| Dos giros muy seguidos | — | se avisan juntos (opcional) | — | — | uno detrás de otro |
| Pedir que Android no la corte por batería | — | — | sí, «sin restricciones» | — | **no lo tenía: añadido** |

- **Añadido el mismo día:**
  - el aviso de llegada (`AvisoLlegada`: una vez, y solo habiendo andado la
    mitad, por las circulares);
  - pedir al empezar que la batería no esté restringida (`compruebaBateria`,
    como mucho una vez por semana). Samsung es de las marcas que más cortan
    las apps en segundo plano (dontkillmyapp.com).
- **Las quejas de Komoot** se parecen a las que ya se han arreglado aquí:
  - giros donde no hay giro: picos del GPX, ramas de los cruces;
  - avisos demasiado pronto o tarde: los 35 m;
  - fuera de ruta falsos por huecos del GPX.
- **Propuesto y pendiente de que decida el autor:**
  1. un segundo aviso si sigues fuera de ruta (por ejemplo, al minuto y a
     más de 50 m);
  2. decir juntos dos giros muy seguidos («a la derecha y enseguida a la
     izquierda»);
  3. el umbral de fuera de ruta: 15 m es más estricto que los demás
     (22-75 m). Bajo árboles puede avisar sin motivo, aunque se suma la
     precisión del GPS. Se dejó así porque el autor quería que avisara.

## Rotondas: un solo cruce (15 de noviembre de 2026)

El autor cruzó una rotonda siguiendo recto, con una ruta hecha en el creador,
y oyó «gira a la derecha»; a la derecha había una calle de dirección
prohibida. En OSM la entrada y la salida de una rotonda son dos cruces, y
cada uno, visto suelto, es un giro de 50-90 grados. Simulado sobre las 186
rotondas de la zona, con las ramas reales de cada cruce:

| | pasos | con aviso equivocado antes | después |
|---|---|---|---|
| sigues recto | 3.824 | 3.473 (91 %) | 456, todos a 40-60 m fuera de la rotonda (brazos inventados por la simulación) |
| sales a un lado | 15.434 | 9.672 | 3.015 (671 son salidas de 30-35°, que ahora se callan) |

Ahora `cruces-zona.json` trae el centro y el radio de cada rotonda
(`make_cruces.py --rotondas`, en Rutas-Mallabia) y `resuelveRotondas` (pieza
08) quita los avisos de dentro y compara el rumbo con el que **entras** y con
el que **sales** (30 m de brazo): menos de 35° es recto y no se dice nada,
como en cualquier cruce que se pasa de largo; si no, un aviso a la entrada
con el lado de la salida, y de 150° para arriba «da la vuelta». La ruta tiene
que meterse en el anillo (radio + 3 m): pasar por una calle de al lado no
cuenta (markinaurjauziak y santaeufemia pasan a 10 m de una de 28 m).

En las 72 rutas publicadas cambian 11, todas en rotondas que cruzan; en
aixola, galdaramiño y karabieta se cruzaba recto y se decía «derecha».

Desde la misma noche se dice «en la rotonda, sal a la derecha» (lo pidio el
autor): la pagina manda «ro»:1 y la APK lo dice; una APK anterior dice «cruce a la derecha».

## «… ahora» dos segundos antes del cruce (15 de noviembre de 2026)

Sonaba al llegar a 0 m del cruce. Con el retraso del GPS (1-2 s) y lo que
tarda en arrancar la voz, en bici a 20 km/h caía 5-10 m pasado el cruce. Es
la queja de un hilo entero del foro de Suunto sobre rutas de Komoot («the
vibration is inside but mostly after the turns», forum.suunto.com/post/191752;
el moderador lo reconoce en /post/191804). Ahora suena dos segundos de marcha
antes: 4 m andando, 11 m en bici a 20 km/h, 12 como mucho, y siempre por
debajo del aviso corto (los dos pitidos). Lo mismo en el servicio
(`avisoYa`) y en la página (cuarto valor de `distanciasDeAviso`). Lo pidió el
autor tras leer el informe de quejas.

## Bloqueo de pantalla (15 de noviembre de 2026)

Después de los giros falsos, es lo que más se repite en las quejas de Komoot
y Wikiloc: con el móvil en el bolsillo, en el manillar o con lluvia, un toque
sin querer cambia de pantalla o pausa. El candado 🔒 del panel de abajo pone
una capa encima de todo que se traga los toques; se quita **manteniendo
pulsado un segundo** su botón, que un roce o una gota no hacen. El mapa, la
ficha del giro y la voz siguen. El aviso de caída («Estoy bien») es un
diálogo de Android, por encima de la página, y no lo tapa. Al dejar de guiar
se quita solo. Solo página: no hace falta APK.

## Valhalla como referencia de los giros, medido y descartado (15 de noviembre de 2026)

Se encajaron las 73 rutas publicadas en los caminos de OSM con el ajuste de
trazas de Valhalla (servidor de FOSSGIS; sin nada a menos de 1,5 km de
Trabakua, con permiso del autor): 1.359 km, el 95,9 % de los puntos a menos de
15 m. **Sus propias indicaciones no sirven** (3 en 20 km en 7pago, 70 en 33 km
en aixola). Comparando nuestros avisos de cruce con sus cambios de camino: 76 %
coinciden y 24 % no. Comprobado por el autor con capturas, en Asuntza bira por
Aginaga: en los km 7,72 y 13,02 acertamos nosotros y Valhalla se equivoca
(junta pistas distintas). **No compensa encajar las rutas con Valhalla.**

Se metió y se quitó el mismo día una regla («un cruce a más de 15 m con el
track girando menos de 25° no es de la ruta»): estaba ajustada con respuestas
de memoria que eran kilómetros de **Wikiloc** (17,12 km esa ruta) cuadradas con
los **nuestros** (15,60), y callaba el km 3,13, donde se deja la pista
principal de piedra por una de tierra de frente: «sería gran error», dijo el
autor. **Lección: comprobar cada caso con una captura del sitio, nunca por el
número del kilómetro de otra aplicación.**

## «✋ Sobraba»: apuntar los avisos que están de más (16 de noviembre de 2026)

Después de pasar un aviso de giro, mientras no te alejes 250 m, sale un botón
«✋ Sobraba: «Cruce a la izquierda»». Un toque guarda en el móvil la ruta, el
km, lo que se dijo, el sentido y el sitio exacto. La lista se ve y se copia
desde «✋ Avisos marcados (N)» en la botonera de la app, para pegarla en el
chat. Lo pidió el autor «solo hasta que aprendas a identificar lo que
buscamos»: la tarde anterior se perdió intentando cuadrar de memoria
kilómetros de Wikiloc con los nuestros. Con esta lista se corrigen avisos
sobre casos seguros. Cuando deje de aportar, se quita. Solo página: sin APK.
**Solo para el autor** (mismo día): a cualquier otro el botón no le sirve,
porque lo que marque se queda en su móvil y no nos llega. Se activa en cada
móvil tocando 5 veces la versión de abajo de la app (otras 5 lo quitan; al dar
los 5 toques avisa en la barra si ha quedado activado o no, y en ningún otro
momento; mientras está activado, la versión lleva una ✋ al final) o,
en la web, abriendo con `?avisos=1`. Sin activar no sale nunca.

## La franja muerta del fuera de ruta, también en la página (16 de noviembre de 2026)

La página daba por perdida la ruta a más de 25 m (o precisión + 7) y solo
devolvía a menos de 11 m (o precisión + 4): entre medias, de vuelta al camino
pero a 15 m del track, se quedaba «fuera de ruta» para siempre y sin la ficha
de los giros. El servicio ya lo resolvía desde el 15 de noviembre; al subir el
umbral de 15 a 25 m ese día, la franja de la página se ensanchó. Ahora, igual
que el servicio, 4 s seguidos en la franja devuelven a la ruta. Lo encontró
otra sesión de revisión; lo aplicó esta, con dos pruebas (las dos en rojo sin
el arreglo), una de ellas atando los umbrales de la página y del servicio.
**Pruebas reforzadas** (mismo día, tras una revisión con GPT): la franja
vuelve a los 4 s justos (a 3,999 s sigue fuera); dos salidas y dos vueltas;
el reinicio borra la cuenta; y `tests/fuera_ruta_igual.py` da el mismo
recorrido inventado al servicio (Java) y a la página y exige que pasen a
fuera y vuelvan en el mismo segundo. Comprobado que las dos fallan si la
página tarda 5 s en vez de 4.

## «Sigue recto por la derecha» (16 de noviembre de 2026)

El autor oyó «en el cruce, sigue por la derecha» 45 m antes de una carretera
que salía a la derecha (hacia Mallabia) y se podía entender como «gira ahí».
Propuso decirlo con «recto»: «en el cruce, sigue recto por la derecha». Queda
claro que no hay giro, solo coger el ramal de ese lado. Vale para los 143
avisos de este tipo de las rutas sin quitar ninguno (el de la BI-633 de
galdaramiño se queda). Se descartó callarlos cuando hay otro cruce a ese lado
en los 60 m siguientes: 20 avisos menos y ni siquiera pillaba su caso.

## El tiempo en movimiento, en el panel de abajo (16 de noviembre de 2026)

La tercera casilla del panel decía «GPS ±4 m», que ya sale arriba
(«Posición · ±4 m»): el autor vio el dato repetido y pidió poner ahí el tiempo
en movimiento. Lo cuenta el servicio (`TiempoEnMarcha`), porque con la
pantalla apagada la página se duerme: cuenta tiempo cuando te alejas 10 m del
último punto de ancla en menos de 30 s; parado, el baile del GPS no llega a
10 m y no suma; lo pausado tampoco. Error: unos 30 s por parada como mucho.
Una APK anterior no lo manda y la casilla dice «—».

## «Al revés» grande solo 30 s; la precisión de arriba, más grande (16 de noviembre de 2026)

El aviso «La estás haciendo AL REVÉS · los giros van corregidos» tapaba mapa
toda la salida. Ahora sale entero 30 s al detectarse (o al volver a cambiar de
sentido) y luego se queda en una etiqueta «⇆ Al revés» (de 33 a 15 px de
alto). Y como la precisión del GPS ya solo sale arriba, «Posición · ±4 m» pasa
de 10 a 13 px y semi-negrita. Lo pidió el autor con una captura.
**Corregido el mismo día tras una revisión con GPT**: contar por distancia
(10 m desde un ancla) fallaba en dos casos que GPT construyó y las pruebas
confirmaron: bajo arbolado la posición salta más de 10 m estando parado y una
parada entera podía sumar; y subiendo muy despacio podía dar cero. Ahora se
usa la **velocidad del GPS** (Doppler), que no depende del baile de la
posición: suavizada, empieza a contar a 0,45 m/s y para a 0,25, con un tope de
5 s por intervalo. Sin velocidad, el método de la distancia. Y la hora es la de
cada medida (`getElapsedRealtimeNanos`), no la de llegada: si Android entrega
las posiciones en grupo, cuenta igual. Los saltos se miden entre posiciones
seguidas, no contra el ancla. Pendiente: si Android reinicia el servicio a
mitad de salida, el contador vuelve a cero.

## La ficha de arriba, en tres columnas (16 de noviembre de 2026)

En marcha, la ficha tenía el lado derecho vacío. Se compararon cuatro opciones
dibujadas (artifact «Ficha del navegador») con la condición del autor de no
ocupar más que antes, y eligió la B: arriba «Posición · ±6 m» y el «⇆ Al
revés»; debajo tres columnas, rumbo con su brújula, distancia al track y
altitud. Medida: 79-83 px de alto frente a 120 de antes (118 los 30 s en que
el «al revés» sale entero, en su propia línea). El punto rojo de «grabando» ya
no va delante de cada número: lo marca el borde rojo de la ficha. Fuera de la
marcha la ficha no cambia.
Y abajo, bajo el tiempo, «en marcha» en lugar de la altitud, que ya sale
arriba (el dato se sigue calculando, escondido, por las pruebas y por si vuelve).

## El creador, con mandos compactos, rehacer y tiempo andando (16 de noviembre de 2026)

Lo eligió el autor sobre una maqueta inspirada en Outdooractive («Me gusta y
pon rehacer»):

- **Arriba a la izquierda**, una pastilla con deshacer ↶ y **rehacer ↷** (que
  antes no existía) y un ⋮ con Cerrar el círculo, Ida y vuelta y Borrar todo.
  La fila vieja de botones (`#createActions`) sigue en el HTML, escondida: los
  mandos nuevos pulsan los de siempre, así que no hay dos caminos para lo
  mismo.
- **Rehacer** devuelve el tramo quitado tal cual, sin pedirlo otra vez al
  motor. Se vacía en cuanto el trazado cambia por otro lado (punto nuevo,
  arrastre, cerrar, ida y vuelta): la firma son los propios tramos, comparados
  por identidad. **La pila y la firma se actualizan antes de dibujar**: en la
  primera versión el dibujo veía la firma vieja y dos deshacer seguidos
  perdían el primero (lo encontró la revisión de GPT; ahora hay prueba).
- **Puntos con letras** (A, B, C… y AA tras la Z), no con números.
- **Abajo**, en el panel: «≈ 5 h 18 andando · aprox.» por el método MIDE
  (4 km/h en llano, 600 m/h bajando y subiendo a 550 m/h en vez de los 400 de
  MIDE: ver «Un tramo muy empinado…» más abajo; el mayor de los dos
  tiempos más la mitad del menor), **aplicado por bloques de unos 250 m y
  sumado**, no sobre los totales: con los totales, 4 km llanos más 1 km con
  800 m de subida daban 2 h 37 en vez de 3 h 07. Punto a punto tampoco: el
  ruido de 1 m del modelo en llano inflaría el tiempo hasta un 50 %. Con
  alturas a medias dice «desnivel parcial» y no da esfuerzo, que saldría más
  fácil de lo que es y «Esfuerzo andando», con la regla que mejor
  reproduce el que el autor puso a mano en la web (km + desnivel/50; cortes en
  23,5 y 43,2; acierta 34 de 38 rutas a pie). Debajo, Guardar y Abrir ruta.
- **En bici no se da tiempo ni esfuerzo**: no hay tiempos de bici de
  referencia, y la regla del esfuerzo acertaba 21 de 32 en bici.
- El panel crece 78 px para que quepan las dos filas; a cambio desaparece la
  fila de botones que iba encima. Sin ningún tramo, esas filas no salen.

## Un tramo muy empinado no sale «Fácil» (16 de noviembre de 2026)

El autor dibujó 1,26 km con +380 m (un bloque al 42 %) y el creador dijo
«Esfuerzo andando: Fácil»: «es lo peor que hay». La regla km+desnivel/50 mira
la ruta entera, y un muro corto da un número pequeño. Ahora, si algún bloque de
250 m (de al menos 150 m) pasa del 20 % de pendiente media, subiendo o
bajando, en vez de «Fácil» sale «Muy empinado · hasta N %»; si el esfuerzo era
Media o Difícil se queda, con «· hasta N %» detrás.

**Corrección del mismo día: la subida va a 550 m/h, no a 400.** Los 50 min no
eran del autor (él lo hace en 35): son los del **cartel oficial** de abajo,
pensado para un caminante medio. MIDE con 400 m/h daba 1 h 06, un 32 % más.
Para clavar el cartel harían falta 562 m/h; se puso 550 (51 min) para no
ajustar a un solo dato. Llano a 4 km/h y bajada a 600 m/h, como en MIDE. Si
salen más carteles con tiempo, se recalibra con ellos.

**Y la rampa es la del último tramo, y solo de subida (mismo día).** «Muy
empinado · hasta 44 %» se quedaba puesto toda la ruta por una rampa del
principio, aunque después se marcara llano o bajada, y se leía como si toda la
ruta fuera durísima. El autor: «lo de la subida marca bien, pero si es bajada
no debería quedarse rampa dura; o llaneando. Lo que toque». Ahora
`rampaUltimoTramo` mira solo el tramo que se acaba de marcar, cuenta solo la
subida, y dice cuánto mide lo duro: «Rampa dura: 400 m al 44 %» (o «Media ·
rampa de 1,3 km al 25 %»). Si el último tramo es llano o baja, vuelve el
esfuerzo normal de la ruta. Por debajo de 360 px la letra del resumen baja a
10 px para no pasar de dos líneas.

## Tema «Neón fino» y flechas de giro macizas (16 de noviembre de 2026)

El autor pidió un navegador «más futurista, moderno, un poco de luz en los
cajones, más fino» y variedad. Se le enseñaron seis maquetas sobre mapa claro
(cristal, neón fino, HUD, aurora, día e instrumento ámbar) y dejó la elección
en mis manos («tú lo que creas conveniente; las flechas, que se vean bien»).

Se eligió **neón fino con la raya de luz de aurora**: cajones casi negros y
opacos, filos de 1 px y una línea de luz cian arriba de cada cajón. Descartes:
el cristal (el desenfoque gasta batería y el botón activo desaparecía sobre
mapa claro), el HUD (la línea pequeña de arriba no se leía), el día (deslumbra
de noche; si acaso, un modo aparte), el ámbar (choca con el naranja de «bici»).
Los botones activos conservan su relleno de color: es lo que mejor se ve al sol.

Va en un bloque al final de los estilos de `src/nuevo.plantilla.html`: quitarlo
devuelve el aspecto anterior.

La **flecha de giro** (`flechaGiro`, pieza 07) deja el degradado que nacía en
un azul apagado: ahora es un trazo macizo casi blanco con un filo oscuro
debajo, que la despega de cualquier fondo.

**Segunda pasada, el mismo día: «no veo cambios».** La primera estaba en su
móvil (raya cian y cajones negros) pero era tan discreta que no se notaba.
Ahora las cifras de la ficha y el tiempo van en cian con brillo, los rótulos en
cian tenue, los botones con filo de luz, y la raya de arriba es de 3 px.

## La ficha en marcha, con las cifras lo más grandes que quepan (16 de noviembre de 2026)

«Estos datos se podrían ver más grandes; aprovechar mejor el recuadro.» Las
tres cifras (rumbo, al track, altitud) van ahora a 28 px (23 el rumbo) en vez
de 16-18, y la ficha **baja** de 87 a 80 px de alto: menos relleno y menos hueco
entre filas. «Rumbo» va como los otros dos rótulos, centrado y en cian.

Como «46,18 km» al track o «1331 m» de altitud no caben a 28 px en su columna,
`ajustaCifras` (pieza 10) encoge solo esa cifra, de px en px, hasta que cabe, y
vuelve a medir cada vez que cambia el texto. Las columnas van con `minmax(0,…)`
(1,4 / 0,9 / 1): sin eso, un rumbo largo ensanchaba su columna y apretaba las
otras dos. El rumbo pierde el « · » («SE 134°»), que no decía nada y le quitaba
tamaño.

## Rotondas: «toma la segunda salida» (16 de noviembre de 2026)

El autor: «la primera salida, a la derecha, sí la detecta; pero si es la
segunda no marca, no sabe». Cruzar una rotonda recto no se avisaba (menos de
35° de giro), y es justo cuando hace falta saber cuál de las salidas es.

**Las salidas vienen en el fichero de cruces** (`rotondas_salidas`, lo escribe
`make_cruces.py --rotondas` en Rutas-Mallabia): por rotonda, su sentido de giro
y los rumbos, desde el centro, de los nodos por los que se puede SALIR. Contar
ramas a ciegas falla: una carretera de dos calzadas llega con dos ramas, una
solo de entrada, y se contaría dos veces. Por eso hacen falta las etiquetas de
OSM: sentido único hacia el anillo no es salida; senderos, aceras, bidegorris y
entradas de casas tampoco; las pistas sí. 192 rotondas, todas antihorarias.

**La cuenta** (`salidaDeRotonda`, pieza 08): las salidas que hay, en el sentido
de giro, entre la entrada de la ruta y la suya. Sin número si la salida de la
ruta no casa con ninguna del fichero a menos de 35°, si es la misma por la que
se entra, o si pasa de la octava. Comprobado a mano en dos rotondas de
«recyde» contra OSM (una con dos calzadas: de 10 ramas, 5 salidas).

**Lo que se dice**: «En la rotonda, toma la segunda salida», también yendo
recto. Sin número, como antes («sal a la derecha»). La APK lo recibe en «rs»;
una APK anterior a la 4.9.48 diría «da la vuelta» en una rotonda recta, así
que a esas no se les mandan las rectas. Yendo al revés con la lista de ida (la
de vuelta no siempre está), el número no vale y no se dice.

De paso: la notificación decía «Herradura dcha.» en las rotondas (tipo 5 cae
en «tipo>=3»); ahora «Rotonda, 2.ª salida».

## Los colores de la web en el navegador (16 de noviembre de 2026)

«Los colores del navegador, como la web: entre verde, naranja y blanco.» Se
cambia el cian del tema neón por los de la web en oscuro: naranja #FF9C3B,
verde lima #A6FF4D, blanco #F8FAFC y el fondo #020617. Rayas de luz de naranja
a verde, cifras en blanco, rótulos en verde, lo activo en naranja (rumbo arriba,
línea del perfil), «Voz» en verde y el botón principal («Empezar») en verde
lima con letra oscura: es el verde de la web, no el que no le gustó. El punto
azul de la posición y el trazado de la ruta en el mapa no cambian: son del
mapa, no del adorno.

## La brújula, grande, y los grados en pequeño (16 de noviembre de 2026)

«Arriba prefiero una brújula más grande indicando la flecha, y menos grados.»
La rosa de la ficha en marcha pasa de 22 a 40 px (32 por debajo de 390), con la
aguja naranja, más larga y con borde oscuro. El rumbo va en letras grandes
(«SE») y los grados al lado, en pequeño y en gris. La rosa ocupa las dos filas
(rótulo y cifra) para no añadir alto: la ficha mide 83 px a 390 de ancho.

**Corrección del mismo día: se cuentan las BOCAS, como las ve una persona.**
En la rotonda del km 5 de «recyde» la página decía «toma la primera salida» y
el autor: «esa es dirección prohibida, sería la segunda». La calle prohibida ni
toca el anillo: desemboca en la carretera de salida a 13 m del borde. Así que
el fichero lleva ahora todas las bocas que se ven (las prohibidas con +360: se
cuentan, pero por ellas no se sale), también las calles que desembocan cerca en
una vía de doble sentido pegada al anillo; y una carretera de dos calzadas
(misma referencia o nombre, hasta 90° entre la de entrada y la de salida) es
una sola boca. Rumbos de las bocas y de la ruta, a radio+20 m del centro. Más
de 7 bocas: sin número. 192 rotondas, 696 bocas, casi todas de 3 o 4; en las
rutas, de 49 pasos por rotonda solo 1 queda sin número. El navegador vuelve a
bajar el fichero si cambian las rotondas aunque no cambie cuántas hay.

## Una carretera que sigue y un ramal menor: sin «sigue recto por…» (16 de noviembre de 2026)

En el km 6,37 de «recyde» el navegador dijo «Cruce · sigue recto por la
izquierda». El autor: «no hay ningún cruce; lo que se ve a la izquierda es la
entrada a un caserío, no debería ni contar». La carretera (la BI-3321, partida
en dos tramos en OSM justo ahí) sigue, y a la izquierda sale la entrada al
caserío, que en OSM continúa como una pista de 639 m. El cruce quedaba a 22 m
del punto donde se miraba la ruta, en plena curva, y por el rumbo la entrada
(156°) se parecía más a la ruta (165°) que la carretera (180°).

Lo que NO se hizo, medido: comprobar en el propio cruce todos los «sigue recto»
quitaba 46 de 146, entre ellos horquillas de dos carreteras (km 1,4 y 4,0 de la
misma ruta) donde el aviso sirve, como el de galdaramiño. Quitar ramales sin
salida o entradas cortas del fichero se llevaba 47 giros de 60° o más.

Lo que se hizo: el fichero marca los cruces donde sigue una carretera y sale un
ramal menor (`cruces_carretera`, 3.739 de 26.736, con las clases de
caminos-zona.json), y solo en esos un «sigue recto» se comprueba en el punto de
la ruta más cercano al cruce: si ahí la ruta sigue por el mismo camino, se
calla. En las 72 rutas quita exactamente tres avisos, los tres de ese tipo
(recyde 6,37; intxorta 19,77; santaeufemia 15,67), y nada más.

## El nombre de la ruta del panel de abajo abre su ficha (17 de noviembre de 2026)

«Al pulsar en los títulos de las rutas, si están en la web, deberían mandar a la
página de su ruta.» Fuera de la marcha ya lo hacía el título de la ficha de
arriba; en marcha ese título se esconde y el único nombre a la vista es el del
panel de abajo, que no hacía nada. Ahora hace lo mismo (pulsa el de arriba) y
lleva «↗» y subrayado naranja cuando la ruta tiene ficha; una ruta propia o un
GPX importado no tienen y no hacen nada. Con el candado puesto no se puede
pulsar por accidente.

## La flecha del cruce en el mapa, en el sentido de la marcha (17 de noviembre de 2026)

El autor, con una captura del km 6,37 de recyde: «¿por qué la flecha de arriba
está mirando al revés?». La flecha pequeña del mapa se dibujaba siempre «hacia
arriba», en el marcador, y el marcador gira con el mapa: con el mapa orientado
a la marcha y yendo hacia el sur (172°) quedaba dada la vuelta. Ahora el
marcador se gira con el rumbo con el que se llega al cruce (desde un punto unos
15 m antes, en el sentido de la marcha, también yendo al revés): con el mapa
girado apunta hacia arriba, y con el norte arriba apunta hacia donde se va.
La flecha grande de la ficha de abajo no cambia: esa va en la pantalla, no en
el mapa.

**Y una prueba en Chromium que lo mira en la pantalla** (`scripts/test-browser.cjs`):
ruta recta hacia el sur, mapa girado con la marcha, y se mide con
`getScreenCTM` hacia dónde va el trazo de la flecha pequeña: hacia arriba con
el mapa girado, hacia abajo con el norte arriba. Comprobado que sin el arreglo
falla (la flecha bajaba 20 px). La flecha se pinta en `signoDelGiro`, aparte,
para poder probarla.

## La flecha pequeña del mapa, una miniatura de la grande (17 de noviembre de 2026)

«Esas flechas pequeñas aún así no se distinguen bien las formas, son feas; las
grandes, bien.» La pequeña medía 30 px con trazo 10 (un tercio de su tamaño) y
la grande 62 con trazo 11 (un sexto): proporcionalmente casi el doble de gorda,
y se emborronaba. Ahora 38 px con trazo 7,5 en un cuadro de 44, oscuro, con
esquinas redondeadas y borde naranja: la grande en pequeño. Comparadas las dos
a la vista con giros de 22, 60, 95, 147 y 170 grados.

## Abrir un GPX desde Descargas con la app (17 de noviembre de 2026)

El autor pulsó un GPX en la carpeta de descargas y en «Abrir con» salían Sygic,
Garmin, OsmAnd y Wikiloc, pero no Trabakutik: la app solo se registraba para
sus propios enlaces (trabakutikgps://navegar). «Lo que quiero es que desde la
carpeta de descarga pueda abrir con nuestro navegador un archivo GPX
directamente.»

- El manifiesto declara VIEW para application/gpx+xml, application/gpx y
  application/x-gpx (content y file), VIEW para application/octet-stream solo
  si la ruta acaba en .gpx (hay gestores que lo mandan así), y SEND con los
  tres tipos GPX (Compartir). Octet-stream no va en SEND: la app saldría al
  compartir cualquier archivo.
- MainActivity lee el archivo (máximo 4 MB, como el botón), cambia a la
  pantalla del navegador y llama a `window.trabakutikImportaGpx(texto, nombre)`.
  Si la página aún no ha cargado, lo entrega en onPageFinished.
- En la página, el botón de «Mis rutas» y esta entrada pasan por la misma
  función (`importaTextoGpx`, pieza 06), con las mismas comprobaciones; desde
  fuera se abre directamente como ruta activa y queda guardada en Mis rutas.

## La altitud fuera de la ruta, del GPS y sobre el nivel del mar (17 de noviembre de 2026)

El autor, a 157 m de la ruta y con satélites: la ficha no le daba la altitud.
La altitud de la ficha salía solo del perfil de la ruta en el punto donde se
está, y solo estando sobre ella. Ahora, fuera de la ruta, sale la del GPS con
«≈» si es buena (error de 25 m o menos, de hace menos de 15 s).

La del GPS no vale tal cual: `Location.getAltitude()` es sobre el ELIPSOIDE
WGS84, no sobre el mar, y aquí da unos 50 m de más. El servicio la convierte
con `AltitudeConverter` (Android 14 en adelante, modelo del geoide sin
conexión), en su propio hilo porque leer el modelo puede tardar, y la manda a
la página con su error y su hora. En un Android anterior no se da: mejor «—»
que 50 m de error.

**Y el GPX grabado, también sobre el mar** («haz lo que sea correcto»). El
servicio escribía `<ele>` con `getAltitude()`, sobre el elipsoide: las
grabaciones salían unos 50 m altas. Ahora resta la ondulación del geoide
(elipsoide menos mar), sacada de la última conversión: cambia unos metros en
decenas de km, así que no hace falta convertir cada punto. Hasta tenerla, el
primer segundo, los puntos van sin `<ele>` antes que con una equivocada. En un
Android anterior al 14 se graba como siempre: no hay modelo del geoide en el
móvil y no se inventa una cifra. Las grabaciones antiguas siguen 50 m altas.
La ficha no cambia: sobre la ruta manda el perfil (más estable que el GPS,
que baila 10-20 m) y fuera de ella el GPS.

## Revisión con GPT de la noche del 16-17 de noviembre: lo que se arregló

Crítico gpt-6-astra, una ronda (la cuenta se había quedado sin saldo; se
recargó). Comprobado cada punto contra el código y los datos antes de tocar:

- **Rotondas, pareja de calzadas al revés:** si la calzada de salida queda
  delante de la de entrada en el sentido de giro, su boca se contaría como
  primera salida. Medido: 3 de 367 parejas. Esas rotondas, sin número.
- **Casar la salida con todas las bocas**, también las prohibidas: andando se
  sale por una calle prohibida para coches, y casar con la libre de al lado
  daba el número de otra. Si la prohibida y una libre quedan a menos de 15°
  de diferencia, sin número. Cambia tres pasos en las rutas, los tres por
  calles prohibidas para coches.
- **La marca de cruces de carretera** se compara por contenido, no por
  longitud, para volver a bajar el fichero.
- **El punto de la ruta más cercano al cruce** se busca a 40 m por la ruta, no
  a 40 puntos: en un lazo podía coger otra pasada.
- **La flecha del mapa** se rehace también si cambia la lista (ida o vuelta).

Y en la app (APK aparte):

- **El GPX se lee en su propio hilo:** un proveedor en la nube puede tardar o
  colgarse, y leyendo en el hilo principal congelaba la app.
- **Entrega a la página sin carreras:** cada GPX lleva su número y solo se da
  por entregado el suyo, no se manda dos veces mientras una entrega está en
  curso, y un intent ya importado no se reimporta si Android recrea la
  pantalla (se guarda su URI en el estado).
- **La altitud como un solo dato:** altura, error, hora y ondulación en un
  objeto que no cambia y se lee una vez; como mucho una conversión en marcha;
  si el conversor falla o en 30 s no da ninguna, el GPX se graba como antes.

Lo que NO se cambió: la invertida «salida delante» que el crítico puso de
ejemplo no se da con circulación por la derecha salvo en esas 3 parejas; y el
filtro de octet-stream solo reconoce URI que acaben en .gpx, limitación que
queda dicha.

**Segunda ronda de la revisión (mismo día):**
- **La duda de la rotonda, en los dos sentidos:** si otra boca, libre o
  prohibida, queda a menos de 15° más de la salida de la ruta, sin número.
  Pierden el número 6 de 46 pasos en las rutas (las rectas vuelven a callarse);
  recyde no cambia. Probado que una prohibida como destino lleva su propio
  número (el recuento incluye todas las bocas).
- **El GPX abierto desde fuera solo cuenta como hecho cuando la página lo
  recibe** (antes, al empezar a leer: si fallaba, ya no se podía reabrir); se
  evita reimportar el mismo intent al recrear la pantalla, pero abrirlo otra
  vez a mano siempre vale. Cada lectura en su propio hilo: uno colgado no
  bloquea el siguiente.
- **Sin escalón de altitud en el GPX:** con una ondulación ya conocida se sigue
  usando aunque fallen conversiones posteriores (cambia unos metros en decenas
  de km); en bruto solo si nunca la hubo, y entonces todo el GPX igual.
- **Rotonda recta al revés sin lista de vuelta:** la página manda «rr» y la APK
  se calla si no tiene número, en vez de decir «sal a la izquierda» en una recta.

**Tercera ronda (mismo día):**
- **El modo de la altitud del GPX se decide una vez por grabación** (`modoEle`):
  corregido en cuanto hay una ondulación, en bruto si el conversor falla o
  tarda más de 30 s antes de dar la primera. Una conversión que llegue después
  de decidir «en bruto» ya no lo cambia: sin escalones ni en un sentido ni en
  otro. Se reinicia al empezar cada grabación.
- **La confirmación de un GPX solo marca como hecho el intent vigente:** la
  respuesta de A no puede consumir un B que todavía se está leyendo.
- Residual reconocido: una salida de rotonda por un sendero (que no se modela
  como boca) puede casar con una carretera próxima; la duda simétrica no lo
  detecta porque falta la rama.

## Decidir la rama por la forma del camino: probado y NO subido (17 de noviembre de 2026)

Para las marcas de «cruce» donde solo hay una carretera en curva con una calle
al lado (recyde 17,10 y 6,41; Eibar-Eltzubi 10,04 y 15,98), se probó guardar
por cada rama un punto a 25 m por su camino (sacado de caminos-zona.json,
siguiendo el camino más recto a través de los cruces: 89 % de las ramas) y
elegir la rama de llegada y la de salida por cuál tiene ese punto pegado a la
ruta. Casos de control del autor, que tienen que seguir sonando: recyde 4,49,
12,92 y 14,79 (giros reales) y las horquillas 1,4 y 4,0.

- **Decidiéndolo todo por la forma:** callaba 2 de las 4 marcas, pero en los
  avisos que cambiaban de lado acertaba peor que el método de siempre (8 contra
  15, juzgado por hacia dónde gira la propia ruta). Descartado.
- **Usando la forma solo para callar:** callaba las mismas 2 sin tocar los
  controles, pero quitaba 317 avisos y, juzgados contra OSM, entre ellos había
  giros de verdad (trabakuadeba 8,59 de la GI-3950 a una pista; zaldibar 12,46;
  iruzubieta 4,90; urko 14,48, el ramal de la BI-2301). Descartado.

La causa de fondo: la forma de caminos-zona.json está simplificada y
contraída (sin identidad de vía), y a 25 m dos ramas que se separan poco no se
distinguen. Lo que sí funcionó como juez fue mirar en OSM, con la geometría
real, si la vía de antes y la de después del cruce son la misma (mismo id o
mismo nombre/ref). Si se retoma, el camino es ese: guardar por rama la vía de
OSM a la que pertenece y su nombre/ref (no solo un punto), y medirlo contra los
controles y contra el juez antes de subir nada.

## El lado de un cruce, comprobado en el propio cruce (17 de noviembre de 2026)

En la vuelta de Eibar-Eltzubi, entrando a Areitio, el navegador dijo «cruce a
la izquierda» y había que ir a la derecha (la ruta gira 37° en 30 m y 79° en
50 m). Por la mañana, en la ida, ese mismo cruce salió bien. La causa: el lado
se decidía con 12 m de ruta alrededor del punto donde más se dobla, y a la
vuelta ese punto cayó 19 m antes del cruce, donde la carretera todavía torcía
a la izquierda. El autor: «las curvas me dan igual; me preocupan los cruces».

Ahora, si hay que avisar lo sigue decidiendo lo de siempre (así no se pierde
ningún giro: los controles de recyde 4,49, 12,92, 14,79 y las horquillas 1,4 y
4,0 suenan igual), pero el LADO se comprueba mirando la ruta en su punto más
cercano al nodo del cruce, con 20 m a cada lado. Medido en todas las rutas: el
número de avisos no cambia (2.993), cambia el lado en 46, y juzgados con el
giro real de la ruta medido en el cruce (45 m) aciertan 29 ahora frente a 3
antes (5 casi rectos, sin juez). Antes de esto se midió decidir también SI
avisar en el cruce, y se callaba giros reales: descartado.

## El «cruce» del frontón (Eibar-Eltzubi 15,98): no se puede callar sin perder giros

Curva de la BI-3302 con una calle que la cruza; las ramas del cruce no casan
con la ruta y se avisa por lo cerrada que es la curva (56°). Probado, sobre
todas las rutas y con los controles del autor (recyde 4,49, 12,92 y 14,79,
giros reales):

- Si las ramas no casan, decidir en el cruce con 20 m y callar si sigue por el
  mismo camino: callaba el frontón (y recyde 17,10) pero también 4,49 y 14,79.
- Lo mismo solo en cruces de carretera con ramal menor: igual, 15 quitados con
  esos dos controles dentro.
- Callar solo si además ninguna otra rama va más recta: 227 quitados, controles
  dentro.

Juzgados contra OSM, los 15 del segundo intento siguen todos por la misma
carretera, también los controles: en 4,49, 12,92 y 14,79 la carretera tuerce
en el cruce y el autor los vive como giros. Con lo que guarda el fichero de
cruces no se distingue «la carretera hace una curva» de «la carretera tuerce
en un cruce y de frente sigue otra calle». Hace falta saber qué calle de OSM es
cada rama y cuál sigue recto de verdad.

## «Sigue la carretera a la izquierda»: la misma vía que tuerce en un cruce (17 de noviembre de 2026)

Resuelve la nota anterior. Los cruces se rehicieron con **todas las vías de
OSM y su geometría** en los recuadros por los que pasan las rutas
(`scripts/make_cruces_calles.py` en la web). Cada rama trae ahora su **calle**
(ref o nombre; sin nombre, la vía y su continuación en línea del mismo tipo),
un **punto a 25 m por su propia geometría** (`ramas_lejos`) y su **clase**
(`ramas_clase`: carretera, calle o camino).

**Lo que se vio con eso, y por qué no basta con callar.** En los cinco
controles del autor sigues por la MISMA vía, y en los cinco esa vía tuerce en
un cruce. Lo que sale de frente iba justo al revés de lo esperable: en recyde
14,79 (giro de verdad, según el autor) de frente solo hay la entrada de una
casa de 107 m; en el frontón (sobra, según él) una calle de 236 m. Ni la clase,
ni a dónde lleva, ni el ángulo los separan sin ajustar los números a esos cinco.

**Lo que hacen los navegadores de coche** (OSRM, Valhalla, Waze) no es
callar o avisar: distinguen «cambia de vía» de «sigue la tuya, que tuerce» y
dicen «continúa por…». Se hizo lo mismo, sin nombres de sitios (los avisos no
los dicen): **«sigue la carretera / la calle / el camino a la izquierda»**. El
autor lo aprobó («me vale»).

La regla, en `decideCrucePorCalle` (pieza 08), tras tres rondas de revisión
con GPT:

- La rama de llegada y la de salida se reconocen por la forma (su punto a 25 m
  pegado a la ruta, con margen). Si no está claro, se decide como antes.
- Las ventanas de ruta se cortan a **distancia exacta, interpolando**: por
  vértices, en exigente 36,48 la de «60 m» medía 26 m y una herradura de 127°
  salía de 69°.
- **Misma vía**: hay «rama de frente» si alguna otra va casi tan de frente
  como la tuya (10° de tolerancia, `GEO_DE_FRENTE`) contra el rumbo de
  llegada de los últimos 40 m (`FRENTE_M`), y a menos de 90°. Medido a
  distancias exactas, la ventaja de la de enfrente es +8° en recyde 4,49
  (avisar) y −29° en el 17,10 (callar); a 100 m eran +24 y +34, al revés. **Los
  40 m y los 10° se eligieron mirando estos controles**: no es una validación
  independiente.
  - Con rama de frente nunca se calla. Si la ruta tuerce 25° o más a 60 m,
    «sigue la vía» a ese lado; si casi no tuerce, es una horquilla: «sigue
    recto por» el lado de tu rama frente a la de frente.
  - Sin rama de frente: si a 60 m revuelve 75° o más (`CURVA_CALLE`), «curva
    cerrada»; si no, nada.
- Cambio de vía con dos ramas a menos de 40° (una horquilla): «sigue recto
  por», con el lado de la tuya frente a la otra. Si no, como antes.
- No hay filtro de avisos repetidos para «sigue»: el que había juntaba dos
  cruces a menos de 60 m del mismo lado y podía comerse una segunda horquilla
  distinta. Sin él salen 7 avisos de más en 72 rutas.

A la aplicación va como `sg` (1 carretera, 2 calle, 3 camino) y el servicio lo
guarda como tipo 6. Una APK anterior lo ignora y dice «cruce a la izquierda»,
el lado bueno.

**Medido sobre las 72 rutas y las dos del autor:**

- Controles: recyde 4,49, 12,92 y 14,79 → «sigue la carretera» con su lado;
  el frontón a la vuelta → «sigue la carretera» y **a la ida «curva cerrada a
  la izquierda» (92°)**, ya no «cruce»; recyde 17,10 y 6,41 y la universidad
  (Eltzubi 10,04) callan; Areitio (Eltzubi al revés 4,53) sigue «derecha»; la
  horquilla de 1,40 igual.
- Lado (solo izquierda/derecha, sin los «sigue recto por»), juzgado con el giro
  real del trazado a 20 y 40 m: **acierta el nuevo en 197 y el viejo en 17**
  (19 dudosos).
- De 849 avisos viejos con giro real de 90° o más, queda **1** sin ningún aviso
  a menos de 70 m (artetaberanoarandono 5,92).
- Avisos 2993 → 3158: 541 «sigue la vía», 387 curvas, y unos 160 «sigue recto
  por» nuevos, casi todos horquillas de dos pistas en el monte donde antes no
  se decía nada.
- Recyde 4,03 pasa de «sigue recto por la derecha» a **por la izquierda**: el
  ramal (primary_link) sale por la izquierda de la BI-633 a 25, 49 y 90 m. Hay
  que confirmarlo en el sitio.

Lo que no se toca: fuera de los recuadros bajados los cruces son los de antes,
sin forma ni clase, y allí se decide como siempre.

**El tamaño del fichero.** Con la forma de todas las ramas pasaba de 313 a
637 KB, y el navegador lo guarda en el almacenamiento del móvil junto a las
rutas guardadas (ya hubo una vez «No hay espacio para guardar la ruta»). Va
compacto: la forma solo de los cruces que la tienen, marcados con un bit por
cruce (`ramas_con_forma`), y la clase en 2 bits por rama (`ramas_clase2`).
**428 KB**, y los avisos de las 76 rutas salen idénticos con los dos formatos.

**Las entradas sin salida no cuentan (17 nov, tarde).** El autor volvió a oír
aviso en la curva del frontón, bajando, y explicó lo que hay: «a la izquierda
sale una subidita a una entrada del frontón, como cualquier entrada o caserío,
que normalmente no se cuenta». En OSM esa entrada era una calle residencial
de 236 m que se acaba ahí. Ahora cada rama trae si es **sin salida** (clase 3:
por ella no se llega a 300 m de red, `SIN_SALIDA_M` en el generador), y una
rama sin salida no cuenta como «de frente». La casa del km 14,79 de recyde
(107 m) tampoco cuenta; la calle del 4,49 sí (sigue más de 400 m). Y la curva
de tu misma vía solo se avisa como «curva cerrada» de 100° para arriba
(`CURVA_CALLE`).

Controles: el frontón calla en los dos sentidos; recyde 4,49 «sigue la
carretera»; 12,92 y 14,79 pasan a «curva cerrada» (127° y 107°), con su lado;
el resto igual. Lado: nuevo 193, viejo 17. De 849 giros reales de 90° o más,
9 sin aviso a menos de 70 m: todos curvas de la misma vía entre 95° y 110° sin
otra salida de verdad, que es el caso del frontón.

## «Gira», no «cruce»: las frases dicen qué hacer (17 de noviembre de 2026)

Lo propuso el autor: «se quita la palabra cruce y se deja en todo gira a la
derecha, gira a la izquierda o sigue recto; así no hay equivocación». Se
discutió la otra mitad de su idea, seguir solo el track «sin mirar lo que hay
alrededor», y no se hizo: avisaría en todas las curvas (el frontón, recyde
17,10, la universidad) y callaría en las horquillas suaves de dos pistas,
donde el track va casi recto. **Cuándo hablar lo siguen decidiendo los cruces
de OSM; lo que cambia es lo que se dice:**

| antes | ahora |
|---|---|
| «cruce a la izquierda» | «gira a la izquierda» |
| «en el cruce, sigue recto por la izquierda» | «sigue recto por la izquierda» |
| «sigue la carretera a la izquierda» | «gira a la izquierda» |
| «en el cruce, curva de herradura…» / «cruce, da la vuelta» | «curva de herradura…» / «da la vuelta» |
| «curva cerrada…» y las rotondas | igual |

En la aplicación (APK nueva) y en la página. El campo `sg` se sigue enviando y
guardando como tipo 6, por si un día hace falta distinguirlo otra vez.

## El creador rodea las rotondas por la derecha (17 de noviembre de 2026)

El autor: «tengo que crear bien los puntos de entrada y salida de la rotonda,
ya que si no me marca incluso por el lado contrario… vamos siempre por la
derecha», y «en bici también debería respetar las normas». El planificador
del creador calcula **a pie** (Valhalla `pedestrian`), y a pie una rotonda se
rodea por el lado más corto. **Medido en 8 rotondas de la zona con un giro a
la izquierda: en 6 Valhalla la recorría a contramano.**

No se cambió a la bici para todo: en las calles de sentido único da rodeos
del doble (ver `URL_PLANIFICADOR` en la pieza 04). Se corrige solo la
rotonda: `rotondasPorLaDerecha` (pieza 05) mira cada tramo calculado, por
Valhalla o por los caminos guardados, contra las 192 rotondas de
`cruces-zona.json` (centro, radio y sentido de giro, todas al revés que el
reloj). Si el tramo entra en el anillo (radio + 6 m) y lo recorre en el
sentido contrario al de la rotonda, ese trozo se cambia por el arco que va
en su sentido, de la misma entrada a la misma salida. En las 6 medidas queda
al revés que el reloj y con 20-135 m más, que es la vuelta de verdad.

Lo que no toca, a propósito:
- un punto marcado **dentro** de la rotonda (el tramo empieza o acaba ahí);
- un camino que la rodea **por fuera** del anillo: en las otras 2 de las 8
  Valhalla iba por una acera a 25-31 m del centro o por otra calle a más de
  45 m. Corregir eso sería inventarse un arco donde hay otra vía.

Las rotondas se esperan como mucho 2,5 s antes de calcular, y solo si aún no
están cargadas.

## Revisión de ChatGPT (17 nov, noche): el lado sale del cruce, y el aviso cuenta desde él

El autor pasó el trabajo del día a ChatGPT, que encontró dos fallos de verdad
y los reprodujo con un cruce simulado:

1. **El lado del «gira» salía de la ruta hasta 60 m después del cruce.** Si
   tu carretera sale 35° a la izquierda, de frente sigue otra, y a los pocos
   metros la tuya curva a la derecha, decía «derecha». Ahora el lado sale de
   **cómo se separa tu rama de la de frente en el cruce**, las dos medidas
   desde como llegas (de −180 a 180, para que no dé la vuelta pasados 180°:
   con una resta de rumbos a secas, una revuelta de 130° a la derecha salía
   «izquierda»). Cuánto giras: tu rama a 25 m frente a la llegada; menos de
   25° es «sigue recto por», más es «gira».
2. **El aviso se contaba desde el punto donde más se dobla la ruta**, que
   puede quedar 25 m antes del nodo. Ahora, si lo decide un cruce, el aviso va
   en el punto de la ruta más cercano a su nodo (mediana: 20 m más adelante).
   La lista se ordena después por la ruta.

Y un tercero que salió al probar el suyo: **la rama se reconocía contra todo
el trozo de 60 m de ruta**, y una curva de después del cruce podía pasar cerca
de la otra rama y dejarlo en duda; en duda se decidía a la antigua, que daba
el lado contrario. Ahora se compara con el punto de la ruta a 25 m del cruce,
que es donde se mide cada rama.

Medido: los controles igual; lado contra el giro real del trazado, nuevo 222
y viejo 17; de 849 giros reales de 90° o más, los mismos 8 sin aviso cerca.
El caso de ChatGPT queda como prueba (`navigation.test.cjs`): falla con el
código anterior y pasa con este.

Sobre su duda de la APK 4.9.55 con el fichero compacto: el fichero lo lee la
página, no la APK, y la página con el lector compacto se publicó antes que el
fichero. Una página vieja en caché lo detecta (no cuadran los bytes), descarta
la forma y decide a la antigua; no se rompe.

## Las subidas largas y tendidas también se avisan (17 de noviembre de 2026)

El autor subió de Eibar a Elgeta y no oyó ningún aviso de subida, y de
Mallabia a Osma o de Berriz a Trabakua sí. La regla solo empezaba una subida
si en los próximos 200 m se subía el 10 %: esas dos cuestas pasan de sobra y
la de Elgeta, larga pero tendida, no. Ahora también empieza si en el próximo
kilómetro se sube el 5 % (`CLIMB_LONG_LENGTH`, `CLIMB_LONG_GRADE` en
`NavigationMetrics`). Lo demás igual: se sigue hasta la cima, un aviso por
subida, y hace falta subir 60 m o medir 600.

Simulado sobre las 72 rutas: de 241 avisos de subida a 261. Muchas que ya se
avisaban pasan a avisarse donde empiezan de verdad, con su largo y su
desnivel enteros. Prueba nueva en `test-native-turns.py`: 4 km al 6 % se
avisan una vez; un 2 % no.

## Batería de cruces difíciles (17 nov 2026, noche)

Después de que ChatGPT encontrara el fallo del lado, el autor pidió «nivel
dios». Se hizo lo que faltaba: **casos construidos para romper la regla, no
para confirmarla**, en `tests/cruces-dificiles.test.cjs` (17 casos). Cada uno
se pasó también contra el código de antes de la revisión, para comprobar que
la prueba de verdad detecta el fallo.

Lo que salió y se cambió:
- **Dos caminos casi juntos hacia el mismo lado** (el tuyo 30° a la
  izquierda, otra calle 10°) decían «gira a la izquierda», que no dice cuál
  coger. En tu misma vía, si la rama de frente va a menos de 40° de la tuya,
  ahora es «sigue recto por» el lado de la tuya.

Lo que se probó, se midió en las rutas de verdad y **se quitó**:
- **Reconocer la rama con los primeros 40 m de ruta** cuando el punto a 25 m
  no basta (pensado para GPX con puntos muy separados). En las marañas de
  cruces (Zaldibar, exigente 8,19) esos 40 m pasan junto a otras ramas: el
  juez del trazado bajaba de 220 a 214 y salían lados al revés.
- **Usar el primer tramo de la rama** cuando tuerce más de 30° antes de los
  25 m (una rama que sale a la izquierda y revuelve a la derecha a los 15 m).
  Arreglaba esos casos de mentira, pero en las rutas se comía dos giros que sí
  sonaban (argineta 11,5 e intxorta 12,73). Queda como límite conocido, dicho
  en la cabecera de la batería.

La lección, otra vez: un caso de mentira que falla no justifica un cambio si
en las rutas de verdad empeora. Resultado final: controles igual; lado contra
el giro real del trazado, nuevo 220 y viejo 17; giros reales de 90° o más sin
aviso cerca, 8 de 849, los mismos de antes.

## Doble carril, entradas y «recto» (18 de noviembre de 2026)

Tres avisos que el autor marcó en recyde, al revés:

1. **Doble carril.** En la BI-633 la carretera se parte en dos calzadas de
   sentido único que salen a 16° una de otra, y se decía «sigue recto por la
   derecha». El autor: «es una recta, no hace falta indicar, doble carril».
   Ahora el fichero de cruces marca qué ramas son de **sentido prohibido**
   (`ramas_prohibidas`, un bit por rama: `oneway` contra la salida, o una
   rotonda, salvo `oneway:bicycle=no`), y una rama prohibida no es
   alternativa para nada, tampoco en la decisión a la antigua, a la que se
   cae cuando dos ramas salen tan juntas que la forma no las distingue.
   **Recyde 1,40 (ida), que era un control que sonaba, también calla**: es la
   misma partición de la BI-633 en dos calzadas.
2. **Dejar la carretera por una entrada a 40°** se decía «sigue recto por la
   izquierda». El autor: «debería ser gira, entramos en otro tipo de
   carretera». Cambiando de vía, la horquilla ahora solo vale si tu rama casi
   no se aparta (menos de 25°, antes 45); si no, «gira».
3. **«Recto» solo si la tuya es la más recta.** En una horquilla de tu misma
   carretera donde lo recto era otra: «lo de recto sobra, porque justo a mano
   derecha iba una carretera recta que no era la nuestra». Ahora, si la más
   recta es la otra, «sigue por la izquierda», sin «recto», y la ficha pone
   «Lo de frente no es tu camino». Va a la aplicación como `nr`.

Tres casos más en `cruces-dificiles.test.cjs` (20 en total). Lado contra el
trazado: nuevo 224, viejo 18; giros fuertes sin aviso, los mismos 8.

## «✋ Faltó aquí» (18 de noviembre de 2026)

El autor oía pocos avisos en carretera y el ✋ solo apuntaba los que sobran,
así que no había forma de decir dónde faltó uno. Ahora, mientras se sigue
una ruta y con el ✋ activado, hay un botón «✋ Faltó aquí» siempre a mano
(se aparta cuando sale el de «Sobraba» o un giro). Apunta tu posición y el
km, y lo necesario para saber por qué faltó: el aviso calculado más cercano
a menos de 120 m (si lo había, el problema no es la regla sino que algo lo
calló) y si el guiado estaba callando en ese momento: fuera de ruta, parado,
GPS peor de 60 m o a más de 25 m del track. Sale en la misma lista que los
«Sobraba», para pegarla en el chat.

## 19 de noviembre: cada salida y regreso se avisan

El segundo aviso se repite una vez al estar a 50 m del trazado, sin esperar
un minuto: solo se dejan cuatro segundos para terminar el primero. Cada
regreso rearma el ciclo; cargar otra ruta conserva el mismo comportamiento.
Los giros que coincidan con un aviso de entrada o regreso se encolan durante
cuatro segundos para no cortarlo, sin descartar el giro. Se mantienen los
filtros de precisión y la confirmación de salida para evitar falsas alarmas.

## 19 de noviembre: aviso desde el arranque y a 19 m con buena señal

La captura muestra 19 m al track con precisión de ±4 m. El código todavía
exigía superar 25 m y haber estado antes cerca del trazado. Esto dejaba sin
aviso tanto ese desvío como empezar o cambiar de ruta estando ya fuera.

Se sustituye el umbral base de 25 por 15 m; con peor señal se mantiene el
margen `precisión + 7`. Se confirma la salida con cuatro segundos de
lecturas válidas, también antes de la primera entrada al track. Una lectura
inválida o un hueco de más de diez segundos reinicia esa confirmación.
El regreso exige estar a 15 m o menos y precisión de 35 m o mejor: inmediato
en la zona cercana y tras cuatro segundos en la franja restante. Que empeore
la precisión no basta para declarar un regreso. Cada regreso y cambio de
ruta rearma los avisos; se conserva un único recordatorio a 50 m del track.

La primera entrada y cada regreso tienen tono de confirmación. Si el motor
de voz aún se está preparando, se conserva solo el último estado de ruta;
al prepararse se entrega una vez. Parar, cambiar de ruta o silenciar lo
cancelan. Los giros siguen encolándose tras el aviso de estado.

Contraste con documentación oficial: Wikiloc anuncia salida y regreso;
OsmAnd separa activación y prioridad de los avisos; Mapbox distingue la
posición real de la ajustada al trazado. No se copian umbrales de carretera:
se conserva la distancia real al GPX y el margen de precisión propio.

Pruebas añadidas con coordenadas sintéticas: arranque a 19 m, cambio de
ruta estando fuera, entrada estable a 13 m, corte GPS, lectura inválida,
incertidumbre al regresar y preparación tardía de voz. La reproducción
comparada ejecuta las funciones reales Java y JavaScript y comprueba el
instante de cada cambio, además de los avisos y su prioridad. No sustituye
la prueba física de audio y pantalla bloqueada en el teléfono.

## Aviso de caída: 15 s para quedarse quieto, no 2 (21 de noviembre de 2026)

Revisando los cambios del día, el detector pedía quedarse quieto **en los
2 s** siguientes al golpe y no moverse ni un segundo durante los 8 de
quietud; antes había 30 s. Con eso, una caída rápida en carretera (rodar o
deslizarse por el suelo más de 2 s, o moverse un momento antes de quedarse
quieto) no saltaba, y son las más graves. El autor aprobó cambiarlo:

- La quietud tiene que empezar en los **15 s** siguientes al golpe
  (`INICIO_QUIETUD_MS`).
- Dentro de esos 15 s, moverse no descarta: la cuenta de 8 s vuelve a
  empezar. Pasados los 15 s, moverse sí descarta.
- El GPS en marcha descarta solo a partir de **8 s** tras el golpe
  (`SIGUE_MARCHA_TRAS_MS`): un deslizamiento de 3 s también da velocidad.
- Lo demás sigue igual: golpe brusco en marcha, 8 s seguidos quieto, giro del
  móvil de más de 45°, y cancelar la cuenta atrás si se reanuda la marcha con
  GPS bueno.

En `tests/caida_sos.py`, el caso «parar tarde no confirma el impacto» (golpe,
4 s moviéndose y luego tumbado con giro) pasa a esperar el aviso, y hay casos
nuevos: deslizarse 3 s con velocidad GPS, moverse un momento antes de la
quietud, quedarse quieto pasados 15 s (no salta) y moverse pasados 15 s (no
salta). El caso del GPS en marcha se reforzó: pasaba por faltar el giro, no
por el GPS.

## Los cruces de toda Euskadi, en cuadrados (22 de noviembre de 2026)

El autor hizo una ruta en Gorbeia (Otzarreta y Uguna) y apuntó con «✋ Faltó
aquí» una docena de sitios sin aviso. En todos, la lista decía que el guiado
no estaba callando (ni fuera de ruta, ni parado, ni con mal GPS): es que
Gorbeia (43,05 N) queda fuera de `cruces-zona.json` (43,10-43,42 N), y allí
el navegador solo sabía de las curvas del trazado. El aviso «Ruta fuera de la
zona» salía, pero se va solo y no se ve.

Con las vías de OpenStreetMap de alrededor, su ruta pasa de 0 a 18 avisos de
cruce, y caen donde marcó la falta (km 0,73, 1,77 y 2,59). Pidió «toda
Euskadi»:

- Un fichero único serían unos 6 MB, que no caben en `localStorage` y tardan
  en bajar en el monte. Va en **cuadrados de 0,1°** en
  `Rutas-Mallabia/data/cruces/` (123 cuadrados, 275.000 cruces, 5,7 MB; los
  más grandes, Vitoria y Bilbao, 478 y 409 KB), con el mismo formato que
  `cruces-zona.json`. Los escribe `scripts/make_cruces_euskadi.py` desde el
  extracto de Euskadi de OpenStreetMap, con el mismo cálculo que
  `make_cruces_calles.py`.
- La página (pieza 08), si la ruta se sale de la zona de Mallabia, baja el
  índice y los cuadrados que toca la ruta (con 200 m de margen), los guarda en
  la **caché del navegador** y los junta con la zona sin repetir cruces. La
  segunda vez valen sin cobertura. Sin red y sin copia, se queda como antes y
  lo dice.
- Con los cuadrados en vez de la zona, los once controles de recyde y
  Eltzubi salen idénticos.

Pruebas en `tests/cruces-euskadi.test.cjs`.

## Lo que falta para acabar, sobre el perfil (22 de noviembre de 2026)

El autor pidió ver en la gráfica de alturas los kilómetros que faltan para
acabar la ruta. Se le enseñaron dos maneras y eligió la A:

- Encima del punto azul, una pastilla «faltan 710 m».
- Por delante, rayas discontinuas con lo que queda desde ahí hasta la meta:
  cada 500 m, o cada 1, 2, 5, 10… km en rutas largas, **como mucho tres**
  (`pasoMarcas`), para que los rótulos no se pisen a 390 px.
- A la derecha, una raya verde «meta». El perfil ya se dibuja en el sentido
  de la marcha, así que la meta está siempre a la derecha, también al revés.

Las marcas van en HTML encima del SVG y no dentro: el SVG lleva
`preserveAspectRatio="none"` y un texto dentro saldría estirado. Se quitan
cuando no hay posición en la ruta o el perfil está oculto (`sin-alturas`).
Es solo de la página: no hace falta reinstalar la aplicación.

Pruebas en `tests/perfil-faltan.test.cjs`.

## En los nudos del GPX no se avisa de curvas (22 de noviembre de 2026)

El autor se salió de la ruta en Otzarreta haciendo caso a una «curva de
herradura a la izquierda» donde no había nada: «es como estar comiendo un
bocadillo de pie y moverte unos metros; no tiene sentido». Era un **nudo**:
quien grabó la ruta se paró (junto al coche, en una cima, en una cascada, a
hacer una foto) y el track se enredó en unos pocos metros.

- **Qué es un nudo** (`nudosDe`): al menos 30 m de track sin alejarse más de
  20 m de donde empieza, y al menos 3 veces más camino que lo que se aleja.
  Una herradura de verdad no cae: 15 m de ida y 15 de vuelta se alejan 15
  (proporción 2). Se probó antes «30 m dentro de 15 m» y cogía las herraduras
  de verdad: 706 «nudos».
- **Los extremos** (`nudosDeExtremos`): al llegar al coche el track da vueltas
  alrededor de la meta sin el baile apretado de un nudo. Si los últimos 30 m o
  más no salen de 20 m de la llegada (o los primeros, de la salida), cuentan
  como nudo.
- **Se callan las CURVAS**, con 20 m de margen, porque una curva se mide con
  12 m de track a cada lado. **Los cruces de verdad se quedan**: pararse en un
  cruce a mirar por dónde se va también deja un nudo. En Otzarreta hay dos
  cruces dentro de un nudo (km 1,61 y 1,71), junto al «Faltó aquí» del
  autor en el km 1,77.
- El trazado dibujado y las distancias no se tocan.

Medido en las 74 rutas de la web (zona de Mallabia): de 1.915 avisos de curva
se quitan 292 (184 dentro de un nudo, 105 en su margen, 3 en los extremos;
112 eran herraduras), y **los cruces no cambian en ninguna ruta**. En
Otzarreta se van las herraduras falsas de los km 0,01, 1,49, 5,05, 5,21,
5,31 y 7,43; la herradura real del km 1,88 sigue.

El riesgo aceptado: una curva de verdad a menos de 20 m de un nudo se queda
sin aviso. Un lazo completo de 8 m de radio, que antes avisaba como
herradura, ahora es un nudo (se cambió esa prueba en navigation.test.cjs).

Pruebas en `tests/nudos.test.cjs`.

## La referencia de los avisos: qué debía decir y qué dice hoy (22 de noviembre de 2026)

Hasta ahora, cada vez que se tocaba una regla de giros se medía a mano
(«1.732 avisos», «114 de más en 42 rutas») y no había forma de saber si se
había estropeado un cruce que ya iba bien. El autor lo planteó así: lo que
hace falta es saber qué **debía** decir el navegador en los cruces revisados,
incluidos los que tienen que quedar en silencio, porque una lista de cruces de
OpenStreetMap no dice si el aviso era correcto.

`node scripts/avisos-referencia.cjs` corre la pieza 08 de producción sobre las
75 rutas, ida y vuelta, con los mismos datos que baja el móvil (la ruta fina
y los cruces de `Rutas-Mallabia`, que tiene que estar al lado o en
`RUTAS_MALLABIA`), y compara dos cosas:

- **`tests/referencia/cruces-revisados.json`**: cada cruce lleva la ruta, el
  sentido, el km para encontrarlo rápido, la **llegada y la salida** (rumbo a
  25 m), lo que **dijo** entonces y lo que **debía** hacer, con su fuente
  fechada. La llegada y la salida eligen la pasada cuando la ruta pasa dos
  veces por el mismo sitio, y si dejan de cuadrar, la ruta ha cambiado ahí y
  el cruce sale como «NO ENCONTRADO», no como bueno. Se guarda la
  **decisión** (callar, gira, sigue recto, sigue, curva cerrada, herradura,
  da la vuelta, de frente, rotonda, con su lado y su salida), no la frase: la
  redacción ha cambiado varias veces («cruce» se quitó el 17 de noviembre) y
  no debe dar por fallado un cruce cuya decisión no ha cambiado. **«Callar»
  es un resultado.** «Dijo» solo de una marca ✋ o una captura, nunca de
  memoria (ver Valhalla, más arriba).
- **`tests/referencia/avisos.json`**, la foto: todo lo que dice hoy, solo
  con kilómetros. No dice si está bien, dice **qué ha cambiado**: tras tocar
  una regla, lista los avisos que aparecen, se van o cambian, para mirar
  esos uno a uno. Si son buenos, `--escribe-foto`. Lleva la huella de cada
  ruta y de cada fichero de cruces, para que un cambio de datos no se tome
  por un cambio de regla.

**Sin coordenadas cerca de casa**: la foto no lleva ninguna, y un cruce
revisado a menos de 1,5 km de Trabakua se apunta sin punto, solo por el km y
los rumbos (`--ancla` lo hace solo).

Se empezó con cinco cruces, todos con la decisión documentada por el autor:
el pico de Mendibil (km 1,17, ida y vuelta: callar), el bailoteo del km 3,93
de Mendibil (callar) y las dos correcciones de Asuntza del 20 de noviembre
(km 4,79 callar, km 7,12 de frente). **Contraprueba**: con la regla de los
picos desactivada, los dos de Mendibil salen «gira izquierda» y «gira
derecha» —lo que el autor oyó— y la foto marca 37 cambios más.

Se quedaron fuera, a propósito, cruces cuya decisión no está escrita con
precisión: Asuntza km 3,13 (callarlo «sería gran error», pero hoy no hay
ningún aviso a menos de 250 m y no se sabe en qué kilómetros estaba dicho),
Asuntza 7,72 y 13,02 (se sabe que acertamos, no qué decíamos) y las faltas
de Otzarreta (km 0,73, 1,77 y 2,59: en la ruta publicada no hay avisos de
cruce ahí y puede ser otra grabación). Para el autor.

## Los 3 sigma del fuera de ruta: simulado, y de momento no (22-23 nov 2026)

De una habilidad de navegación de robots (`outdoor-gps`, que el autor mandó
buscar) sale una idea buena: **ensanchar el umbral de fuera de ruta con la
incertidumbre de la posición**, y hacerlo con **3 sigma**, no con uno. La
nuestra es `precisión + 7 m`; la precisión que da Android es el radio del
68 %, o sea **un** sigma, así que la suya sería `3 × precisión`.

**Simulado sobre las 75 rutas publicadas del autor** (geometría de verdad,
368 h por caso andando, 225 salidas de ruta medidas por caso):

| sesgo del GPS | precisión | regla de ahora | ×2 | ×3 |
|---|---|---|---|---|
| ninguno | 25 m | **0,00 falsos/h** · detecta a 51 m | 0,00 · 68 m | 0,00 · 97 m |
| ninguno | 40 m | **0,00 falsos/h** · detecta a 73 m | 0,00 · 105 m | 0,00 · 147 m |
| ×1 | 25 m | 7,14 falsos/h · 49 m | 0,32 · 74 m | **0,00** · 95 m |
| ×1 | 40 m | 9,91 falsos/h · 72 m | 0,28 · 98 m | **0,01** · 152 m |

Y lo que cuesta no detectar: con 40 m de precisión, la regla de ×3 **no
avisa nunca en 54 de 225 salidas** (la de ahora, en 7).

**El resultado lo decide el sesgo, y ese número no lo tenemos.** La espera de
4 s ya mata el ruido sin sesgo; con sesgo, se da la vuelta la tortilla. El
autor **no** sufre 7 avisos falsos por hora, así que su sesgo real está cerca
de cero y la regla de ahora está bien puesta. Pero eso es deducción, no
medida.

**Por eso no se toca el umbral y se mide.** Desde esta versión, cada salida
apunta en su resumen la precisión media y máxima, lo más lejos que se ha ido
la posición del track, y **cuántos avisos de desvío habría dado cada una de
las tres reglas** (`mideDesvio`, que no decide nada: solo cuenta). Con una
caminata bajo arbolado en la que el autor sepa que no se salió, la pregunta
se cierra con sus metros.

**Aviso sobre la simulación**: la salida de ruta se simula en perpendicular,
y en el monte uno se sale por un camino que se abre poco a poco. Los metros
de verdad serán mayores en **todas** las reglas; lo que vale es la
comparación entre ellas.

## Las seis marcas de Matiena y Gorbeia, y por qué no se toca la regla (23 nov 2026)

El autor mandó seis marcas ✋ de los días 21 y 22 de noviembre. Con sus dos
trazados de verdad —la ruta que **seguía**, no la que acabó creando— y los
datos de hoy:

**Cuatro resueltas sin tocar nada.** Las tres de «sobraba» (matiena 6,27 y
Otzarreta 7,41, más el aviso de más del km 2,59) ya no suenan, y la del
km 0,73 ahora avisa. Lo que las arregló fueron **los cuadrados de cruces de
Euskadi**, publicados *después* de su salida: aquel día, en toda la ruta de
Gorbeia había **cero cruces de OSM** y el navegador solo veía la forma del
track.

**Las dos que siguen vivas son el mismo problema, y no es de la regla.**

| marca | la ruta gira | nodo de OSM | encaje de sus ramas |
|---|---|---|---|
| 1,77 | **88°** | a 23 m del trazado | la rama de llegada falla **84°** |
| 7,45 | 41° | a 21 m del trazado | la rama de llegada falla **59°** |

El límite de encaje son 45°. Al no encajar, el cruce se decide «como sin
ramas», por la forma del trazado, y ahí 88° se queda por debajo de los 100°
de «curva cerrada»: silencio. Para avisar en esos dos sitios habría que
deshacer una de estas dos cosas, **las dos medidas y decididas**:

1. **Aceptar ramas que no encajan.** Es lo que se quitó el 14 de noviembre
   después de medir las 72 rutas: el lado de las ramas contradecía el giro
   del trazado en **295 avisos**. Volver atrás arregla dos y rompe esos.
2. **Avisar de curvas de 88°.** Es justo lo que el autor pidió que no se
   hiciera: «en realidad solo quería que me indicaran los cruces, no las
   curvas».

**Lo que falta no es regla, es mapa.** En esos dos nodos, OSM no tiene el
camino por el que él pasa: por eso ninguna rama se parece a su llegada. El
arreglo de verdad es darle al navegador los caminos que faltan, que es
exactamente lo que la web ya hace con `make_caminos.py` (108 trozos suyos,
46 km, que OSM no tiene). Eso es un trabajo aparte y se propone, no se hace
de tapadillo.

**Y una lección del comprobador**: una marca no se aprieta en el nodo. En la
del km 2,59 el aviso está justo en el cruce y la marca 26 m antes. Con una
ventana de 25 m salía «sigue viva» una que está bien; con 40 m —medio minuto
andando— el veredicto cuadra con la realidad.

## Los caminos del autor en los cruces: medido, y no sale a cuenta (23 nov 2026)

Idea propuesta y aprobada: si la web ya sabe de **108 tramos suyos (45,8 km)
que OSM no tiene**, que el navegador los use también para los cruces. Medido
antes de construir nada, sobre `caminos-zona.json` y `cruces-zona.json`:

| qué aportarían los 108 tramos | |
|---|---|
| cruces de OSM que ganarían alguna rama suya | **1** (2 ramas) |
| extremos de sus tramos que tocan un camino de OSM | 45 |
| de esos, cruces de verdad (3 caminos o más) que el navegador **no** conoce | **4** |
| de esos 4, pegados a una ruta publicada | **2** (astarlokoatxa a 1 m, markinaurjauziak a 3 m) |
| en Gorbeia, donde están sus dos marcas vivas | **0** |

**Dos conclusiones.**

La primera: **en su zona, los cruces de OSM están prácticamente completos**.
Añadir 45 km de caminos suyos descubre cuatro cruces. No es que la idea sea
mala; es que no queda casi nada por descubrir.

La segunda, la que importa: **en Gorbeia no aporta nada**, porque la caja de
`caminos-zona.json` es la de Mallabia (43,1–43,42) y Barazar y Otzarreta
están en 43,05, por debajo. Allí el navegador tiene los cuadrados de cruces
de Euskadi —que sí llegan— pero ningún camino suyo, y lo que falta en sus dos
marcas vivas es justo eso: la rama por la que él pasa.

**Lo que haría falta para Gorbeia** es otra cosa y es más grande: ampliar la
caja de caminos hacia el suroeste (otra descarga de Overpass) y meter ahí sus
recorridos de esa zona, que hoy no están publicados. Se propone cuando haga
falta; no se hace de tapadillo por cuatro cruces.

## Hasta dónde llega cada cosa, y qué se dice cuando no llega (23 nov 2026)

El autor preguntó qué pasaría yendo más lejos del Duranguesado, o si alguien
se baja la APK y anda por otro sitio. Medido:

| qué | hasta dónde | superficie |
|---|---|---|
| el mapa (ver y guardar) | cualquier sitio: IGN y OSM son mundiales | — |
| fuera de ruta, brújula, perfil, GPX, batería | cualquier sitio: salen del propio track | — |
| **avisos de cruces** | lat 42,4–43,5 · lon −3,5 a −1,7 (123 cuadrados) | ~11.000 km² |
| el lápiz sin cobertura y las fuentes | la caja de Mallabia (43,1–43,42 · −2,72 a −2,34) | ~1.100 km² |

O sea que los cruces cubren **toda Euskadi y sus bordes** —Gorbeia incluido—,
y fuera de ahí el navegador se queda con lo que saca del propio trazado.

**El agujero que había: no se decía.** Un cuadrado que no existe se saltaba
en silencio (`continue`, sin contarlo), así que el último mensaje en pantalla
era «Ruta fuera de la zona de Mallabia · buscando los cruces de Euskadi…», y
ese ya no vuelve nunca. Quien use la APK en Madrid se creería que el
navegador le va a cantar los cruces.

Ahora se cuentan aparte los cuadrados **que no existen** (no hay datos) de
los que **existen y no se bajan** (eso sí es cobertura), y se dice lo que
toca:

- toda la ruta fuera → «Aquí no hay datos de cruces · te avisaré si te sales
  de la ruta, pero no de los cruces»;
- parte fuera → «Parte de esta ruta se sale del mapa de cruces»;
- cuadrados que existen y no bajan → el de siempre, «Sin cobertura».

Ampliar la caja es barato en código y caro en descarga (Overpass, 27 MB por
zona y responde 504 la mitad de las veces), así que se amplía cuando haga
falta de verdad, no por si acaso: `make_cruces.py --fusiona` suma cuadrados
sin rehacer el fichero.

## Cuatro avisos en noventa metros no son cuatro avisos (23 nov 2026)

El autor, en una ruta creada por él: «ese aviso se ha amontonado cuatro,
cinco veces». Reproducido sobre su trazado, en el enlace de Osma bajando a
Miravalles:

```
km 4,75 · gira izquierda 59°
km 4,79 · gira izquierda 113°
km 4,79 · gira izquierda 38°
km 4,84 · gira izquierda 84°
```

Cada uno, por separado, está bien calculado: son cuatro nodos de OSM del
mismo enlace. **El problema es que no caben.** El primer aviso de un cruce
sale hasta 90 m antes y la voz hasta 200: con cuatro en noventa metros, cada
uno empieza a hablar encima del anterior y lo único que se entiende es
«izquierda, izquierda, izquierda».

**La regla: tres o más avisos del mismo lado a menos de 60 m se quedan en
uno**, el del giro más grande, que es el que se nota y el que hay que
acertar.

**Por qué tres y no dos.** Porque dos sí se distinguen, y eso ya estaba
decidido: el caso 13 de `cruces-dificiles` —dos cruces de verdad a 40 m, los
dos a la izquierda— pide dos avisos, y es de la revisión con GPT. Juntando
parejas, esa prueba se rompía y se perdían 571 avisos de las rutas
publicadas. Con tres, se pierden 94 y el caso del autor queda en un aviso.

**Dos cosas que NO se juntan nunca**: las rotondas (su aviso lleva el número
de salida, que no está en ningún otro) y dos herraduras de mano contraria
—por dentro las dos son «vuelta», así que se compara el lado que se oye
(`hacia`), no el de dentro; sin eso, una herradura a la izquierda se comía
otra a la derecha a 50 m.

**Comprobado, no supuesto**: de las 94 bajas en las 75 rutas, todas vienen de
una tanda de tres o más del mismo lado. Los cinco cruces revisados siguen
bien.

## Arriba, la distancia al próximo cruce (23 nov 2026)

El autor: «me gustaría arriba la brújula en un lateral, que me marcara la
distancia hasta el próximo cruce que me iba a indicar».

La ficha en marcha tenía tres cifras grandes: rumbo, al track y altitud. Ahora
son **próximo cruce, al track y altitud**, y el rumbo se va con su brújula al
hueco de arriba a la derecha, que estaba vacío. La brújula sigue siendo la
grande de 40 px del 16 de noviembre y conserva su rótulo y sus grados —
«brújula sí, y rumbo»—; lo único que pierde es tamaño en los grados, de 26 a
20 px, porque su columna es más estrecha que antes.

**El «próximo cruce» no es la distancia del aviso.** El aviso solo existe
dentro de su ventana (90 m a 40 km/h, 200 la voz) y hasta entonces en pantalla
no había nada. Este número es el primer cruce de la lista que tienes delante,
se avise ya o no, para saber si el siguiente está a 80 m o a cuatro
kilómetros. Va por `along` y no en línea recta: en una ruta que se dobla, un
cruce del kilómetro 9 puede estar a 50 m a vuelo de pájaro y a tres kilómetros
de pedales. Y el sentido manda, como en `junctionGuidance`: yendo al revés
`along` decrece.

**Las coordenadas duraron una tarde.** Se probaron en una cuarta línea debajo
y el autor las quitó el mismo día: «no me hacen falta, el SOS me las da». La
ficha vuelve de 115 a 96 px de alto.

## Dos avisos en el mismo metro son uno (23 nov 2026)

Comprobando invariantes sobre las 75 rutas —cosas que nunca pueden pasar—
aparecieron **24 parejas de avisos a menos de 5 m**, y algunas se
contradicen:

```
baldaburuakarregi ida km 16,28:  curva derecha 153°  +  curva izquierda 179°
trabakuamallabia  vuelta km 0,73: gira izquierda 33° +  gira derecha 38°
egoarbitza        ida km 9,73:   sigue izquierda 11° +  gira derecha 42°
karabieta         ida km 17,58:  gira derecha 80°    +  gira derecha 63°
```

No son dos decisiones: es el mismo punto contado dos veces, por dos nodos de
OSM pegados o por un nodo y la forma del track. **Y no caben**: a 4,5 km/h,
cinco metros son cuatro segundos y una frase tarda tres; en bici, un segundo.

**La regla: dos avisos a menos de 5 m se quedan en uno, el del giro más
grande.** Las rotondas no, por su número de salida.

**El orden importa.** Esto corre DESPUÉS de juntar las tandas de tres o más
del mismo lado. Al revés —probado— quitar un aviso dejaba una tanda de tres
en dos, dejaba de ser tanda y volvían a sonar dos donde sonaba uno: salían
seis avisos nuevos.

Resultado en las 75 rutas: **24 avisos menos, cero nuevos**, cinco cambian de
texto (gana el giro grande) y los cinco cruces revisados siguen bien.

**Un caso queda flojo y se deja escrito**: en trabakuamallabia vuelta km 0,73
son 33° a la izquierda y 38° a la derecha, que casi se anulan —el giro neto
son 5°, o sea recto— y la regla se queda con «gira a la derecha». Lo correcto
sería el ángulo neto, pero no hay con qué comprobarlo en el terreno y es un
caso de 8.725: no se toca sin una marca ✋ que lo diga.

**El instrumento se queda**: `node scripts/avisos-referencia.cjs` falla si
vuelve a haber dos avisos a menos de 5 m, y su «reparto» dice cuántos avisos
mueve un cambio en las rutas de andar y cuántos en las de bici, por separado.

## Un cruce que está en el mapa no lo borra nada (23 nov 2026)

Marca ✋ del autor, 22 de noviembre, Otzarreta km 1,77: «faltó aquí». Medido
sobre su propio GPX: en el km 1,755 **hay un cruce de OpenStreetMap** y el
track gira allí 54° a la derecha (146° medidos en la ventana de 12 m). El
navegador no decía nada. El aviso más cercano estaba 44 m antes.

Tres cosas se juntaban para borrarlo, y las tres son la misma idea mal
aplicada: **tratar un cruce de verdad como si fuera una curva del trazado.**

1. `decideCruce` devuelve `sinRamas` cuando la salida real no se parece a
   ninguna rama del nodo —aquí sale a 143° y las ramas son 78, 258 y 216—, y
   entonces se decide por la forma. Pero no se marcaba `cruceAvisado`, así
   que el aviso nacía sin dueño.
2. Sin dueño, la regla de «dos avisos a menos de 35 m» lo borraba. Y esos
   35 m son **en línea recta**: en una S, 44 m de camino son 27 de recta.
3. Y el filtro de nudos —los metros donde el GPS se enreda porque alguien se
   paró— también se lo comía, porque calla las curvas.

**Lo que se ha cambiado**, en lo mínimo:
- un cruce `sinRamas` que llega a avisar se queda con su nodo: se cuenta
  desde él y no se deja borrar por un aviso de al lado que tenga otro nodo;
- el filtro de nudos respeta el aviso que lleva su propio nodo de OSM;
- **salvo en los extremos**, donde el nudo es el aparcamiento y lo que hay
  son maniobras, no indicaciones.

**Lo que NO se ha cambiado**: la clasificación y la frase. Una curva se sigue
diciendo «curva». Se probó marcarlas como cruces y eran 489 avisos que
pasaban de «curva» a «gira»: demasiado, y sin nada que lo respalde.

**Medido**: 95 avisos nuevos en las 75 rutas (8.757 → 8.852, un 1,1 % más).
De ellos, el **92 % tiene su propio nodo de OpenStreetMap** y el **97 % es un
giro de 45° o más**. Cuatro salen en el km 0,04 de cuatro rutas: son cruces
de verdad nada más arrancar, justo lo que el autor echó en falta el 23 de
noviembre —«al salir de casa he tenido que girar a mano derecha y tampoco me
lo ha indicado»—. Los cinco cruces revisados siguen bien y no hay ningún par
de avisos en el mismo sitio.

De sus siete marcas ✋, quedan **seis resueltas y una viva** (la del km 7,45
de Otzarreta, que la hizo a 40 m del track yendo fuera de ruta).

## La pantalla se enciende en el cruce, en bici (23 nov 2026)

Lo pidió el autor, con el móvil en el soporte de la bici: «¿hay alguna forma
de que cuando venga al cruce se active la pantalla del móvil y se vean las
indicaciones? Pero eso sería en caso de bicicleta… no quisiera en una ruta de
senderismo, que vas mucho más despacio, tener que consumir batería».

**Lo caro no es la luz, es despertar la página.** Está medido: el salto de
10 %/h a 5,5 %/h salió de dormirla, porque con la pantalla apagada el mapa
seguía bajando teselas. Por eso la pantalla del cruce **no abre el
navegador**: es una `Activity` nativa que dibuja en Java y no toca la página,
ni el mapa, ni la red.

**Qué se ve.** La flecha del giro lo más grande que cabe, los metros y el
lado en una palabra. Nada más. El autor fue claro: «lo que no puedo es
ponerme a leer un texto; tiene que ser un giro, un dibujo, algo que se
entienda de un plumazo».

**El croquis, solo cuando hay algo que confundir.** Se dibuja únicamente si
el cruce tiene algún ramal que no es el tuyo: «más que nada para ver que no
me equivoco en el cruce, por si hay un ramal». En una curva del camino no
sale nada. Si saliera siempre, dejaría de mirarse.

Los rumbos de esos ramales van **relativos a por dónde llegas**, así que el
croquis se dibuja con tu marcha hacia arriba. Un croquis con el norte arriba
habría que interpretarlo, y eso ya se descartó: «hay que interpretarlo, no se
lee solo».

**Se descartó la notificación sola.** Era lo barato y fue lo primero que se
propuso, pero Android le da un cuadrado de kilo y medio al lado del texto. El
autor lo vio en el dibujo y lo dijo: «si no se va a entender el dibujo, ¿para
qué lo quiero?».

**Cómo se abre.** Con una notificación de pantalla completa, igual que el
aviso de caída, que es lo único que Android deja a un servicio desde la 10.
**Desde Android 14 ese permiso está reservado a llamadas y alarmas**; si el
sistema lo ha quitado, la aplicación lo dice al encender el interruptor en
vez de callarse y no encender nada en el monte.

**Nace apagada** y se enciende con un botón en la columna del mapa, que solo
sale dentro de la aplicación. El ajuste se guarda donde los del servicio, así
que sobrevive a cerrarla.

**Lo que falta por medir**: el gasto de verdad. La cuenta con los dos datos
que hay —5,5 %/h dormido y 10 %/h despierto— da unos 7 %/h a 18 km/h con la
pantalla encendida 12 s por cruce. Es una estimación, no una medida: hay que
hacer una salida con ella encendida y mirar el resumen del final.

## La curva se avisa cinco segundos antes de ENTRAR, no diez metros antes del punto (23 de noviembre de 2026)

El autor, en el campo: «una curva me debería avisar con un poco de
antelación, "gira ahora", pero cinco segundos antes, no cuando estoy en la
mitad de la curva. En la mitad de la curva ya sé yo que tengo que girar, ya
lo veo. Tiene que avisar con antelación, cuando estoy entrando o antes de
entrar en la curva». Y dijo con qué velocidades va: «tal vez sea porque voy
en coche, más de veinte kilómetros por hora, treinta y cinco, cuarenta» y
«en bici puedo alcanzar velocidades de hasta sesenta kilómetros por hora
cuesta abajo, hay que tenerlo en cuenta».

**No era una impresión, era aritmética.** El aviso de curva estaba escrito a
**diez metros fijos** del punto de la curva, el único de los cinco avisos que
no mira la velocidad:

| velocidad | 10 m son |
|---|---|
| andando, 4 km/h | 9 s |
| bici, 18 km/h | 2 s |
| coche, 40 km/h | 0,9 s |
| bici cuesta abajo, 60 km/h | **0,6 s** |

Y encima el punto de una curva es donde **más se dobla** el track, medido con
12 m a cada lado: la **entrada** de la curva cae unos 12 m antes de ese punto.
Avisar a 10 m del punto es avisar 2 m **dentro** de la curva. Las dos cosas
que dijo el autor, y las dos ciertas.

**La regla nueva**: los 12 m de la entrada más cinco segundos de marcha,
entre 18 y 120 m.

| velocidad | avisa a | antes de entrar |
|---|---|---|
| andando, 4 km/h | 18 m | 5 s (el suelo) |
| bici, 18 km/h | 37 m | 5 s |
| coche, 40 km/h | 67 m | 5 s |
| bici cuesta abajo, 60 km/h | 95 m | 5 s |

Está en `distanciasDeAviso()` de la página (el quinto número) y en
`avisoCurva()` del servicio, con el mismo cálculo, porque lo que se oye con
la pantalla apagada lo dice el servicio.

**Lo que NO se ha tocado todavía**, medido el mismo día y pendiente: los
techos de los otros cuatro avisos también se pusieron andando y en bici
despacio, y recortan la intención escrita en cuanto se corre. A 60 km/h el
«… ahora» está escrito para dos segundos y el techo de 12 m lo deja en 0,7 s;
el segundo pitido está escrito para tres segundos y el techo de 30 m lo deja
en 1,8 s. Eso es otro cambio, con su propia batería.

## «Sigue de frente»: medido el 24 de noviembre de 2026 y NO puesto

El autor lo conto tres veces ese dia: «hay cruces que indica y otros que son
importantes y no indica». Mando por fin tres rutas suyas y se pudo medir.

**Lo primero que se vio, y es cierto**: «Sigue de frente» existe en la
pantalla y en la voz desde el 20 de noviembre de 2026, pero **ninguna regla
lo genera**. Solo se mete a mano, en una excepcion escrita para la ruta de
Asuntza (`computeJunctions`, km 7,12). O sea que un cruce que atraviesas
recto no se avisa nunca, salvo ahi.

**Cuantos serian.** Sobre las 75 rutas publicadas, 1.687 km:

| | |
|---|---|
| nodos de OSM con 3 ramas o mas por los que pasa la ruta | 791 |
| de esos, los que se cruzan RECTO (menos de 25°) | 320 |
| de esos, los que ya llevan algun aviso a 40 m | 119 |
| **los que hoy se cruzan en silencio** | **201** (uno cada 8,4 km) |

Escrita la regla general (nodo a 12 m o menos, 3 ramas o mas, giro menor de
25°, y nada avisado ya a 40 m), la foto da **365 cambios en los dos sentidos,
TODOS del mismo tipo** -`callar` → `de-frente`-: no quita ni cambia ningun
aviso. Los 5 cruces revisados siguen bien.

**Por que no se puso.** Porque no arregla ninguna de las tres marcas del
autor de ese dia:

- Aixola km 11,26: resulta que **si** tenia aviso, «sigue por la derecha,
  18°» a cuatro metros. Lo que fallaba era el comprobador de marcas.
- Aixola km 12,60: **no hay ningun nodo de OSM a 70 m**. No hay con que
  avisar, como en Otzarreta km 7,45.
- Ipurua km 13,28: es una **bifurcacion de dos ramas** y se pasa girando 7°,
  asi que la regla de tres ramas no la toca.

Se probo tambien una variante mas fina -avisar solo si OTRA rama sale casi
tan recta como la tuya, que es cuando de verdad te puedes equivocar-:

| ramas | otra rama a | avisos (ida) | uno cada |
|---|---|---|---|
| >=2 | 35° | 273 | 6,3 km |
| >=2 | 50° | 477 | 3,6 km |
| >=3 | 35° | 45 | 38 km |
| >=3 | 50° | 73 | 24 km |

Y **ninguna de las cuatro produce el Ipurua del autor**: ahi la otra rama de
la bifurcacion sale a mas de 35°, o sea que seguir recto es obvio a la vista,
y aun asi el lo marco. Eso apunta a que lo que quiere no es «avisame cuando
se pueda confundir» sino «avisame de que hay un cruce», que es la version de
los 365.

**Conclusion**: la regla de los 365 es defendible pero no esta probada por
ningun fallo suyo, y son 365 avisos mas en un navegador del que lleva dias
diciendo que habla demasiado. Cuando haya una marca suya que la regla
arregle, se pone. Mientras tanto, los numeros estan aqui para no volver a
medirlo desde cero.
