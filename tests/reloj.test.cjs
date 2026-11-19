const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pieza,arranque10}=require('./pieza.cjs');

test('Enviar al reloj entrega un GPX con nombre y alturas al puente Android',async()=>{
 const recibidos=[];
 const c=pieza('06-creador-formas.js',{
  window:{TrabakutikAndroid:{sendGpxToWatch:(nombre,xml)=>recibidos.push({nombre,xml})}},
  notice(){},navigator:{}
 },arranque10());
 assert.equal(await c.enviaAlReloj([[43,-2,100],[43.01,-2.01,120]],'Mi ruta'),true);
 assert.equal(recibidos[0].nombre,'mi-ruta.gpx');
 assert.match(recibidos[0].xml,/<trkpt lat="43" lon="-2"><ele>100<\/ele>/);
 assert.match(recibidos[0].xml,/<name>Mi ruta<\/name>/);
 assert.equal(await c.enviaAlReloj([],'Vacía'),false);
 assert.equal(recibidos.length,1);
});

test('Una APK anterior conserva el envío mediante compartir GPX',async()=>{
 const recibidos=[];
 const c=pieza('06-creador-formas.js',{
  window:{TrabakutikAndroid:{shareGpx:(nombre,xml)=>recibidos.push({nombre,xml})}},
  notice(){},navigator:{}
 },arranque10());
 assert.equal(await c.enviaAlReloj([[43,-2],[43.01,-2.01]],'Ruta anterior'),true);
 assert.equal(recibidos[0].nombre,'ruta-anterior.gpx');
});
