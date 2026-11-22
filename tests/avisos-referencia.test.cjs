// La referencia de los avisos (scripts/avisos-referencia.cjs) sin los datos
// de Rutas-Mallabia: que la decision se lee bien de un aviso, que «callar»
// cuenta como resultado y que la pasada se elige por la llegada y la salida.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ref=require('../scripts/avisos-referencia.cjs');

test('la decision sale de los campos del aviso, no de la frase',()=>{
 assert.equal(ref.texto(ref.decision({direction:'izquierda',cruce:true})),'gira izquierda');
 assert.equal(ref.texto(ref.decision({direction:'derecha',mantente:true})),'sigue-recto derecha');
 assert.equal(ref.texto(ref.decision({direction:'derecha',mantente:true,noRecto:true})),'sigue derecha');
 assert.equal(ref.texto(ref.decision({direction:'vuelta',hacia:'izquierda'})),'herradura izquierda');
 assert.equal(ref.texto(ref.decision({direction:'vuelta',hacia:'izquierda',retorno:true})),'da-la-vuelta');
 assert.equal(ref.texto(ref.decision({direction:'derecha',cruce:false})),'curva-cerrada derecha');
 assert.equal(ref.texto(ref.decision({rotonda:true,direction:'derecha',hacia:'derecha',salida:2})),'rotonda derecha salida 2');
 assert.equal(ref.texto(ref.decision({deFrente:true,cruce:true})),'de-frente');
});

test('«callar» es un resultado: falla si hay aviso, vale si no lo hay',()=>{
 const gira={m:0,d:{accion:'gira',lado:'izquierda'}};
 assert.equal(ref.cumple('callar',[]),true);
 assert.equal(ref.cumple('callar',[gira]),false);
 assert.equal(ref.cumple({accion:'gira',lado:'izquierda'},[gira]),true);
 assert.equal(ref.cumple({accion:'gira',lado:'derecha'},[gira]),false);
 // Solo cuenta lo que se pide: sin lado, vale cualquier lado.
 assert.equal(ref.cumple({accion:'gira'},[gira]),true);
});

// Un ocho: la ruta pasa dos veces por el mismo punto, una hacia el este y
// otra hacia el norte. Con el punto solo no se sabe cual; con la llegada y la
// salida, si.
test('dos pasadas por el mismo sitio: manda la llegada y la salida',()=>{
 const O=[43.2,-2.5],KX=111195*Math.cos(O[0]*Math.PI/180);
 const p=(x,y)=>[O[0]+y/111195,O[1]+x/KX];
 const pts=[];
 for(let x=-100;x<=100;x+=5)pts.push(p(x,0));          // hacia el este
 for(let y=-5;y>=-100;y-=5)pts.push(p(100,y));           // baja
 for(let x=95;x>=0;x-=5)pts.push(p(x,-100));             // vuelve al oeste
 for(let y=-95;y<=100;y+=5)pts.push(p(0,y));             // sube por el centro
 const cum=[0];
 const d=(a,b)=>Math.hypot((b[1]-a[1])*KX,(b[0]-a[0])*111195);
 for(let k=1;k<pts.length;k++)cum[k]=cum[k-1]+d(pts[k-1],pts[k]);
 const r={pts,cum};
 const primera=ref.encuentra(r,{lugar:O,sentido:'ida',km:0.1,llega:90,sale:90});
 const segunda=ref.encuentra(r,{lugar:O,sentido:'ida',km:0.1,llega:0,sale:0});
 assert.ok(Math.abs(primera-100)<6,'la primera pasada, hacia el este: '+primera);
 assert.ok(Math.abs(segunda-(cum[cum.length-1]-100))<6,'la segunda, hacia el norte: '+segunda);
 // Si la ruta ya no llega asi, no se encuentra: hay que volver a mirarlo.
 assert.equal(ref.encuentra(r,{lugar:O,sentido:'ida',km:0.1,llega:180,sale:180}),null);
});
