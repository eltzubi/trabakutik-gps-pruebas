// «Cerca de mí»: qué rutas salen cuando el autor pulsa el botón en el monte.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../nuevo.html'),'utf8');
function source(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a);
 assert(a>=0&&b>a,`No se encontró ${start}`);
 return html.slice(a,b);
}
// El mismo codigo que corre en el movil: dist, closestMeters y el filtro.
function cerca(tracks){
 const c={tracks,nearbyOnly:true,nearbyOrigin:null,nearbyCount:0,
   R:Math.PI/180,refreshRouteLayers(){},$:()=>({textContent:'',title:''})};
 vm.createContext(c);
 vm.runInContext(source('const dist=(a,b)=>','function bearingBetween('),c);
 vm.runInContext(source('function closestMeters(p,path)','function resetJunctionView('),c);
 vm.runInContext(source('const nearbyRadius=','function applyNearbyPosition('),c);
 // nearbyCercanas se declara con let: no es una propiedad del contexto, hay
 // que pedirsela al vm. Y se copia a un array de AQUI, que el deepStrictEqual
 // de node no da por iguales dos arrays de mundos distintos.
 c.cuantas=()=>vm.runInContext('nearbyCercanas.size',c);
 c.medir=vm.runInContext('dist',c);   // dist tambien es const: igual que arriba
 // SIN REORDENAR AQUI. El conjunto conserva el orden en que se mete, que es
 // el que decide la pagina; si la prueba volviera a ordenar por su cuenta,
 // estaria comprobando su propio orden y no el del movil.
 c.desde=p=>{c.nearbyOrigin=p;c.recalculaCerca();
   return Array.from(vm.runInContext('[...nearbyCercanas]',c))};
 return c;
}
// Tramo recto de `largo` metros que empieza en (lat,lon) y va hacia el este.
const recta=(lat,lon,largo)=>({points:Array.from({length:21},(_,k)=>
  [lat,lon+(largo*k/20)/(111195*Math.cos(lat*Math.PI/180))])});
// Recta de A a B, para los casos en los que la salida y el paso no coinciden.
const linea=(a,b,n=20)=>({points:Array.from({length:n+1},(_,k)=>
  [a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n])});

test('Una ruta larga que te pasa por delante sale en Cerca de mí',()=>{
 // ESTE ERA EL FALLO. El autor, parado en Intxorta, veia UNA ruta mientras
 // por delante le pasaban nueve: sobraba un tope de 15 km de largo, y 47 de
 // sus 72 rutas pasan de 15 km. Lo larga que sea una ruta no dice nada de lo
 // cerca que te pasa.
 const larga=recta(43.10,-2.50,70000);        // 70 km, pasa por tu lado
 const lejos=recta(43.50,-2.50,3000);         // corta, pero a 44 km
 const c=cerca([larga,lejos]);
 const p=[43.1018,-2.49];                     // a unos 200 m de la larga
 assert(c.closestMeters(p,larga.points)<400,'la larga te pasa al lado');
 assert(c.routeLength(0)>15000,'y mide mas de 15 km');
 assert.deepEqual(c.desde(p),[0],'sale la larga y no la de lejos');
});

test('Cerca de mí ordena por lo cerca que te pasa, no por la salida',()=>{
 const pegada=recta(43.1001,-2.50,20000);     // te pasa a ~11 m
 const a300=recta(43.1027,-2.50,20000);       // te pasa a ~300 m
 const a900=recta(43.1081,-2.50,20000);       // te pasa a ~900 m
 const c=cerca([a900,a300,pegada]);
 assert.deepEqual(c.desde([43.10,-2.49]),[2,1,0]);
});

test('Manda por dónde te pasa, no dónde empieza',()=>{
 // Una ruta que arranca a tres kilometros pero viene a morir a tu lado esta
 // mas cerca de ti que otra que sale a quinientos metros y se va. Si se
 // ordenara por la salida, la de al lado quedaria la segunda.
 const vieneATuLado=linea([43.07,-2.50],[43.1002,-2.50]);   // sale a 3,3 km, pasa a 22 m
 const saleCercaYSeVa=linea([43.1045,-2.50],[43.1045,-2.45]); // sale a 500 m y no se acerca mas
 const c=cerca([saleCercaYSeVa,vieneATuLado]);
 const P=[43.10,-2.50];
 assert(c.closestMeters(P,vieneATuLado.points)<50);
 assert(c.medir(P,vieneATuLado.points[0])>3000,'y arranca lejos');
 assert.deepEqual(c.desde(P),[1,0]);
});

test('Una ruta que arranca a menos de 4 km sale aunque luego se aleje',()=>{
 // Puedes acercarte a la salida y hacerla entera. Sin este caso, estrechar
 // el radio de la salida no lo notaria nadie.
 const arrancaCerca=linea([43.127,-2.50],[43.20,-2.50]);  // sale a 3 km y se va al norte
 const c=cerca([arrancaCerca]);
 const P=[43.10,-2.50];
 assert(c.closestMeters(P,arrancaCerca.points)>1500,'nunca te pasa cerca');
 assert(c.medir(P,arrancaCerca.points[0])<4000,'pero arranca a menos de 4 km');
 assert.deepEqual(c.desde(P),[0]);
});

test('Cerca de mí enseña como mucho 20, y son las 20 más cercanas',()=>{
 // Sin tope de cuantas, en Trabakua saldrian 62 de las 72 rutas del autor
 // -55 arrancan en 500 m- y el boton haria lo mismo que «Todas».
 const tracks=Array.from({length:30},(_,k)=>recta(43.10+k*0.0009,-2.50,20000));
 const c=cerca(tracks);
 const salen=c.desde([43.10,-2.49]);
 assert.equal(salen.length,20);
 assert.deepEqual(salen,[...Array(20).keys()],'las 20 de más cerca, en orden');
 assert.equal(c.nearbyCount,20);
 assert.equal(c.nearTrack(0),true);
 assert.equal(c.nearTrack(25),false,'la 26ª más lejana se queda fuera');
});

test('Con la misma salida manda la más corta, que es la que puedes hacer',()=>{
 // En Trabakua 28 rutas arrancan en el mismo punto: ordenar por distancia
 // seria un sorteo. Primero la corta.
 const larga=recta(43.10,-2.50,40000),corta=recta(43.10,-2.50,5000);
 const c=cerca([larga,corta]);
 assert.deepEqual(c.desde([43.10,-2.50]),[1,0]);
});

test('Sin posición no se enseña ninguna, y con el botón apagado no se filtra',()=>{
 const c=cerca([recta(43.10,-2.50,5000)]);
 c.recalculaCerca();
 assert.equal(c.cuantas(),0,'sin posición no hay nada cerca');
 assert.equal(c.nearTrack(0),false);
 c.nearbyOnly=false;c.recalculaCerca();
 assert.equal(c.nearTrack(0),true,'con el botón apagado salen todas');
 // Y si se pierde la posición no se puede quedar la lista de hace un rato.
 const c2=cerca([recta(43.10,-2.50,5000)]);
 assert.deepEqual(c2.desde([43.10,-2.50]),[0]);
 c2.nearbyOrigin=null;c2.recalculaCerca();
 assert.equal(c2.cuantas(),0,'al perder la posición la lista se vacía');
 assert.equal(c2.nearTrack(0),false);
});

test('Con las rutas de verdad del autor, en Intxorta ya no sale una sola',()=>{
 const datos=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/trailhead.json'),'utf8'));
 const tracks=datos.tracks.filter(t=>t.points?.length>1);
 const c=cerca(tracks);
 const intxorta=[43.135,-2.505];   // donde estaba, aproximado por el mapa
 const salen=c.desde(intxorta);
 const viejo=tracks.filter((t,i)=>c.routeLength(i)<=15000&&
   (c.medir(intxorta,t.points[0])<=4000||c.closestMeters(intxorta,t.points)<=1500));
 assert.equal(viejo.length,1,'con el tope de 15 km salia una sola ruta');
 assert(salen.length>=7,'y ahora salen todas las que le pasan cerca: '+salen.length);
 assert(salen.length<=20,'sin pasarse de veinte: '+salen.length);
 // Y la primera es la que mas cerca le pasa.
 assert(c.distanciaCerca(salen[0])<=c.distanciaCerca(salen[salen.length-1]));
});
