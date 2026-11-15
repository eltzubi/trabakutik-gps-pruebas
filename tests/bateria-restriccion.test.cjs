// QUE EL MOVIL NO CORTE LA NAVEGACION PARA AHORRAR BATERIA (15 nov 2026).
// Samsung corta las apps en segundo plano; con la pantalla apagada se
// quedarian sin sonar los giros y el aviso de caida. Al empezar, si la app
// tiene la bateria restringida, se ofrece quitarlo, como mucho una vez por
// semana. La 10 esta cerrada: se pide con require().
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pieza,arranque10}=require('./pieza.cjs');
function caso({libre=false,acepta=true,guardado=null,app=true}={}){
 const datos=new Map(guardado?[['trabakutik-bateria-preguntada',String(guardado)]]:[]);
 const llamadas={pide:0,pregunta:0};
 const puente={bateriaSinRestriccion:()=>libre,pideBateriaSinRestriccion:()=>{llamadas.pide++}};
 const c=pieza('10-aplicacion.js',{window:app?{TrabakutikAndroid:puente}:{},
  localStorage:{getItem:k=>datos.get(k)??null,setItem:(k,v)=>datos.set(k,v)},
  confirm:()=>{llamadas.pregunta++;return acepta}},arranque10());
 return {c,llamadas,datos};
}
test('Con la batería restringida, al empezar se ofrece quitarlo y abre el ajuste',()=>{
 const {c,llamadas}=caso();
 assert.equal(c.compruebaBateria(1e12),true);
 assert.equal(llamadas.pregunta,1);assert.equal(llamadas.pide,1);
});
test('Sin restricción, o con una APK vieja o en la web, no se pregunta nada',()=>{
 let r=caso({libre:true});assert.equal(r.c.compruebaBateria(1e12),false);assert.equal(r.llamadas.pregunta,0);
 r=caso({app:false});assert.equal(r.c.compruebaBateria(1e12),false);assert.equal(r.llamadas.pregunta,0);
});
test('Si dice que no, no se vuelve a preguntar hasta dentro de una semana',()=>{
 const {c,llamadas}=caso({acepta:false});
 assert.equal(c.compruebaBateria(1e12),false);assert.equal(llamadas.pregunta,1);assert.equal(llamadas.pide,0);
 c.compruebaBateria(1e12+3*24*3600e3);assert.equal(llamadas.pregunta,1,'a los tres dias no');
 c.compruebaBateria(1e12+8*24*3600e3);assert.equal(llamadas.pregunta,2,'a los ocho dias si');
});
