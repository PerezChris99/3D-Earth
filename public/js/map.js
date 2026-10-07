(() => {
'use strict';

const WORLD = [0, 20];
const WORLD_ZOOM = 2;
const $ = id => document.getElementById(id);
const status = $('location-status');
const button = $('locate-me');

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