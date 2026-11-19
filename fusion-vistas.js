/* Selector de superficie: no cambia estados de navegación ni grabación. */
(function(){
'use strict';
var nombres=['completa','compacta','mapa'];
var iconos=['◫','▣','▤'];
var boton=document.getElementById('vistaModo');
if(!boton)return;
var vista=0;
function aplicar(){
  document.body.classList.remove('vista-compacta','vista-mapa');
  if(vista===1)document.body.classList.add('vista-compacta');
  if(vista===2)document.body.classList.add('vista-mapa');
  boton.dataset.vista=nombres[vista];
  boton.textContent=iconos[vista];
  boton.setAttribute('aria-label','Vista '+nombres[vista]+'. Cambiar vista del mapa');
  boton.title='Vista '+nombres[vista]+' · pulsar para cambiar';
  boton.setAttribute('aria-pressed',vista===2?'true':'false');
  window.dispatchEvent(new Event('resize'));
}
boton.addEventListener('click',function(){vista=(vista+1)%3;aplicar()});
aplicar();
})();
