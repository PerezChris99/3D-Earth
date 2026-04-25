/**
 * src/ingest/thermal.js
 * Fetches NASA FIRMS active fire / thermal hotspot data.
 * Requires a free MAP_KEY from https://firms.modaps.eosdis.nasa.gov/api/map_key/
 * Falls back to empty array if key not configured.
 * Returns array of {lat, lon, brightness, acq_date, acq_time, confidence}.
 */

const https = require('https');
const cache = require('../cache');

const CACHE_KEY = 'thermal:firms';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function buildUrl() {
    const key = process.env.FIRMS_MAP_KEY;
    if (!key) return null;
    // VIIRS NOAA-20, last 24h, global bounding box
    return `https://firms.modaps.eosdis.nasa.gov/api/area/json/${key}/VIIRS_NOAA20_NRT/-180,-65,180,75/1`;
}

function httpsGetJson(url) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('FIRMS timeout')), 15000);
        https.get(url, { headers: { 'User-Agent': 'OSINTGlobe/1.0' } }, (res) => {
            if (res.statusCode !== 200) { clearTimeout(timeout); return resolve([]); }
            let raw = '';
            res.on('data', c => { raw += c; if (raw.length > 10_000_000) { res.destroy(); resolve([]); } });
            res.on('end', () => {
                clearTimeout(timeout);
                try { resolve(JSON.parse(raw)); } catch { resolve([]); }
            });
            res.on('error', () => { clearTimeout(timeout); resolve([]); });
        }).on('error', () => { clearTimeout(timeout); resolve([]); });
    });
}

async function getThermalHotspots() {
    const cached = cache.get(CACHE_KEY);
    if (cached) return cached;
    const url = buildUrl();
    if (!url) return []; // No key configured
    try {
        const raw = await httpsGetJson(url);
        const hotspots = Array.isArray(raw) ? raw.map(h => ({
            lat: parseFloat(h.latitude),
            lon: parseFloat(h.longitude),
            brightness: parseFloat(h.bright_ti4 || h.brightness || 0),
            confidence: h.confidence || 'n',
            date: h.acq_date,
            time: h.acq_time
        })).filter(h => !isNaN(h.lat) && !isNaN(h.lon)) : [];
        cache.set(CACHE_KEY, hotspots, CACHE_TTL_MS);
        return hotspots;
    } catch (err) {
        console.error('[Thermal] Fetch failed:', err.message);
        return [];
    }
}

module.exports = { getThermalHotspots };
