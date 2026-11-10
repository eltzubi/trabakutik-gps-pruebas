const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../nuevo.html'),'utf8');
const start=html.indexOf('function estadoGpsVisual('),end=html.indexOf('function pintaEstadoGps(',start);
assert(start>=0&&end>start);
const c={};vm.createContext(c);vm.runInContext(html.slice(start,end),c);
const ahora=100000;
const estado=extra=>c.estadoGpsVisual({solicitado:true,apagado:false,error:null,
 fix:{time:ahora,accuracy:8},ubicacion:true,ahora,...extra});

test('Cargar una ruta no dice que recibe GPS; detener prevalece sobre una posición guardada',()=>{
 assert.equal(estado({solicitado:false}).texto,'GPS sin iniciar');
 assert.equal(estado({apagado:true}).texto,'GPS detenido');
 assert.equal(estado({fix:null}).texto,'Buscando posición GPS');
});
test('La precisión viene de la lectura y se redondea hacia arriba',()=>{
 assert.equal(estado({}).texto,'Posición · ±8 m');
 assert.equal(estado({fix:{time:ahora,accuracy:8.2}}).texto,'Posición · ±9 m');
 assert.equal(estado({fix:{time:ahora,accuracy:35}}).estado,'recibiendo');
 for(const accuracy of [36,60,100,NaN,null,-1])
  assert.equal(estado({fix:{time:ahora,accuracy}}).estado,'impreciso');
});
test('La posición caduca aunque la última precisión fuera buena; al volver se recupera',()=>{
 assert.equal(estado({fix:{time:ahora-11999,accuracy:8}}).estado,'recibiendo');
 assert.equal(estado({fix:{time:ahora-12000,accuracy:8}}).estado,'buscando');
 for(const time of [ahora-25000,ahora-60000,NaN])
  assert.equal(estado({fix:{time,accuracy:8}}).estado,'sin-senal');
 // Una posicion con hora del «futuro» es que el reloj del movil va por
 // detras del satelite, no que falte señal: cuenta como recien llegada.
 for(const time of [ahora+1,ahora+900,ahora+5000])
  assert.equal(estado({fix:{time,accuracy:8}}).estado,'recibiendo',`hora ${time-ahora} ms por delante`);
 assert.equal(estado({}).estado,'recibiendo');
});
test('Ubicación apagada y permisos denegados no quedan verdes por una lectura anterior',()=>{
 assert.equal(estado({ubicacion:false}).texto,'Ubicación apagada');
 assert.equal(estado({error:1}).texto,'Sin permiso de ubicación');
 for(const error of [2,3])assert.equal(estado({error}).estado,'sin-senal');
});

test('Volver a arrancar el GPS borra el error de antes, pero no la última posición',()=>{
 // Deniegas el permiso, lo concedes y vuelves a arrancar: el chivato se
 // quedaba en rojo con «Sin permiso de ubicación» hasta que entrara la
 // primera posición, diciendo lo contrario que el texto de abajo. El error
 // tiene que limpiarse SIEMPRE al arrancar, no solo la primera vez.
 const ini=html.indexOf('function startGPS(');
 assert(ini>=0,'no se encuentra startGPS');
 const cuerpo=html.slice(ini,html.indexOf('\n}',ini));
 const limpia=cuerpo.slice(0,cuerpo.indexOf('gpsApagadoPorTi=false'));
 assert.match(limpia,/(^|[;{}\s])errorVisualGps=null;/m,
   'startGPS tiene que borrar errorVisualGps al arrancar');
 // Y ese borrado NO puede estar dentro del «solo la primera vez».
 const guardado=limpia.match(/if\(!gpsSolicitado\)\{[^}]*\}/);
 assert(guardado,'sigue estando la rama de la primera vez');
 assert(!guardado[0].includes('errorVisualGps'),
   'el error no puede limpiarse solo la primera vez: ahi estaba el fallo');
 // La posición sí se conserva: si había una buena, sigue valiendo.
 assert(guardado[0].includes('fixVisualGps=null'),'la posición se reinicia solo la primera vez');
});
