(() => {
'use strict';
const status=document.getElementById('map-status');
const leafletCss='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const scripts=[
 {js:'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',css:leafletCss},
 {js:'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',css:'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'}
];
let started=false;
function loadApp(src,primary){
 if(started)return;started=true;
 const script=document.createElement('script');script.src=src;script.async=true;
 script.onerror=()=>{if(primary){started=false;document.querySelector('.map-shell')?.classList.remove('leaflet-active');const canvas=document.getElementById('world-map');if(canvas)canvas.removeAttribute('aria-hidden');fallback()}else if(status)status.textContent='Map application failed to load. Please reload the page.'};
 document.body.appendChild(script);
 if(primary){document.querySelector('.map-shell')?.classList.add('leaflet-active');const canvas=document.getElementById('world-map');if(canvas)canvas.setAttribute('aria-hidden','true')}
}
function fallback(){
 if(status)status.textContent='Leaflet could not load from the available CDNs. Starting the built-in fallback map…';
 loadApp('/js/map.js?v=20261009c',false);
}
function loadLeaflet(index){
 if(window.L&&window.L.map){const link=document.createElement('link');link.rel='stylesheet';link.href=scripts[index].css;link.onload=()=>loadApp('/js/leaflet-map.js?v=20261009c',true);link.onerror=()=>{if(index+1<scripts.length)loadLeaflet(index+1);else fallback()};document.head.appendChild(link);return}
 if(index>=scripts.length){fallback();return}
 const script=document.createElement('script');script.src=scripts[index].js;script.async=true;let settled=false;
 const timer=setTimeout(()=>{if(settled)return;settled=true;script.remove();loadLeaflet(index+1)},8000);
 script.onload=()=>{if(settled)return;settled=true;clearTimeout(timer);if(window.L&&window.L.map)loadLeaflet(index);else loadLeaflet(index+1)};
 script.onerror=()=>{if(settled)return;settled=true;clearTimeout(timer);script.remove();loadLeaflet(index+1)};
 document.head.appendChild(script);
}
if(status)status.textContent='Loading interactive map engine…';
loadLeaflet(0);
})();