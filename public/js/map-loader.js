(() => {
'use strict';
const sources=['https://cdn.jsdelivr.net/npm/ol@v10.11.0/dist/ol.js','https://unpkg.com/ol@v10.11.0/dist/ol.js'];
const status=document.getElementById('map-status');let appStarted=false;
function startMap(){if(appStarted)return;appStarted=true;const script=document.createElement('script');script.src='/js/map.js';script.async=true;script.onerror=()=>{if(status)status.textContent='Map application failed to load. Please reload the page.'};document.body.appendChild(script)}
function loadEngine(index){
 if(window.ol&&window.ol.Map){window.dispatchEvent(new Event('openlayers-ready'));return}
 if(index>=sources.length)return;
 const script=document.createElement('script');script.src=sources[index];script.async=true;let settled=false;
 const timer=setTimeout(()=>{if(settled)return;settled=true;script.remove();loadEngine(index+1)},4500);
 script.onload=()=>{if(settled)return;settled=true;clearTimeout(timer);if(window.ol&&window.ol.Map)window.dispatchEvent(new Event('openlayers-ready'));else loadEngine(index+1)};
 script.onerror=()=>{if(settled)return;settled=true;clearTimeout(timer);script.remove();loadEngine(index+1)};document.head.appendChild(script)
}
if(status)status.textContent='Opening the world map…';startMap();loadEngine(0);
})();