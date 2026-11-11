// EL MAPA GUARDADO PARA EL MONTE. El service worker guardaba solo las teselas
// que miras: si antes de salir no repasas la ruta entera a mano, en el km 12
// el track va sobre fondo blanco. Esto baja el pasillo entero de una vez.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../nuevo.html'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
function source(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a);
 assert(a>=0&&b>a,`No se encontró ${start}`);
 return html.slice(a,b);
}
function contexto(){
 const c={L:{Util:{template:(t,d)=>t.replace(/\{(\w+)\}/g,(m,k)=>k in d?d[k]:m)}},
  baseMaps:{
   ign:{_url:'https://www.ign.es/wmts/mapa-raster?TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'},
   osm:{_url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}},
  routePoints:[],drawPoints:[],Math,Promise,Set,Array,Number,JSON,console};
 vm.createContext(c);
 vm.runInContext(source('const MAPA_Z_MIN=','function cacheDeMapas()'),c);
 // Un «const» dentro de un vm NO es una propiedad del contexto: hay que
 // leerlo evaluando su nombre dentro.
 c.val=n=>vm.runInContext(n,c);
 return c;
}
const recta=(km)=>{const p=[];for(let m=0;m<=km*1000;m+=20)p.push([43.2+m/111195,-2.55]);return p};

test('El pasillo cubre la ruta entera y no se deja huecos entre puntos lejanos',()=>{
 const c=contexto();
 // Dos puntos a 3 km: sin rellenar, al zoom 17 faltarian trece teselas.
 const saltos=[[43.2,-2.55],[43.227,-2.55]];
 const t=c.teselasDeRuta(saltos,17,17,0);
 const ys=t.map(q=>q.y).sort((a,b)=>a-b);
 assert(t.length>=12,`solo ${t.length} teselas para 3 km al zoom 17`);
 for(let i=1;i<ys.length;i++)assert.equal(ys[i]-ys[i-1],1,'hay un hueco en el pasillo');
});
test('Cada tesela sale una sola vez aunque el track pase dos veces',()=>{
 const c=contexto();
 const ida=recta(1),vuelta=ida.slice().reverse();
 const t=c.teselasDeRuta(ida.concat(vuelta),15,15,1);
 const claves=new Set(t.map(q=>q.z+'/'+q.x+'/'+q.y));
 assert.equal(claves.size,t.length,'hay teselas repetidas');
});
test('Los zooms y el margen son los medidos: una ruta de 37 km cabe en unos 13 MB',()=>{
 const c=contexto();
 assert.equal(c.val('MAPA_Z_MIN'),13);
 // Hasta el 17 y no mas: el IGN no tiene teselas propias por encima.
 assert.equal(c.val('MAPA_Z_MAX'),17);
 const t=c.teselasDeRuta(recta(37),c.val('MAPA_Z_MIN'),c.val('MAPA_Z_MAX'),c.val('MAPA_MARGEN'));
 assert(t.length>400&&t.length<2500,`${t.length} teselas para 37 km`);
});
test('Solo se pueden guardar las capas del IGN',()=>{
 const c=contexto();
 // OpenStreetMap lo prohibe en su politica de teselas y OpenTopoMap no dice
 // nada: solo entran las dos del IGN, que van con licencia CC-BY 4.0.
 const capas=c.val('Object.keys(CAPAS_GUARDABLES).sort().join(" ")');
 assert.equal(capas,'ign pnoa');
});
test('La URL de la tesela sale de la capa de Leaflet, no de una copia',()=>{
 const c=contexto();
 const u=c.urlTesela('ign',{z:16,x:31737,y:23738});
 assert(u.includes('TILEMATRIX=16'),u);
 assert(u.includes('TILEROW=23738'),u);
 assert(u.includes('TILECOL=31737'),u);
 assert.equal(c.urlTesela('noexiste',{z:1,x:1,y:1}),null);
});
test('Sin ruta no hay pasillo que bajar',()=>{
 const c=contexto();
 assert.equal(c.teselasDeRuta([],13,17,1).length,0);
 assert.equal(c.teselasDeRuta([[43.2,-2.55]],13,17,1).length,0);
});
test('El service worker guarda el mapa bajado aparte y no lo tira nunca',()=>{
 assert(/indexOf\('mapas-'\)\s*===\s*0\)\s*return;/.test(sw),
  'la cache de mapas bajados tiene que librarse del borrado de versiones');
 assert(sw.includes('ignoreVary: true'),
  'la tesela se guarda con fetch y se pide con <img>: sin ignoreVary podria no casar');
 assert(/TESELAS_MAX\s*=\s*900/.test(sw),
  'el recorte de 900 es solo para las teselas que se guardan solas');
 const recorte=sw.slice(sw.indexOf('function recorta'));
 assert(!recorte.slice(0,400).includes('mapas-'),
  'el recorte no puede tocar el mapa bajado a proposito');
 // La descarga del mapa pide las teselas con fetch -destination ''-; si el
 // service worker las atendiera, acabarian ademas en la cache de 900 que se
 // recorta, y bajar una ruta entera echaria fuera todo lo demas.
 assert(/esTesela\(url\) && peticion\.destination === 'image'/.test(sw),
  'el service worker solo atiende las teselas que pide el mapa');
});
test('Sin sitio en el teléfono se dice eso, no «mejor cobertura»',()=>{
 const bloque=source('function guardaMapaRuta(','function puntosDelMapa()');
 assert(/QuotaExceededError/.test(bloque),'hay que distinguir el disco lleno del fallo de red');
 assert(/estado\.sinSitio=true/.test(bloque));
 const aviso=source("if($('mapaBajar'))$('mapaBajar').onclick=",'mapaGuardadoInfo().then(info=>{');
 assert(/e\.sinSitio\)notice\('No cabe el mapa entero/.test(aviso),
  'y el aviso tiene que decir que libere espacio, no que busque cobertura');
 assert(aviso.indexOf('e.sinSitio)notice')<aviso.indexOf('e.fallos)notice'),
  'el de sin sitio va antes, que si no lo tapa el de los fallos');
});
