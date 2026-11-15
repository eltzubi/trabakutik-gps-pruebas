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
function contexto(app,{confirma=true,respuestas=[]}={}){
 const nodos={sosDialog:el('div'),sosCuerpo:el('div'),closeSos:el('button')};
 const c={window:{TrabakutikAndroid:app},document:{createElement:el},JSON,
  $:id=>nodos[id],confirm:()=>confirma,prompt:()=>respuestas.shift()??null,alert:()=>{}};
 vm.createContext(c);vm.runInContext(source('function abreSos(){','window.trabakutikSosActualizado'),c);
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
