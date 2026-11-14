// LAS GRABACIONES EN «MIS RUTAS»: verlas y borrarlas sin borrar nada sin querer.
// Lo pidio el autor el 14 de noviembre de 2026: «siempre que sea claro, que no
// se borre sin querer y que sea facil de identificar».
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../nuevo.html'),'utf8');
function source(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0&&b>a,'No se encontro '+start);return html.slice(a,b)}
function el(tag){return {tag,children:[],attrs:{},style:{},className:'',textContent:'',
 append(...c){this.children.push(...c)},setAttribute(k,v){this.attrs[k]=v}}}
function contexto(app,respuesta){
 const avisos=[];let repintado=0;const preguntas=[];
 const c={window:{TrabakutikAndroid:app},document:{createElement:el},JSON,Date,Number,String,Math,
  confirm:t=>{preguntas.push(t);return respuesta},notice:t=>avisos.push(t),showSaved:()=>{repintado++}};
 vm.createContext(c);vm.runInContext(source('const DIAS_GRAB=',"$('savedRoutes').onclick"),c);
 return {c,avisos,preguntas,get repintado(){return repintado}};
}
const todos=n=>[n,...n.children.flatMap(todos)];
const sabado={nombre:'trabakutik-20261114-080446.gpx',inicio:'2026-11-14T07:04:46Z',fin:'2026-11-14T09:36:05Z',km:39.2,puntos:9080,grabando:false};
test('Cada grabación dice el día, la hora, los km y lo que duró',()=>{
 const {c}=contexto(null,false);
 assert.equal(c.describeGrabacion(sabado).linea,'Sábado 14 nov · 08:04 · 39,2 km · 2 h 31 min');
 const t=c.textoBorrarGrabacion(sabado);
 assert.match(t,/¿Borrar la grabación del sábado 14 de noviembre a las 08:04 \(39,2 km, 2 h 31 min\)\?/);
 assert.match(t,/no se puede recuperar/);assert.match(t,/Descargas, esa copia no se toca/);
});
test('Sin la APK nueva (o en la web) no aparece nada',()=>{
 const t=el('div');contexto(undefined,true).c.pintaGrabaciones(t);assert.equal(t.children.length,0);
 const t2=el('div');contexto({listRecordings:()=>'[]'},true).c.pintaGrabaciones(t2);assert.equal(t2.children.length,0,'una APK que no sabe borrar tampoco');
});
test('La que se está grabando no tiene botón de borrar',()=>{
 const app={listRecordings:()=>JSON.stringify([{...sabado,nombre:'trabakutik-20261114-120000.gpx',grabando:true},sabado]),deleteRecording:()=>true};
 const t=el('div');contexto(app,true).c.pintaGrabaciones(t);
 const botones=todos(t).filter(n=>n.tag==='button');
 assert.equal(botones.length,1,'un solo boton, el de la que no se graba');
 assert.equal(botones[0].textContent,'Borrar');assert.match(botones[0].className,/btn-borrar/);
 assert(todos(t).some(n=>n.textContent==='● Grabando ahora'));
});
test('Si se cancela la pregunta no se borra nada; si se acepta, se borra esa y solo esa',()=>{
 const borradas=[];const app={listRecordings:()=>JSON.stringify([sabado]),deleteRecording:n=>{borradas.push(n);return true}};
 let k=contexto(app,false),t=el('div');k.c.pintaGrabaciones(t);
 todos(t).find(n=>n.tag==='button').onclick();
 assert.equal(borradas.length,0,'cancelar no borra');assert.equal(k.preguntas.length,1);
 k=contexto(app,true);t=el('div');k.c.pintaGrabaciones(t);
 todos(t).find(n=>n.tag==='button').onclick();
 assert.deepEqual(JSON.stringify(borradas),JSON.stringify([sabado.nombre]));
 assert.match(k.avisos[0],/^Grabación borrada: Sábado 14 nov/);assert.equal(k.repintado,1,'y la lista se repinta');
});
test('Si la app no la deja borrar, lo dice',()=>{
 const app={listRecordings:()=>JSON.stringify([sabado]),deleteRecording:()=>false};
 const k=contexto(app,true),t=el('div');k.c.pintaGrabaciones(t);
 todos(t).find(n=>n.tag==='button').onclick();
 assert.equal(k.avisos[0],'No se ha podido borrar la grabación');
});
