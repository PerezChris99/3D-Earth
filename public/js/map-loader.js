(() => {
'use strict';
const status=document.getElementById('map-status');
const shell=document.querySelector('.map-shell');
const canvas=document.getElementById('world-map');
const version='20261012b';
const scripts=[
 {js:'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',css:'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'},
 {js:'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',css:'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'}
];
let appLoading=false,fallbackStarted=false;
function setStatus(message){if(status)status.textContent=message}
function activateCanvas(){shell?.classList.remove('leaflet-active');if(canvas)canvas.removeAttribute('aria-hidden')}
function activateLeaflet(){shell?.classList.add('leaflet-active');if(canvas)canvas.setAttribute('aria-hidden','true')}
function fallback(reason){
 if(fallbackStarted)return;
 fallbackStarted=true;appLoading=false;activateCanvas();
 setStatus((reason||'Leaflet could not start.')+' Loading the built-in canvas map…');
 loadApp('/js/map.js?v='+version,false);
}
window.__earthMapFallback=fallback;
function loadApp(src,primary){
 if(appLoading)return;
 appLoading=true;
 const script=document.createElement('script');script.src=src;script.async=true;
 let settled=false;
 const finish=(ok,reason)=>{
  if(settled)return;
  settled=true;clearTimeout(timer);appLoading=false;
  if(script.parentNode)script.remove();
  if(!ok){
   if(primary)fallback(reason||'Leaflet renderer failed to load.');
   else{activateCanvas();setStatus('Map renderer could not initialize ('+(reason||'startup failure')+'). Reload the page to retry.')}
   return;
  }
  if(!window.__earthMapRendererReady){
   if(primary)fallback('Leaflet loaded but did not initialize.');
   else{activateCanvas();setStatus('The built-in map loaded without initializing. Reload the page to retry.')}
  }
 };
 const timer=setTimeout(()=>finish(false,'Map renderer startup timed out'),8000);
 script.onload=()=>finish(true);
 script.onerror=()=>finish(false,'Map renderer script request failed');
 if(primary)activateLeaflet();
 document.body.appendChild(script);
}
function loadLeaflet(index){
 if(index>=scripts.length){fallback('Both Leaflet CDNs failed or were blocked.');return}
 const provider=scripts[index];
 if(window.L&&typeof window.L.map==='function'){
  const link=document.createElement('link');link.rel='stylesheet';link.href=provider.css;
  let settled=false;
  const next=()=>{
   if(settled)return;
   settled=true;clearTimeout(timer);if(link.parentNode)link.remove();
   if(index+1<scripts.length)loadLeaflet(index+1);else fallback('Leaflet stylesheets could not load.');
  };
  const timer=setTimeout(next,3500);
  link.onload=()=>{if(settled)return;settled=true;clearTimeout(timer);loadApp('/js/leaflet-map.js?v='+version,true)};
  link.onerror=next;document.head.appendChild(link);return;
 }
 const script=document.createElement('script');script.src=provider.js;script.async=true;
 let settled=false;
 const timer=setTimeout(()=>{if(settled)return;settled=true;if(script.parentNode)script.remove();loadLeaflet(index+1)},3500);
 script.onload=()=>{if(settled)return;settled=true;clearTimeout(timer);if(window.L&&typeof window.L.map==='function')loadLeaflet(index);else loadLeaflet(index+1)};
 script.onerror=()=>{if(settled)return;settled=true;clearTimeout(timer);if(script.parentNode)script.remove();loadLeaflet(index+1)};
 document.head.appendChild(script);
}
setStatus('Loading interactive map engine (no Google Maps API key required)…');
loadLeaflet(0);
})();