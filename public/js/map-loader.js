(() => {
'use strict';
const sources=['https://cdn.jsdelivr.net/npm/ol@10.11.0/dist/ol.js','https://unpkg.com/ol@10.11.0/dist/ol.js'];
function startMap(){const script=document.createElement('script');script.src='/js/map.js';script.onerror=()=>{const status=document.getElementById('location-status');if(status)status.textContent='Map script failed to load. Reload the page; device location is not required.'};document.body.appendChild(script)}
function load(index){if(window.ol&&window.ol.Map){startMap();return}if(index>=sources.length){startMap();return}const script=document.createElement('script');script.src=sources[index];script.async=true;script.onload=()=>window.ol&&window.ol.Map?startMap():load(index+1);script.onerror=()=>load(index+1);document.head.appendChild(script)}
load(0);
})();