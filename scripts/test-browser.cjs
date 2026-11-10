// Prueba Chromium con puente Android simulado. No prueba el servicio Android
// ni la navegación con el teléfono bloqueado.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
};
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    "." + new URL(req.url, "http://localhost").pathname,
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      types[path.extname(file)] || "application/octet-stream",
    );
    res.end(fs.readFileSync(file));
  } catch (e) {
    res.writeHead(404).end();
  }
});
async function setup(context) {
  await context.addInitScript(() => {
    window.__native = {
      active: false,
      navigating: false,
      recording: false,
      saves: 0,
      points: [],
      complete: true,
    };
    window.TrabakutikAndroid = {
      getAppVersion: () => "4.9.3",
      getPosition: () =>
        JSON.stringify({
          active: window.__native.active,
          recording: window.__native.recording,
          navigating: window.__native.navigating,
          guiando: window.__native.navigating,
          locationEnabled: window.__native.locationEnabled !== false,
          lat: 43.2,
          lon: -2.5,
          accuracy: window.__native.accuracy ?? 5,
          time: window.__native.fixedTime ?? Date.now(),
          speed: 0,
          bearing: 0,
          giros: 0,
          vozEstado: "ok",
        }),
      getTrackingSnapshot: () =>
        JSON.stringify({
          active: window.__native.active,
          recording: window.__native.recording,
          points: window.__native.points,
          pointsComplete: window.__native.complete,
          trackVersion: JSON.stringify(window.__native.points),
        }),
      getTrackingSnapshotIfChanged: () =>
        window.TrabakutikAndroid.getTrackingSnapshot(),
      setRoute() {},
      setJunctions() {},
      setSentido() {},
      setAudioModo() {},
      startNavigationWithRoute() {
        window.__native.active = true;
        window.__native.navigating = true;
      },
      startRecording() {
        window.__native.active = true;
        window.__native.recording = true;
      },
      stopRecording() {
        window.__native.recording = false;
      },
      saveRecording() {
        window.__native.saves++;
      },
      stopNavigation() {
        window.__native.active = false;
      },
      clearRoute() {},
      clearLiveTrack() {},
      pauseRecording() {},
      resumeRecording() {},
      discardRecording() {},
    };
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition: () => 1,
        clearWatch() {},
        getCurrentPosition() {},
      },
    });
  });
  // Evitar que la disponibilidad de mapas externos decida una prueba de UI.
  await context.route("https://**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("raw.githubusercontent.com")) {
      await route.fulfill({
        status: 503,
        body: "Servicio externo no disponible",
      });
    } else {
      await route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    }
  });
}
(async () => {
  let browser;
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port + "/";
  try {
    browser = await chromium.launch({ headless: true, executablePath:process.env.GPS_CHROMIUM_PATH||undefined, args: ["--no-sandbox","--disable-dev-shm-usage","--no-zygote"] });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await setup(context);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(base + "nuevo.html");
    await page.waitForFunction(() =>
      document.querySelector(".leaflet-container"),
    );
    // El vigilante tarda cinco segundos: comprobar su efecto real, no solo la carga.
    await page.waitForTimeout(5300);
    assert(
      !/buscando señal/i.test(await page.locator("#status").textContent()),
    );
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "desborde a " + width,
      );
    }
    // Controles utilizables incluso cuando la columna no cabe completa.
    for (const size of [{width:320,height:568},{width:568,height:320},{width:390,height:844}]) {
      await page.setViewportSize(size);
      for (const id of ['eye','locate','orient','audioMode','plus','minus']) {
        const box=await page.locator('#'+id).boundingBox();
        assert(box.width>=48&&box.height>=48,'zona táctil de '+id);
      }
      await page.locator('#minus').scrollIntoViewIfNeeded();
      const last=await page.locator('#minus').boundingBox();
      assert(last.y>=0&&last.y+last.height<=size.height,'zoom accesible con poca altura');
    }
    await page.click('#choose');
    await page.locator('#search').click();
    assert(await page.locator('#routeDialog').isVisible(),'tocar dentro conserva el selector');
    await page.locator('#routeDialog').click({position:{x:3,y:3}});
    assert(await page.locator('#routeDialog').isHidden(),'tocar fuera cierra el selector');
    await page.click('#savedRoutes');
    await page.keyboard.press('Escape');
    assert(await page.locator('#savedDialog').isHidden(),'Escape cierra Mis rutas');
    console.log('PASS Chromium: controles de 48 px, zoom accesible en horizontal y cierre exterior/Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    // Aislar la prueba del proveedor: imagen válida y después fallo de red.
    const topoPattern='https://*.tile.opentopomap.org/**';
    const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNIWRAFAALKAV9N6S9TAAAAAElFTkSuQmCC','base64');
    await context.route(topoPattern,r=>r.fulfill({status:200,contentType:'image/png',body:tile}));
    await page.selectOption('#basemap','topo');
    await page.waitForFunction(()=>document.querySelector('img.leaflet-tile-loaded[src*="opentopomap.org"]'));
    assert.match(await page.locator('#mapCredit').textContent(),/OpenTopoMap.*CC-BY-SA/);
    await context.unroute(topoPattern);
    await page.selectOption('#basemap','osm');
    await context.route(topoPattern,r=>r.abort());
    await page.click('#plus'); // pedir teselas nuevas, fuera de la caché de imágenes
    await page.selectOption('#basemap','topo');
    await page.waitForFunction(()=>document.querySelector('#basemap').value==='ign');
    assert.match(await page.locator('#status').textContent(),/Topo no está disponible/);
    await context.unroute(topoPattern);
    console.log('PASS Chromium: Topo carga y un fallo del proveedor recupera IGN');
    await page.selectOption("#basemap", "ign");
    assert.match(await page.locator("#mapCredit").textContent(), /conexión/);
    await page.click("#savedRoutes");
    let invalidImport='';
    const dialogCheck=dialog=>{invalidImport=dialog.message()};
    page.on('dialog',dialogCheck);
    await page.setInputFiles('#importGpxFile',{
      name:'coordenada-ausente.gpx',mimeType:'application/gpx+xml',
      buffer:Buffer.from('<gpx><trk><trkseg><trkpt lon="-2"/><trkpt lat="43.1" lon="-2.1"/></trkseg></trk></gpx>')
    });
    await page.waitForFunction(()=>document.querySelector('#status').textContent==='Error al importar GPX');
    assert.match(invalidImport,/Faltan coordenadas/);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('trabakutik-gps-creadas-v1')||'[]').length),0);
    page.off('dialog',dialogCheck);

    const pts = Array.from(
      { length: 101 },
      (_, i) =>
        `<trkpt lat="${43 + i * 0.00001}" lon="-2"><ele>${100 + 2 * Math.min(i, 100 - i)}</ele></trkpt>`,
    ).join("");
    await page.setInputFiles("#importGpxFile", {
      name: "prueba-cima.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from(
        "<gpx><trk><name>Prueba cima</name><trkseg>" +
          pts +
          "</trkseg></trk></gpx>",
      ),
    });
    await page
      .getByRole("button", { name: /Prueba cima · GPX importado/ })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "▶ Navegar", exact: true })
        .count(),
      0,
    );
    assert(await page.locator("#recordStart").isVisible());
    assert.equal(await page.locator('#gpsState').textContent(),'GPS sin iniciar');
    const audioDrawings=[];
    for(const modo of ['voz','pitidos','silencio']){
      assert.equal(await page.locator('#audioMode').getAttribute('data-modo'),modo);
      audioDrawings.push(await page.locator('#audioIcon').innerHTML());
      await page.click('#audioMode');
    }
    assert.equal(new Set(audioDrawings).size,3,'cada modo sonoro tiene su propio dibujo');
    assert.equal(
      await page.locator("#appVersion").textContent(),
      "Trabakutik GPS 4.9.3",
      "el numero de version se ve en la app",
    );
    assert.match(await page.locator("#distance").textContent(), /\+96 \/ -96/);
    fs.mkdirSync(path.join(root, ".test-artifacts"), { recursive: true });
    await page.screenshot({
      path: path.join(root, ".test-artifacts/gps-390.png"),
    });
    await page.click("#recordStart");
    await page.waitForFunction(
      () => window.__native.navigating && window.__native.recording,
    );
    await page.waitForFunction(()=>document.querySelector('#gpsState').dataset.estado==='recibiendo');
    assert(await page.locator('#gpsState').isVisible(),'el GPS sigue visible con los mandos ocultos');
    assert.match(await page.locator('#gpsState').textContent(),/±5 m/);
    for(const width of [320,390,768,1280]){
      await page.setViewportSize({width,height:844});
      const gpsBox=await page.locator('#gpsState').boundingBox();
      const toolsBox=await page.locator('.tools').boundingBox();
      assert(gpsBox.x>=0&&gpsBox.x+gpsBox.width<toolsBox.x,'estado GPS sin tapar mandos a '+width);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sin desborde durante la guía');
      await page.screenshot({path:path.join(root,'.test-artifacts/gps-activo-'+width+'.png')});
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>window.__native.locationEnabled=false);
    await page.waitForFunction(()=>document.querySelector('#gpsState').dataset.estado==='apagada');
    await page.evaluate(()=>{window.__native.locationEnabled=true;window.__native.accuracy=45});
    await page.waitForFunction(()=>document.querySelector('#gpsState').textContent.includes('±45 m'));
    assert.equal(await page.locator('#gpsState').getAttribute('data-estado'),'impreciso');
    // Se envejece la POSICION, no se adelanta el reloj. Congelar el reloj
    // de la pagina lo dejaba parado el resto de la prueba, y a partir de ahi
    // todo lo que depende de que pase el tiempo -el vigilante de GPS, la
    // tregua de 8 s al parar- ya no se ejercitaba de verdad.
    // 28 s: pasa de los 25 que caducan la posicion y no llega a los 30 con
    // los que el puente nativo la descarta antes de entregarla.
    await page.evaluate(()=>{window.__native.fixedTime=Date.now()-28000;window.__native.accuracy=5});
    await page.waitForFunction(()=>document.querySelector('#gpsState').dataset.estado==='sin-senal');
    await page.evaluate(()=>window.__native.fixedTime=null);
    await page.waitForFunction(()=>document.querySelector('#gpsState').dataset.estado==='recibiendo');
    await page.evaluate(() => {
      window.__native.points = [
        [43, -2],
        [43.1, -2],
      ];
      window.__native.complete = false;
    });
    await page.waitForTimeout(1300);
    await page.evaluate(() => window.trabakutikSyncNative());
    // Al arrancar la guia la pantalla se despeja: la botonera de abajo se
    // esconde sola y vuelve con el boton de mandos. Hay que pasar por ahi,
    // igual que en el monte, para poder pulsar Parar.
    assert(
      !(await page.locator("#recordStop").isVisible()),
      "al grabar, la botonera se esconde sola",
    );
    assert(await page.locator("#despeja").isVisible());
    await page.click("#despeja");
    assert(
      await page.locator("#recordStop").isVisible(),
      "el boton de mandos devuelve la botonera",
    );
    await page.click("#recordStop");
    assert.equal(await page.locator('#gpsState').textContent(),'GPS detenido');
    assert(
      await page.locator("#saveRecording").isVisible(),
      "al parar, la botonera vuelve sin tocar nada",
    );
    await page.click("#saveRecording");
    assert.equal(
      await page.evaluate(() => window.__native.saves),
      1,
      "se exporta el GPX nativo completo",
    );
    assert.deepEqual(errors, [], "errores JS");
    await context.close();
    console.log(
      "PASS Chromium: apertura, 4 anchos, IGN, importar/reabrir GPX, inicio único de navegación/grabación, Parar y exportar completo",
    );
    // Coordenadas ficticias, lejos de las rutas: crear no necesita publicar
    // ni recuperar un trazado privado del servidor.
    // SIN SERVICE WORKER EN ESTE CONTEXTO. El puente window.__creator se
    // inyecta interceptando la peticion de nuevo.html, y Playwright no
    // intercepta lo que sirve el service worker: al recargar, la pagina salia
    // de su cache sin el puente y la prueba moria con «__creator undefined».
    // El service worker tiene su propio contexto mas abajo, el de sin conexion.
    const personal = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    await setup(personal);
    // El creador vive dentro de una IIFE. Solo esta respuesta de prueba
    // expone el estado: la página y la APK entregadas no llevan este puente.
    await personal.route('**/nuevo.html',async route=>{
      const source=fs.readFileSync(path.join(root,'nuevo.html'),'utf8');
      const end='\n})();\n</script>';
      assert(source.includes(end));
      const bridge=`window.__creator={map,mueveAnclaGps,nodosManualesGps,
        get redGps(){return redGps},get drawPoints(){return drawPoints},
        get drawLayer(){return drawLayer},get anclasGps(){return anclasGps},
        get tramosGps(){return tramosGps},get routePoints(){return routePoints}};`;
      await route.fulfill({contentType:'text/html',body:source.replace(end,'\n'+bridge+end)});
    });
    let failPlanner=false,plannerRequests=0;
    // Polilinea de Valhalla: 6 decimales.
    const codificaValhalla=pts=>{
      let salida='',lat=0,lon=0;
      const trozo=v=>{let s='',x=v<0?~(v<<1):(v<<1);
        while(x>=0x20){s+=String.fromCharCode((0x20|(x&0x1f))+63);x>>=5}
        return s+String.fromCharCode(x+63)};
      for(const p of pts){
        const la=Math.round(p[0]*1e6),lo=Math.round(p[1]*1e6);
        salida+=trozo(la-lat)+trozo(lo-lon);lat=la;lon=lo;
      }
      return salida;
    };
    // El planificador está simulado: no se envían posiciones a ningún servidor.
    // Va por POST a /route; las alturas, que son del mismo servidor, siguen
    // atendidas por su propia intercepción, mas abajo.
    await personal.route('https://valhalla1.openstreetmap.de/route',async route=>{
      plannerRequests++;
      if(failPlanner){
        await route.fulfill({status:400,contentType:'application/json',
          body:JSON.stringify({error_code:171,error:'No suitable edges near location'})});
        return;
      }
      const pedido=JSON.parse(route.request().postData()||'{}');
      const puntos=(pedido.locations||[]).map(l=>[l.lat,l.lon]);
      const legs=puntos.slice(1).map((p,i)=>({shape:codificaValhalla(
        [puntos[i],[puntos[i][0],puntos[i][1]+.001],[p[0],p[1]+.001],p])}));
      await route.fulfill({contentType:'application/json',
        body:JSON.stringify({trip:{status:0,units:'kilometers',
          locations:puntos.map(p=>({lat:p[0],lon:p[1],type:'break'})),legs}})});
    });
    let failHeights=false;
    await personal.route('https://valhalla1.openstreetmap.de/height?**',async route=>{
      const q=JSON.parse(new URL(route.request().url()).searchParams.get('json'));
      if(failHeights){await route.fulfill({status:503,body:'No disponible'});return}
      // Terreno sintético: subida y bajada a lo largo del recorrido.
      await route.fulfill({contentType:'application/json',body:JSON.stringify({shape:q.shape,height:q.shape.map((p,i)=>100+3*Math.min(i,q.shape.length-1-i))})});
    });
    const creator=await personal.newPage(),creatorErrors=[];
    creator.on('pageerror',e=>creatorErrors.push(e.message));
    creator.on('dialog',d=>d.accept(d.type()==='prompt'?'Ruta personal de prueba':undefined));
    await creator.goto(base+'nuevo.html');
    await creator.click('#crearDesdeRuta');
    await creator.waitForFunction(()=>window.__creator&&window.__creator.redGps!==null);
    assert.equal(await creator.locator('#drawMethod').count(),0,'un único creador sin selector');
    assert(!(await creator.locator('#plannerStatus').isVisible()),'sin aviso fijo al entrar');
    await creator.evaluate(()=>{
      const {map}=window.__creator;
      map.fire('click',{latlng:L.latLng(43.01,-2.01)});
      map.fire('click',{latlng:L.latLng(43.0103,-2.0105)});
    });
    await creator.waitForFunction(()=>window.__creator.tramosGps.length===2);
    assert.equal(plannerRequests,1);
    await creator.waitForFunction(()=>window.__creator.drawPoints.length>1&&window.__creator.drawPoints.every(p=>Number.isFinite(p[2]))&&!document.querySelector('#saveCreated').disabled);
    assert(await creator.evaluate(()=>window.__creator.drawPoints.length>=4),'conserva la curva del motor');
    assert(await creator.locator('#elevationSvg').isVisible(),'perfil visible en senderos nuevos');
    assert.match(await creator.locator('#profileGain').textContent(),/↑ [1-9]/);
    assert.match(await creator.locator('#profileLoss').textContent(),/↓ [1-9]/);
    assert(!/sin datos|Sin alturas/.test(await creator.locator('#elevationSlope').textContent()),'pendiente al marcar');
    await creator.screenshot({path:path.join(root,'.test-artifacts/planificador-con-desnivel.png')});
    failPlanner=true;
    await creator.evaluate(()=>window.__creator.map.fire('click',{latlng:L.latLng(43.0108,-2.0103)}));
    await creator.waitForFunction(()=>document.querySelector('#plannerStatus').textContent.includes('No hay conexión'));
    assert.equal(await creator.evaluate(()=>window.__creator.anclasGps.length),2,'un error no añade rectas');
    failPlanner=false;
    await creator.click('#saveCreated');await creator.click('#saveToMine');
    assert(await creator.locator('#navigateSavedFromDialog').isVisible());
    await creator.click('#closeSave');
    await creator.click('#modeNav');await creator.click('#savedRoutes');
    await creator.getByRole('button',{name:/Ruta personal de prueba/}).click();
    assert.match(await creator.locator('#distance').textContent(),/m aprox/);
    assert(!/sin alturas/.test(await creator.locator('#distance').textContent()));
    await creator.click('#crearDesdeRuta');

    // Editar con un solo creador: puntos nuevos, arrastre, cierre y guardado.
    await creator.evaluate(()=>window.__creator.map.fire('click',{latlng:L.latLng(43.01,-2.01)}));
    await creator.evaluate(()=>window.__creator.map.fire('click',{latlng:L.latLng(43.0103,-2.0105)}));
    await creator.waitForFunction(()=>window.__creator.anclasGps.length===2&&!document.querySelector('#saveCreated').disabled);
    await creator.evaluate(()=>window.__creator.map.fire('click',{latlng:L.latLng(43.0108,-2.0103)}));
    await creator.waitForFunction(()=>window.__creator.anclasGps.length===3&&!document.querySelector('#saveCreated').disabled);
    await creator.evaluate(()=>{const c=window.__creator;c.map.fitBounds(c.drawLayer.getBounds(),{padding:[60,60]})});
    for(const width of [320,390,768,1280]){
      await creator.setViewportSize({width,height:844});
      assert(await creator.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const box=await creator.locator('.modes').boundingBox();
      assert(box.x>=0&&box.x+box.width<=width,'botones dentro de la pantalla');
    }
    await creator.setViewportSize({width:390,height:844});
    await creator.screenshot({path:path.join(root,'.test-artifacts/creador-unificado-390.png')});
    await creator.click('#undo');
    assert.equal(await creator.evaluate(()=>window.__creator.anclasGps.length),2);
    await creator.evaluate(()=>window.__creator.mueveAnclaGps(0,43.0101,-2.0101));
    await creator.waitForFunction(()=>window.__creator.drawPoints[0]?.[0]===43.0101&&!document.querySelector('#saveCreated').disabled);
    await creator.click('#cerrarCirculo');
    await creator.waitForFunction(()=>{const c=window.__creator;return c.anclasGps.length===3&&c.anclasGps.at(-1)===c.anclasGps[0]&&!document.querySelector('#saveCreated').disabled});
    await creator.click('#undo');await creator.click('#idaVuelta');
    assert.equal(await creator.evaluate(()=>window.__creator.anclasGps.at(-1)===window.__creator.anclasGps[0]),true);
    await creator.click('#saveCreated');await creator.click('#saveToMine');
    await creator.reload();await creator.click('#savedRoutes');
    await creator.getByRole('button',{name:/Ruta personal de prueba/}).click();
    assert.deepEqual(await creator.evaluate(()=>window.__creator.routePoints[0].slice(0,2)),[43.0101,-2.0101]);
    assert(!/sin alturas/.test(await creator.locator('#distance').textContent()));
    assert.deepEqual(creatorErrors,[],'errores del creador');
    await personal.close();
    console.log('PASS Chromium: creador único sin selector ni aviso fijo, perfil, 4 anchos, deshacer, arrastrar, cerrar, ida y vuelta y guardar/reabrir con alturas');
    const offline = await browser.newContext();
    await setup(offline);
    const p = await offline.newPage();
    await p.goto(base + "nuevo.html");
    await p.waitForFunction(() => navigator.serviceWorker.controller);
    await offline.setOffline(true);
    const slug = JSON.parse(
      fs.readFileSync(path.join(root, "data/trailhead.json")),
    ).tracks[0].href.replace(/\.html$/, "");
    await p.goto(base + "nuevo.html?ruta=" + slug);
    await p.waitForFunction(
      () => !document.querySelector("#mapTitle").disabled,
    );
    assert(await p.locator(".leaflet-container").count());
    await offline.close();
    console.log(
      "PASS Chromium: reapertura sin red con parámetro de ruta y mapa montado",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
