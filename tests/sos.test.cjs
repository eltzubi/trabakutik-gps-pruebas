// LA HOJA DEL BOTON SOS (pieza 10): pedir ayuda y el aviso de caida.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../nuevo.html'),'utf8');
function source(a,b){const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,'No se encontro '+a);return html.slice(i,j)}
function el(tag){return {tag,children:[],attrs:{},className:'',textContent:'',checked:false,type:'',
 append(...c){this.children.push(...c)},replaceChildren(){this.children=[]},setAttribute(k,v){this.attrs[k]=v},
 classList:{h:new Set(['hidden']),add(x){this.h.add(x)},remove(x){this.h.delete(x)},contains(x){return this.h.has(x)}}}}
const todos=n=>[n,...(n.children||[]).flatMap(todos)];
// La 10 esta cerrada: abreSos se pide con require().
const {pieza,arranque10}=require('./pieza.cjs');
function contexto(app,{confirma=true,respuestas=[]}={}){
 const nodos={sosDialog:el('div'),sosCuerpo:el('div'),closeSos:el('button')};
 const c=pieza('10-aplicacion.js',{window:{TrabakutikAndroid:app},document:{createElement:el},
  $:id=>nodos[id],confirm:()=>confirma,prompt:()=>respuestas.shift()??null,alert:()=>{}},arranque10());
 return {c,nodos};
}
const cfg=(o={})=>JSON.stringify({activo:true,contactos:[{nombre:'Ama',telefono:'+34600111222'}],max:3,permisoSms:true,golpes:2,caidas:0,...o});
test('Con una APK vieja, el botón SOS hace lo de siempre',()=>{
 let compartido=0;const {c,nodos}=contexto({shareSos:()=>compartido++});
 c.abreSos();assert.equal(compartido,1);assert(nodos.sosDialog.classList.contains('hidden'),'no abre la hoja');
});
test('La hoja enseña pedir ayuda, el interruptor, los contactos y la prueba',()=>{
 const llamadas=[];const app={shareSos:()=>llamadas.push('sos'),getSosConfig:()=>cfg(),setFallDetection:v=>llamadas.push('activo:'+v),
  removeSosContact:t=>llamadas.push('quita:'+t),pickSosContact:()=>llamadas.push('agenda'),addSosContact:()=>true,requestSmsPermission(){},testFall:()=>llamadas.push('prueba')};
 const {c,nodos}=contexto(app);c.abreSos();
 assert(!nodos.sosDialog.classList.contains('hidden'),'abre la hoja');
 const n=todos(nodos.sosCuerpo),txt=n.map(x=>x.textContent);
 assert(txt.includes('Pedir ayuda ahora')&&txt.includes('Aviso de caída')&&txt.includes('Ama')&&txt.includes('+34600111222'));
 assert(txt.some(t=>/no avisa al 112/.test(t)),'dice que no avisa al 112');
 assert(txt.includes('Probar la alarma (no envía nada)'));
 const sw=n.find(x=>x.type==='checkbox');assert(sw.checked&&sw.attrs.role==='switch');
 sw.checked=false;sw.onchange();assert(llamadas.includes('activo:false'));
 n.find(x=>x.textContent==='Quitar').onclick();assert(llamadas.includes('quita:+34600111222'));
 n.find(x=>x.textContent==='Elegir de la agenda').onclick();assert(llamadas.includes('agenda'));
 n.find(x=>x.textContent==='Probar la alarma (no envía nada)').onclick();assert(llamadas.includes('prueba'));
 n.find(x=>x.textContent==='Pedir ayuda ahora').onclick();assert(llamadas.includes('sos'));
 assert(!txt.includes('Enviar un SMS de prueba'),'sin sendTestSms (APK vieja) no sale');
});
test('Sin contactos lo avisa; sin permiso de SMS, también; con 3 no deja añadir más',()=>{
 const base={shareSos(){},setFallDetection(){},removeSosContact(){},pickSosContact(){},addSosContact:()=>true,requestSmsPermission(){},testFall(){}};
 let {c,nodos}=contexto({...base,getSosConfig:()=>cfg({contactos:[]})});c.abreSos();
 assert(todos(nodos.sosCuerpo).some(x=>/no se puede avisar a nadie/.test(x.textContent)));
 ({c,nodos}=contexto({...base,getSosConfig:()=>cfg({permisoSms:false})}));c.abreSos();
 assert(todos(nodos.sosCuerpo).some(x=>/Falta el permiso para mandar SMS/.test(x.textContent)));
 const tres=[1,2,3].map(k=>({nombre:'C'+k,telefono:'60011122'+k}));
 ({c,nodos}=contexto({...base,getSosConfig:()=>cfg({contactos:tres})}));c.abreSos();
 assert(!todos(nodos.sosCuerpo).some(x=>x.textContent==='Elegir de la agenda'),'con 3 no salen los botones de añadir');
});
test('Escribir número pasa nombre y teléfono a la app',()=>{
 const añadidos=[];const app={shareSos(){},getSosConfig:()=>cfg({contactos:[]}),setFallDetection(){},removeSosContact(){},pickSosContact(){},
  addSosContact:(n,t)=>{añadidos.push([n,t]);return true},requestSmsPermission(){},testFall(){}};
 const {c,nodos}=contexto(app,{respuestas:['Aita','600 333 444']});c.abreSos();
 todos(nodos.sosCuerpo).find(x=>x.textContent==='Escribir número').onclick();
 assert.equal(JSON.stringify(añadidos),JSON.stringify([['Aita','600 333 444']]));
});
test('Con permiso de SMS y un contacto sale «Enviar un SMS de prueba»; sin permiso, no',()=>{
 let enviado=0;const base={shareSos(){},setFallDetection(){},removeSosContact(){},pickSosContact(){},addSosContact:()=>true,requestSmsPermission(){},testFall(){},sendTestSms:()=>enviado++};
 let {c,nodos}=contexto({...base,getSosConfig:()=>cfg()});c.abreSos();
 const b=todos(nodos.sosCuerpo).find(x=>x.textContent==='Enviar un SMS de prueba');assert(b,'sale el boton');b.onclick();assert.equal(enviado,1);
 ({c,nodos}=contexto({...base,getSosConfig:()=>cfg({permisoSms:false})}));c.abreSos();
 assert(!todos(nodos.sosCuerpo).some(x=>x.textContent==='Enviar un SMS de prueba'),'sin permiso no sale');
});
test('Si falta la hoja en el HTML (una página vieja en la caché), el botón pide ayuda como siempre',()=>{
 let compartido=0;const app={shareSos:()=>compartido++,getSosConfig:()=>'{}'};
 const c=pieza('10-aplicacion.js',{window:{TrabakutikAndroid:app},document:{createElement:()=>({})},$:()=>null,confirm:()=>true,prompt:()=>null,alert:()=>{}},arranque10());
 c.abreSos();assert.equal(compartido,1);
});
test('La hoja dice por qué no funciona: sin permiso de SMS o sin notificaciones',()=>{
 const base={shareSos(){},setFallDetection(){},removeSosContact(){},pickSosContact(){},addSosContact:()=>true,requestSmsPermission(){},testFall(){}};
 let {c,nodos}=contexto({...base,getSosConfig:()=>cfg({permisoSms:false})});c.abreSos();
 assert(todos(nodos.sosCuerpo).some(x=>x.textContent==='No funciona: falta el permiso de SMS'));
 ({c,nodos}=contexto({...base,getSosConfig:()=>cfg({notificaciones:false})}));c.abreSos();
 const t=todos(nodos.sosCuerpo).map(x=>x.textContent);
 assert(t.includes('No funciona: faltan las notificaciones')&&t.some(x=>/notificaciones de la app están desactivadas/.test(x)));
 ({c,nodos}=contexto({...base,getSosConfig:()=>cfg({notificaciones:true})}));c.abreSos();
 assert(todos(nodos.sosCuerpo).some(x=>x.textContent==='Activado'));
});


test('La hoja describe el envío de SOS según la capacidad de la APK',()=>{
 for(const envioManual of [true,undefined]){
  const {c,nodos}=contexto({shareSos(){},getSosConfig:()=>cfg({envioManual})});c.abreSos();
  const textos=todos(nodos.sosCuerpo).map(x=>x.textContent).join(' ');
  assert.equal(textos.includes('La alarma se cierra tras 30 s.'),envioManual===true);
  assert.equal(textos.includes('Si no respondes en 30 s'),envioManual!==true);
 }
});
