'use strict';

const express = require('express');
const router = express.Router();

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

function cleanParam(value, fallback = '') {
  return String(value ?? fallback).trim();
}

router.get('/', async (req, res) => {
  const lat = Number(req.query.latitude);
  const lon = Number(req.query.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Invalid WGS84 coordinates.' });
  }

  const allowed = ['current', 'hourly', 'daily', 'timezone', 'forecast_days', 'cell_selection', 'models'];
  const query = new URLSearchParams();
  query.set('latitude', String(lat));
  query.set('longitude', String(lon));
  for (const key of allowed) {
    if (req.query[key] !== undefined) query.set(key, cleanParam(req.query[key]));
  }

  const base = process.env.OPEN_METEO_BASE_URL || 'https://api.open-meteo.com/v1/forecast';
  const apiKey = process.env.OPEN_METEO_API_KEY;
  if (apiKey) query.set('apikey', apiKey);

  const cacheKey = query.toString();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.value);

  try {
    const response = await fetch(`${base}?${query.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: 'Weather provider rejected the request.', detail: data.reason || null });
    cache.set(cacheKey, { value: data, expiresAt: Date.now() + CACHE_TTL_MS });
    if (cache.size > 1000) cache.delete(cache.keys().next().value);
    res.set('Cache-Control', 'public, max-age=60');
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: 'Weather provider unavailable.' });
  }
});

module.exports = router;
