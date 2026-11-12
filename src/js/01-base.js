
(()=>{'use strict';
// Los titulos de verdad de cada ruta. Sin esto la lista enseñaba el nombre
// del archivo —«zengotitagarai», «askakosantakataline»— y no se sabia de que
// ruta se trataba. Salen de data/rutas.json, que escribe el build de la web
// y pesa 15 kB. Va aparte de trailhead.json a proposito: ese ya son 500 kB y
// lo baja todo el que abre el mapa.
// toName es el unico sitio que hay que tocar: de el beben la lista, el
// titulo de arriba y el buscador, que asi busca por palabras de verdad
// («Garai», «dolmenes») y no por trozos del nombre del archivo.
let nombresDeRuta={},datosDeRuta={};
// Buscar sin tildes, como el buscador de la web (src/js/filters.js). Hasta
// ahora daba igual porque se buscaba sobre el nombre del archivo, que no
// lleva ninguna; con los titulos de verdad «dolmen» no encontraba
// «los dolmenes» y «Arandono» no encontraba «Arandono».
const sinTildes=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

if(window.TrabakutikAndroid)document.documentElement.classList.add('android-app');
const enLaApp=!!window.TrabakutikAndroid;
const BASE_GPS='https://eltzubi.github.io/trabakutik-gps-pruebas/';
// Un «intent://» de Android: si la app esta instalada, la abre con la ruta
// puesta; si no, Chrome se va solo al S.browser_fallback_url, que es la
// pagina de descarga. Un toque y, o navegas, o te la bajas.
function enlaceApp(slug){
 return 'intent://navegar?ruta='+encodeURIComponent(slug)
  +'#Intent;scheme=trabakutikgps;package=com.trabakutik.gps;S.browser_fallback_url='
  +encodeURIComponent(BASE_GPS+'instalar.html')+';end';
}
// Si llegas desde «Navegar esta ruta» de la web -o sea, con ?ruta= y fuera
// de la app- en un Android, no tiene sentido ensenar un mapa que no puede
// navegar: salta la aplicacion, o la descarga. Lo pidio el autor. Solo una
// vez por pestaña, para no atrapar a quien vuelva aposta al navegador, y
// solo en Android: en un ordenador el intent:// no existe.
(function(){
 if(enLaApp||!/Android/i.test(navigator.userAgent))return;
 const slug=new URLSearchParams(location.search).get('ruta');
 if(!slug||!/^[a-z0-9_-]+$/i.test(slug))return;
 try{if(sessionStorage.getItem('trabakutik-salto'))return;
     sessionStorage.setItem('trabakutik-salto','1');}catch(e){}
 location.replace(enlaceApp(slug));
})();
const $=id=>document.getElementById(id),R=Math.PI/180,toName=t=>nombresDeRuta[t.href]||t.href.replace(/\.html$/,'').replace(/[-_]/g,' '),fmt=m=>m>=1000?(m/1000).toFixed(2).replace('.',',')+' km':Math.round(m)+' m';
// ---------------------------------------------------------------------
