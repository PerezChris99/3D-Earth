/* 3D Earth geospatial layer: WGS84 coordinates, OpenStreetMap and Open-Meteo. */
(() => {
  'use strict';

  const state = {
    map: null,
    marker: null,
    accuracyCircle: null,
    location: null,
    lastReverseAt: 0,
    reverseCache: new Map(),
    weather: null,
    earthMarker: null
  };

  const WGS84_A = 6378137.0;
  const WGS84_F = 1 / 298.257223563;
  const E2 = WGS84_F * (2 - WGS84_F);

  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function loadLeafletRuntime() {
    if (window.L) return Promise.resolve(window.L);
    if (window.__leafletRuntimePromise) return window.__leafletRuntimePromise;
    window.__leafletRuntimePromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-leaflet-css]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        css.dataset.leafletCss = 'true';
        document.head.appendChild(css);
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet loaded without global L'));
      script.onerror = () => reject(new Error('Leaflet runtime unavailable'));
      document.head.appendChild(script);
    });
    return window.__leafletRuntimePromise;
  }

  function initMap() {
    if (state.map) return;
    if (!window.L) return;
    state.map = L.map('osm-map', { zoomControl: true, worldCopyJump: true, minZoom: 2, maxZoom: 19 }).setView([0, 0], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
    }).addTo(state.map);
    state.map.on('click', e => selectLocation(e.latlng.lat, e.latlng.lng, { zoom: true, source: 'map' }));
    setTimeout(() => state.map.invalidateSize(), 250);
  }

  async function setMapVisible(visible) {
    if (visible && !window.L) {
      try { await loadLeafletRuntime(); } catch (error) { console.error('[3D Earth] Map runtime unavailable:', error); return; }
    }
    initMap();
    const shell = $('map-shell');
    if (!shell) return;
    shell.classList.toggle('map-visible', visible);
    if (visible && state.map) setTimeout(() => state.map.invalidateSize(), 80);
  }

  function wgs84ToUnitVector(latDeg, lonDeg, heightM = 0) {
    const lat = latDeg * Math.PI / 180;
    const lon = lonDeg * Math.PI / 180;
    const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
    const N = WGS84_A / Math.sqrt(1 - E2 * sinLat * sinLat);
    const x = (N + heightM) * cosLat * Math.cos(lon);
    const y = (N * (1 - E2) + heightM) * sinLat;
    const z = (N + heightM) * cosLat * Math.sin(lon);
    const norm = Math.hypot(x, y, z);
    return new THREE.Vector3(x / norm, y / norm, z / norm);
  }

  function addEarthMarker(lat, lon) {
    const api = window.globeAPI;
    if (!api || !window.THREE) return;
    const group = api.getEarthGroup();
    if (!group) return;
    if (state.earthMarker) {
      try { group.remove(state.earthMarker); state.earthMarker.geometry?.dispose(); state.earthMarker.material?.dispose(); } catch (_) {}
    }
    const p = wgs84ToUnitVector(lat, lon, 0);
    const geometry = new THREE.SphereGeometry(0.012, 20, 20);
    const material = new THREE.MeshBasicMaterial({ color: 0x00eaff, transparent: true, opacity: 0.95 });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(p.clone().multiplyScalar(1.018));
    marker.userData = { type: 'user-location', latitude: lat, longitude: lon };
    group.add(marker);
    state.earthMarker = marker;
  }

  function centerGlobe(lat, lon) {
    const api = window.globeAPI;
    if (!api || !window.THREE) return;
    const group = api.getEarthGroup();
    const camera = api.getCamera();
    const controls = api.getControls();
    if (!group || !camera || !controls) return;

    api.pauseRotation?.();

    const local = wgs84ToUnitVector(lat, lon);
    group.updateMatrixWorld(true);
    const world = local.clone();
    group.localToWorld(world);
    world.normalize();

    const destination = world.multiplyScalar(2.05);
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const started = performance.now();
    const duration = 850;

    function ease(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function fly(now) {
      const t = Math.min(1, (now - started) / duration);
      const e = ease(t);
      camera.position.lerpVectors(startPosition, destination, e);
      controls.target.lerpVectors(startTarget, new THREE.Vector3(0, 0, 0), e);
      controls.update();
      if (t < 1) requestAnimationFrame(fly);
    }
    requestAnimationFrame(fly);
  }

  function placeMapMarker(lat, lon, accuracy) {
    initMap();
    if (!state.map) return;
    if (state.marker) state.map.removeLayer(state.marker);
    state.marker = L.marker([lat, lon], { title: 'Selected location' }).addTo(state.map);
    if (accuracy && Number.isFinite(accuracy)) {
      if (state.accuracyCircle) state.map.removeLayer(state.accuracyCircle);
      state.accuracyCircle = L.circle([lat, lon], { radius: accuracy, color: '#00dcff', fillOpacity: 0.08, weight: 1 }).addTo(state.map);
    }
    state.map.setView([lat, lon], Math.max(state.map.getZoom(), accuracy && accuracy < 100 ? 16 : 10), { animate: true });
  }

  function setLocationUI(lat, lon, accuracy, name, timezone) {
    $('location-status').textContent = accuracy ? `GPS ±${Math.round(accuracy)}m` : 'LOCATION SET';
    $('location-name').textContent = name || 'Selected coordinates';
    $('location-coords').textContent = `${lat.toFixed(6)}°, ${lon.toFixed(6)}°${accuracy ? ` · ±${Math.round(accuracy)} m` : ''}`;
    $('location-timezone').textContent = timezone ? `Timezone: ${timezone}` : 'Timezone: resolving…';
    $('map-coords').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    $('geo-lat').value = lat.toFixed(6);
    $('geo-lon').value = lon.toFixed(6);
  }

  async function reverseGeocode(lat, lon) {
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (state.reverseCache.has(key)) return state.reverseCache.get(key);
    const wait = Math.max(0, 1100 - (Date.now() - state.lastReverseAt));
    if (wait) await new Promise(r => setTimeout(r, wait));
    state.lastReverseAt = Date.now();
    try {
      const url = `/api/geocode/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Reverse geocode HTTP ${response.status}`);
      const data = await response.json();
      const result = data.display_name || 'Selected location';
      state.reverseCache.set(key, result);
      return result;
    } catch (error) {
      console.warn('Reverse geocoding unavailable:', error);
      return 'Selected coordinates';
    }
  }

  function weatherCodeText(code) {
    const map = {0:['Clear','☀'],1:['Mainly clear','🌤'],2:['Partly cloudy','⛅'],3:['Overcast','☁'],45:['Fog','〰'],48:['Rime fog','〰'],51:['Light drizzle','🌦'],53:['Drizzle','🌦'],55:['Dense drizzle','🌧'],61:['Light rain','🌦'],63:['Rain','🌧'],65:['Heavy rain','🌧'],71:['Light snow','🌨'],73:['Snow','❄'],75:['Heavy snow','❄'],80:['Rain showers','🌦'],81:['Rain showers','🌧'],82:['Heavy showers','🌧'],95:['Thunderstorm','⛈'],96:['Thunderstorm + hail','⛈'],99:['Thunderstorm + hail','⛈']};
    return map[code] || ['Unknown','◌'];
  }

  function updateDayState(currentTime, sunrise, sunset) {
    const now = new Date(currentTime).getTime();
    const rise = new Date(sunrise).getTime();
    const set = new Date(sunset).getTime();
    const isDay = now >= rise && now < set;
    $('weather-day-state').textContent = isDay ? 'DAYLIGHT · solar illumination' : 'NIGHT · city lights / dark hemisphere';
    return isDay;
  }

  async function loadWeather(lat, lon) {
    $('weather-summary').textContent = 'Loading live conditions…';
    try {
      const params = new URLSearchParams({
        latitude: lat, longitude: lon,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,pressure_msl,wind_speed_10m,weather_code,is_day',
        hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m',
        daily: 'sunrise,sunset',
        timezone: 'auto',
        forecast_days: '2',
        cell_selection: 'nearest',
        models: 'best_match'
      });
      const response = await fetch(`/api/weather?${params}`);
      if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
      const data = await response.json();
      state.weather = data;
      const [summary, icon] = weatherCodeText(data.current.weather_code);
      $('weather-temp').textContent = `${Math.round(data.current.temperature_2m)}°C`;
      $('weather-icon').textContent = icon;
      $('weather-summary').textContent = summary;
      $('weather-feels').textContent = `${Math.round(data.current.apparent_temperature)}°C`;
      $('weather-humidity').textContent = `${data.current.relative_humidity_2m}%`;
      $('weather-wind').textContent = `${Math.round(data.current.wind_speed_10m)} km/h`;
      $('weather-pressure').textContent = `${Math.round(data.current.pressure_msl)} hPa`;
      $('weather-location').textContent = `${Number(data.latitude).toFixed(4)}°, ${Number(data.longitude).toFixed(4)}° · ${data.timezone}`;
      const localNow = new Date(data.current.time);
      $('weather-local-time').textContent = localNow.toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium', timeZone: data.timezone });
      updateDayState(data.current.time, data.daily.sunrise[0], data.daily.sunset[0]);
      $('location-timezone').textContent = `Timezone: ${data.timezone} · UTC${data.utc_offset_seconds >= 0 ? '+' : ''}${(data.utc_offset_seconds/3600).toFixed(1)}`;

      const forecast = $('weather-forecast');
      if (forecast) {
        forecast.innerHTML = '';
        const nowMs = Date.now();
        const rows = data.hourly.time.map((time, i) => ({
          time, temp: data.hourly.temperature_2m[i], rain: data.hourly.precipitation_probability[i],
          wind: data.hourly.wind_speed_10m[i]
        })).filter(row => new Date(row.time).getTime() >= nowMs).slice(0, 12);
        rows.forEach(row => {
          const item = document.createElement('div');
          item.className = 'forecast-row';
          const t = new Date(row.time);
          item.innerHTML = `<span>${t.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',timeZone:data.timezone})}</span><b>${Math.round(row.temp)}°</b><span>${Math.round(row.rain)}% rain</span><span>${Math.round(row.wind)} km/h</span>`;
          forecast.appendChild(item);
        });
      }
      $('weather-source').textContent = `Model grid: ${Number(data.latitude).toFixed(3)}°, ${Number(data.longitude).toFixed(3)}° · elevation ${Math.round(data.elevation || 0)} m · Open-Meteo`;
      return data;
    } catch (error) {
      console.error('Weather load failed:', error);
      $('weather-summary').textContent = 'Weather service unavailable for this location.';
      return null;
    }
  }

  async function selectLocation(lat, lon, options = {}) {
    lat = Number(lat); lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      alert('Enter a valid WGS84 latitude (-90 to 90) and longitude (-180 to 180).');
      return;
    }
    const accuracy = options.accuracy;
    state.location = { lat, lon, accuracy, source: options.source || 'manual' };
    setLocationUI(lat, lon, accuracy, 'Resolving location…');
    placeMapMarker(lat, lon, accuracy);
    addEarthMarker(lat, lon);
    centerGlobe(lat, lon);
    const [name, weather] = await Promise.all([reverseGeocode(lat, lon), loadWeather(lat, lon)]);
    setLocationUI(lat, lon, accuracy, name, weather?.timezone);
    document.body.classList.remove('left-open');
    document.querySelector('[data-tab="weather"]')?.click();
  }

  function requestGps() {
    const modal = $('geo-consent');
    if (!navigator.geolocation) {
      alert('This browser does not expose GPS/geolocation.');
      return;
    }
    modal?.classList.remove('hidden');
  }

  function acceptGps() {
    $('geo-consent')?.classList.add('hidden');
    $('location-status').textContent = 'REQUESTING GPS…';
    navigator.geolocation.getCurrentPosition(
      position => selectLocation(position.coords.latitude, position.coords.longitude, { accuracy: position.coords.accuracy, source: 'gps', zoom: true }),
      error => {
        $('location-status').textContent = 'LOCATION DENIED';
        const messages = {1:'Location permission was denied.',2:'Your device could not determine a location.',3:'Location request timed out.'};
        alert(messages[error.code] || 'Unable to obtain your location.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }

  async function bind() {
    // Do not make Leaflet part of the dashboard load critical path. The globe must render first.
    try { await loadLeafletRuntime(); initMap(); } catch (error) { console.warn('[3D Earth] Map runtime deferred:', error); }
    $('btn-map-mode')?.addEventListener('click', () => {
      const visible = !$('map-shell').classList.contains('map-visible');
      setMapVisible(visible);
    });
    $('locate-me-btn')?.addEventListener('click', requestGps);
    $('geo-accept')?.addEventListener('click', acceptGps);
    $('geo-cancel')?.addEventListener('click', () => $('geo-consent')?.classList.add('hidden'));
    $('show-coordinates-btn')?.addEventListener('click', () => selectLocation($('geo-lat').value, $('geo-lon').value, { source: 'manual', zoom: true }));
    $('globe-ctrl-hdr')?.addEventListener('click', () => $('globe-ctrl-body')?.classList.toggle('open'));
    window.addEventListener('resize', () => state.map?.invalidateSize());
  }

  window.geoWeather = { selectLocation, requestGps, setMapVisible, getLocation: () => state.location, getWeather: () => state.weather };
  window.addEventListener('load', bind);
})();