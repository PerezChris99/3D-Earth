(() => {
'use strict';

function initFallbackMap(){
 const root=document.getElementById('map'),status=document.getElementById('location-status'),button=document.getElementById('locate-me');if(!root)return;
 root.classList.add('map-fallback');root.innerHTML='<div id="fallback-map-tiles" class="fallback-map-tiles"></div><div id="fallback-map-marker" class="fallback-map-marker" hidden></div><div class="map-fallback-controls"><button type="button" id="fallback-zoom-in" aria-label="Zoom in">+</button><button type="button" id="fallback-zoom-out" aria-label="Zoom out">−</button></div><div class="map-fallback-credit">© OpenStreetMap contributors</div>';
 let zoom=2,lon=20,lat=0,drag=null;const tiles=document.getElementById('fallback-map-tiles'),marker=document.getElementById('fallback-map-marker');const say=t=>{if(status)status.textContent=t};
 function pixel(lonValue=lon,latValue=lat){const n=2**zoom,phi=Math.max(-85.0511,Math.min(85.0511,latValue))*Math.PI/180;return{x:(lonValue+180)/360*n*256,y:(1-Math.asinh(Math.tan(phi))/Math.PI)/2*n*256,n}}
 function render(){const p=pixel(),sx=Math.floor(p.x/256)-2,sy=Math.floor(p.y/256)-2;tiles.style.left='calc(50% - '+(p.x-sx*256)+'px)';tiles.style.top='calc(50% - '+(p.y-sy*256)+'px)';tiles.innerHTML='';for(let yy=0;yy<4;yy++)for(let xx=0;xx<4;xx++){const tx=sx+xx,ty=sy+yy,img=document.createElement('img');img.alt='';img.loading='lazy';img.referrerPolicy='strict-origin-when-cross-origin';img.src='https://tile.openstreetmap.org/'+zoom+'/'+((tx%p.n+p.n)%p.n)+'/'+Math.max(0,Math.min(p.n-1,ty))+'.png';tiles.appendChild(img)}marker.hidden=marker.dataset.visible!=='true';marker.style.left='50%';marker.style.top='50%'}
 root.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;const p=pixel();drag={x:e.clientX,y:e.clientY,lon,lat,px:p.x,py:p.y};root.setPointerCapture?.(e.pointerId)});
 root.addEventListener('pointermove',e=>{if(!drag)return;const world=256*2**zoom,x=drag.px-(e.clientX-drag.x),y=drag.py-(e.clientY-drag.y);lon=x/world*360-180;lat=Math.atan(Math.sinh(Math.PI*(1-2*y/world)))*180/Math.PI;lat=Math.max(-85,Math.min(85,lat));render()});
 root.addEventListener('pointerup',()=>{drag=null});root.addEventListener('pointercancel',()=>{drag=null});
 function zoomBy(delta){const next=Math.max(2,Math.min(18,zoom+delta));if(next!==zoom){zoom=next;render()}}
 document.getElementById('fallback-zoom-in').addEventListener('click',()=>zoomBy(1));document.getElementById('fallback-zoom-out').addEventListener('click',()=>zoomBy(-1));root.addEventListener('wheel',e=>{e.preventDefault();zoomBy(e.deltaY<0?1:-1)},{passive:false});
 if(button)button.addEventListener('click',()=>{if(!navigator.geolocation){say('This browser does not support device location. The map remains available.');return}say('Waiting for browser location permission…');navigator.geolocation.getCurrentPosition(p=>{lon=p.coords.longitude;lat=p.coords.latitude;marker.dataset.visible='true';render();say('Device location · '+(Number.isFinite(p.coords.accuracy)?p.coords.accuracy.toFixed(1)+' m reported':'accuracy unavailable')+' · WGS84');try{sessionStorage.setItem('3dearth-location',JSON.stringify({lat,lon,accuracy:p.coords.accuracy,timestamp:p.timestamp}))}catch(_){}},e=>say((e.code===1?'Location permission denied.':e.code===2?'Device location unavailable.':'Location request timed out.')+' The map remains available.'),{enableHighAccuracy:true,maximumAge:0,timeout:30000})});
 root.addEventListener('dblclick',()=>{zoom=2;lon=20;lat=0;marker.dataset.visible='';render();say('World map view restored.')});window.addEventListener('resize',render);render();say('World map fallback loaded · OpenStreetMap tiles · location is optional.');
}

const WORLD = [0, 20];
const WORLD_ZOOM = 2;
const $ = id => document.getElementById(id);
const status = $('location-status');
const button = $('locate-me');

if (!window.ol || !window.ol.Map) {
  initFallbackMap();
  return;
}

const map = new ol.Map({
  target: 'map',
  layers: [
    new ol.layer.Tile({
      source: new ol.source.OSM({
        attributions: '© OpenStreetMap contributors',
        crossOrigin: 'anonymous',
        referrerPolicy: 'strict-origin-when-cross-origin'
      })
    })
  ],
  view: new ol.View({
    center: ol.proj.fromLonLat(WORLD),
    zoom: WORLD_ZOOM,
    minZoom: 2,
    maxZoom: 19
  }),
  controls: ol.control.defaults({
    attribution: true,
    zoom: true,
    rotate: false
  })
});

const markerSource = new ol.source.Vector();
const accuracySource = new ol.source.Vector();
map.addLayer(new ol.layer.Vector({
  source: accuracySource,
  style: new ol.style.Style({
    fill: new ol.style.Fill({color:'rgba(117,201,255,.12)'}),
    stroke: new ol.style.Stroke({color:'rgba(117,201,255,.75)',width:1.5})
  })
}));
map.addLayer(new ol.layer.Vector({
  source: markerSource,
  style: new ol.style.Style({
    image: new ol.style.Circle({
      radius: 7,
      fill: new ol.style.Fill({color:'#75c9ff'}),
      stroke: new ol.style.Stroke({color:'#fff',width:2})
    })
  })
}));

let watchId = null;
let tracking = false;
let bestAccuracy = Infinity;

function setStatus(message) {
  status.textContent = message;
}

function renderPosition(position) {
  const c = position.coords;
  const lon = c.longitude;
  const lat = c.latitude;
  const accuracy = Number.isFinite(c.accuracy) ? c.accuracy : null;
  const point = new ol.geom.Point(ol.proj.fromLonLat([lon, lat]));

  markerSource.clear();
  markerSource.addFeature(new ol.Feature(point));

  accuracySource.clear();
  if (accuracy && accuracy > 0) {
    accuracySource.addFeature(new ol.Feature(
      new ol.geom.Circle(point.getCoordinates(), accuracy)
    ));
  }

  const view = map.getView();
  const currentCenter = view.getCenter();
  const currentZoom = view.getZoom();

  if (tracking || !Number.isFinite(bestAccuracy)) {
    view.animate({
      center: point.getCoordinates(),
      zoom: Math.max(currentZoom || 2, 17),
      duration: 500
    });
  }

  if (accuracy !== null) {
    bestAccuracy = Math.min(bestAccuracy, accuracy);
    const quality = accuracy <= 1
      ? '≤1 m reported'
      : accuracy.toFixed(1) + ' m reported';
    setStatus('Device location · ' + quality + ' · WGS84');
  } else {
    setStatus('Device location received · accuracy unavailable');
  }

  try {
    sessionStorage.setItem('3dearth-location', JSON.stringify({
      lat, lon, accuracy, timestamp: position.timestamp
    }));
  } catch (_) {}
}

function onError(error) {
  const message = error.code === 1
    ? 'Location permission was denied.'
    : error.code === 2
      ? 'The device could not determine a location.'
      : 'Location request timed out.';
  setStatus(message + ' The map remains available.');
  if (tracking) stopTracking();
}

function startTracking() {
  if (!navigator.geolocation) {
    setStatus('This browser does not provide geolocation.');
    return;
  }

  tracking = true;
  bestAccuracy = Infinity;
  button.textContent = 'STOP TRACKING';
  setStatus('Acquiring highest-accuracy device position…');

  watchId = navigator.geolocation.watchPosition(
    renderPosition,
    onError,
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30000
    }
  );
}

function stopTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  tracking = false;
  button.textContent = 'LOCATE ME';
  setStatus(bestAccuracy < Infinity
    ? 'Tracking stopped · best reported accuracy ' + bestAccuracy.toFixed(1) + ' m'
    : 'Location tracking stopped.');
}

function restore() {
  try {
    const raw = sessionStorage.getItem('3dearth-location');
    if (!raw) return;
    const loc = JSON.parse(raw);
    if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return;
    renderPosition({
      coords: {
        latitude: loc.lat,
        longitude: loc.lon,
        accuracy: Number.isFinite(loc.accuracy) ? loc.accuracy : null
      },
      timestamp: loc.timestamp || Date.now()
    });
    setStatus('Previous session location restored · press Locate Me for a fresh fix.');
  } catch (_) {}
}

button.addEventListener('click', () => tracking ? stopTracking() : startTracking());
window.addEventListener('resize', () => map.updateSize());
setTimeout(() => map.updateSize(), 100);
restore();
})();