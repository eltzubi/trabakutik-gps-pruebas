'use strict';
// Los nudos del GPX no son curvas (22 de noviembre de 2026).
const test=require('node:test'),assert=require('node:assert');
const {pieza}=require('./pieza.cjs');
const R=Math.PI/180;
const dist=(a,b)=>{const q=Math.sin((b[0]-a[0])*R/2)**2+Math.cos(a[0]*R)*Math.cos(b[0]*R)*Math.sin((b[1]-a[1])*R/2)**2;return 12742000*Math.asin(Math.sqrt(q))};
const c=pieza('08-cruces.js',{R,dist});
const O=[43.2,-2.5];
const xy=(x,y)=>[O[0]+y/111195,O[1]+x/(111195*Math.cos(O[0]*R))];
const cumDe=p=>{const c=[0];for(let i=1;i<p.length;i++)c.push(c[i-1]+dist(p[i-1],p[i]));return c};

test('un baile parado de 40 m en 10 m es un nudo',()=>{
 const p=[];for(let y=-100;y<=0;y+=10)p.push(xy(0,y));
 for(const [x,y] of [[5,3],[-4,6],[6,-2],[-5,-4],[3,7],[0,1]])p.push(xy(x,y));
 for(let y=10;y<=100;y+=10)p.push(xy(0,y));
 const t=c.nudosDe(p,cumDe(p));
 assert.strictEqual(t.length,1);
 assert.ok(t[0][1]-t[0][0]>=30);
});

test('una herradura de verdad no es un nudo',()=>{
 const p=[];for(let y=-60;y<=0;y+=5)p.push(xy(0,y));
 p.push(xy(5,4),xy(10,0));for(let y=-5;y>=-60;y-=5)p.push(xy(10,y));
 assert.deepStrictEqual(c.nudosDe(p,cumDe(p)),[]);
});

test('una recta no tiene nudos',()=>{
 const p=[];for(let y=0;y<=500;y+=10)p.push(xy(0,y));
 assert.deepStrictEqual(c.nudosDe(p,cumDe(p)),[]);
});

test('en un nudo se callan las curvas, no los cruces',()=>{
 const lista=[{along:100,cruce:false},{along:105,cruce:true},{along:400,cruce:false},{along:990,cruce:true}];
 const out=c.quitaCurvasDeNudos(lista,[[90,130]]);
 assert.strictEqual(JSON.stringify(out.map(j=>j.along)),JSON.stringify([105,400,990]));
});

test('dar vueltas junto al coche al llegar cuenta como nudo',()=>{
 const p=[];for(let y=-200;y<=-20;y+=10)p.push(xy(0,y));
 for(const [x,y] of [[0,-10],[2,0],[3,15],[1,5],[0,1],[0,0]])p.push(xy(x,y));
 const t=c.nudosDeExtremos(p,cumDe(p));
 assert.strictEqual(t.length,1);
});
