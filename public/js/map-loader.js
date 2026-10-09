(() => {
'use strict';
const sources=['https://cdn.jsdelivr.net/npm/ol@v10.11.0/dist/ol.js','https://unpkg.com/ol@v10.11.0/dist/ol.js'];
let started=false;
function startMap(){if(started)return;started=true;const status=document.getElementById('map-status');if(status)status.textContent='OpenLayers loaded · creating the map…';const script=document.createElement('script');script.src='/js/map.js';script.async=true;script.onerror=()=>{if(status)status.textContent='Map code failed to load. Reload the page; the issue has been recorded in the browser console.'};document.body.appendChild(script)}
function load(index){if(started)return;if(window.ol&&window.ol.Map){startMap();return}if(index>=sources.length){startMap();return}const script=document.createElement('script');script.src=sources[index];script.async=true;let settled=false;const timer=setTimeout(()=>{if(settled||started)return;settled=true;script.remove();load(index+1)},8000);script.onload=()=>{if(settled||started)return;settled=true;clearTimeout(timer);if(window.ol&&window.ol.Map)startMap();else load(index+1)};script.onerror=()=>{if(settled||started)return;settled=true;clearTimeout(timer);script.remove();load(index+1)};document.head.appendChild(script)}
const status=document.getElementById('map-status');if(status)status.textContent='Loading OpenLayers mapping engine…';load(0);
})();