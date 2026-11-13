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

## Pendiente para la próxima APK: más de 400 avisos de giro (13 de noviembre de 2026)

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
