'use strict';

const express = require('express');
const router = express.Router();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 1100;
const cache = new Map();
let lastRequestAt = 0;
let queue = Promise.resolve();

function keyFor(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

async function throttledFetch(url) {
  const run = async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': '3D-Earth/1.0 (+https://github.com/PerezChris99/3D-Earth)'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    return response.json();
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

router.get('/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Invalid WGS84 coordinates.' });
  }
  const key = keyFor(lat, lon);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.value);

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    const data = await throttledFetch(url);
    const value = {
      display_name: data.display_name || 'Selected coordinates',
      lat: data.lat,
      lon: data.lon,
      address: data.address || {},
      osm_type: data.osm_type || null,
      osm_id: data.osm_id || null
    };
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    if (cache.size > 5000) cache.delete(cache.keys().next().value);
    res.json(value);
  } catch (error) {
    res.status(502).json({ error: 'Reverse geocoding unavailable.' });
  }
});

module.exports = router;
