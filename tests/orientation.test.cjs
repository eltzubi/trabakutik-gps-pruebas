const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../nuevo-qa.html'),'utf8');
function runner(){
 const c={rumboSuave:null,lastCourse:null,R:Math.PI/180};vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('function bearingBetween('),html.indexOf('// Cerca de mí:')),c);
 c.dist=(a,b)=>Math.hypot((b[0]-a[0])*111195,(b[1]-a[1])*111195*Math.cos(43.2*Math.PI/180));
 vm.runInContext(html.slice(html.indexOf('let orientacionFix='),html.indexOf('function onFix(pos){')),c);
 c.fix=(heading,speed=13.9,accuracy=4,t=100000,x=0,y=0,now=t)=>c.rumboDeMovimiento({timestamp:t,coords:{latitude:43.2+y/111195,longitude:-2.5+x/(111195*Math.cos(43.2*Math.PI/180)),heading,speed,accuracy}},now);
 return c;
}
const delta=(a,b)=>(a-b+540)%360-180;
test('A 50 km/h el regreso mantiene el rumbo real aunque el track esté grabado al contrario',()=>{
 const c=runner();assert.equal(c.fix(180),180);
 for(let i=1;i<=20;i++)assert.equal(c.fix(180,13.9,4,100000+i*1000,0,-13.9*i),180);
});
test('Un cambio de sentido real gira por pasos limitados y converge',()=>{
 const c=runner();let prev=c.fix(0);
 for(let i=1;i<=12;i++){
  const h=c.fix(180,13.9,4,100000+i*1000,0,-13.9*i);
  assert(Math.abs(delta(h,prev))<=45.001);prev=h;
 }
 assert(Math.abs(delta(prev,180))<3);
});
test('Cruzar el norte usa el recorrido angular corto',()=>{
 const c=runner();c.fix(359);const h=c.fix(4,13.9,4,101000,0,14);
 assert(Math.abs(delta(h,359))<5);assert(h<5);
});
test('Parado no giran ni la flecha ni el mapa con headings aleatorios',()=>{
 const c=runner();c.fix(70);
 for(let i=1;i<25;i++)assert.equal(c.fix((i*113)%360,0,4,100000+i*1000,i%2,0),70);
});
test('Lecturas imprecisas, antiguas, duplicadas o fuera de orden conservan el rumbo',()=>{
 const c=runner();c.fix(70);
 assert.equal(c.fix(250,13.9,60,101000,0,14),70);
 assert.equal(c.fix(250,13.9,4,101000,0,14,120000),70);
 assert.equal(c.fix(250,13.9,4,100000),70);
 assert.equal(c.fix(250,13.9,4,99000),70);
});
test('Un salto GPS aislado no cambia el rumbo',()=>{
 const c=runner();c.fix(70);assert.equal(c.fix(250,13.9,4,101000,1000,1000),70);
});
test('Sin bearing usa desplazamiento fiable al caminar',()=>{
 const c=runner();assert.equal(c.fix(null,null,3),null);
 const h=c.fix(null,null,3,106000,8,0);assert(Math.abs(delta(h,90))<0.1);
});
test('Sin desplazamiento suficiente ni velocidad fiable no inventa una dirección',()=>{
 const c=runner();assert.equal(c.fix(180,null),null);
 assert.equal(c.fix(null,null,15,101000,2,1),null);
});
test('No deduce rumbo uniendo posiciones después de una pausa',()=>{
 const c=runner();c.fix(70);
 assert.equal(c.fix(null,null,4,130000,-25,0),70);
});
test('El suavizado limita el giro también con muchas lecturas por segundo',()=>{
 const c=runner();let prev=c.fix(0);
 for(let i=1;i<=10;i++){
  const h=c.fix(180,13.9,4,100000+i*100,0,-1.39*i);
  assert(Math.abs(delta(h,prev))<=4.501);prev=h;
 }
});
test('La integración comparte rumbo de movimiento sin sustituirlo por el segmento más cercano',()=>{
 const block=html.slice(html.indexOf('function onFix(pos){'),html.indexOf(' aplicaGiroMapa(false);',html.indexOf('function onFix(pos){')));
 assert(block.includes('const h=rumboDeMovimiento(pos,ultimoFix)'));
 assert(block.includes('pintaBrujula(h)'));assert(block.includes('rumboMapa=h'));
 assert(!block.includes('rumboDeLaRuta(p)'));
});
