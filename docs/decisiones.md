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
móvil tocando 5 veces la versión de abajo de la app (otras 5 lo quitan) o,
en la web, abriendo con `?avisos=1`. Sin activar no sale nunca.
