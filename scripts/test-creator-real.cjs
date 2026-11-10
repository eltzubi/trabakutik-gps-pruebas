// Prueba opcional: consulta servicios reales con puntos públicos de Bilbao; no usa coordenadas del usuario.
const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.GPS_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:393,height:850}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept(d.type()==='prompt'?'Ruta exterior verificada':undefined));
 await page.addInitScript(()=>{
  window.nativeCalls=[];window.ns={recording:false,active:false,guiando:false,points:[]};
  window.TrabakutikAndroid={setRoute:s=>nativeCalls.push(['route',JSON.parse(s)]),setJunctions:s=>nativeCalls.push(['turns',JSON.parse(s)]),setAudioModo(){},getPosition:()=>JSON.stringify(ns),getTrackingSnapshot:()=>JSON.stringify(ns),startNavigationWithRoute:s=>{ns.active=true;ns.guiando=true;nativeCalls.push(['navigate',JSON.parse(s)])},startRecording:()=>{ns.recording=true;nativeCalls.push(['record'])},stopNavigation:()=>{ns.guiando=false;ns.active=ns.recording},stopRecording:()=>ns.recording=false};
  Object.defineProperty(navigator,'geolocation',{value:{watchPosition:()=>1,clearWatch(){}}});
 });
 await page.route('**/*',async route=>{
  const u=route.request().url();
  if(u.startsWith('http://gps.test/')){
   const file=process.cwd()+new URL(u).pathname;let body=fs.readFileSync(file);
   if(file.endsWith('nuevo.html'))body=body.toString().replace('\n})();\n</script>',"\nwindow.__creator={map,get redGps(){return redGps},get drawPoints(){return drawPoints},get anclasGps(){return anclasGps},get busy(){return calculandoMapaGps},get routePoints(){return routePoints},get junctions(){return junctions}};\n})();\n</script>");
   return route.fulfill({body,contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/json'});
  }
  // El planificador paso de OSRM a Valhalla el 9 de noviembre. Esta linea se
  // quedo con el host viejo, asi que desde entonces esta prueba cortaba la
  // peticion del planificador y no podia pasar.
  if(u.startsWith('https://valhalla1.openstreetmap.de/')){
   requests.push(new URL(u).host);
   try{
    const body=execFileSync('python3',['-c',"import urllib.request,sys;req=urllib.request.Request(sys.argv[1],headers={'User-Agent':'Trabakutik-GPS-check/1.0','Accept':'application/json','X-Client-Id':'trabakutik.com'});sys.stdout.buffer.write(urllib.request.urlopen(req,timeout=20).read())",u],{timeout:25000,maxBuffer:2e6});
    return route.fulfill({body,contentType:'application/json'});
   }catch(e){return route.abort()}
  }
  return route.abort();
 });
 await page.goto('http://gps.test/nuevo.html');await page.locator('#modeCreate').click();
 await page.waitForFunction(()=>window.__creator?.redGps);
 for(const p of [[43.263012,-2.934985],[43.264157,-2.935718]]){
  await page.evaluate(p=>__creator.map.fire('click',{latlng:L.latLng(p[0],p[1])}),p);
  await page.waitForFunction(()=>!__creator.busy,{},{timeout:45000});
 }
 const created=await page.evaluate(()=>({n:__creator.drawPoints.length,heights:__creator.drawPoints.filter(p=>Number.isFinite(p[2])).length,anchors:__creator.anclasGps.length}));
 assert.equal(created.anchors,2);assert(created.n>2,'El servicio conserva las esquinas, no una recta');assert.equal(created.heights,created.n,'Alturas reales completas');
 await page.locator('#saveCreated').click();await page.locator('#saveToMine').click();
 assert(await page.locator('#navigateSavedFromDialog').isVisible());await page.locator('#navigateSavedFromDialog').click();
 assert(await page.locator('#elevationPanel').isVisible());
 const reopened=await page.evaluate(()=>({n:__creator.routePoints.length,turns:__creator.junctions.map(j=>({angle:j.angle,direction:j.direction}))}));
 assert(reopened.turns.length>0,'La ruta real exterior contiene giros cerrados detectados');
 assert(!await page.evaluate(()=>nativeCalls.some(c=>c[0]==='navigate')));
 await page.locator('#recordStart').click();
 const calls=await page.evaluate(()=>nativeCalls),turns=calls.filter(c=>c[0]==='turns').at(-1)?.[1];
 assert(turns?.length>0);assert(calls.some(c=>c[0]==='navigate'));assert(calls.some(c=>c[0]==='record'));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({created,reopened,realServices:requests,turnsSentToAndroid:turns.length,errors}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
