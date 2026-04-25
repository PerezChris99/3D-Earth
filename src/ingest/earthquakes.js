/**
 * src/ingest/earthquakes.js
 * Fetches live earthquake data from USGS GeoJSON feed.
 * Free, no API key required. Updates every minute.
 * Returns array of {lat, lon, mag, depth, place, time}.
 */

const https = require('https');
const cache = require('../cache');

const CACHE_KEY = 'earthquakes:usgs';
const CACHE_TTL_MS = 60_000; // 1 minute
// All earthquakes in past hour, magnitude 1.0+
const URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/1.0_hour.geojson';

function httpsGetJson(url) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('EQ fetch timeout')), 10000);
        https.get(url, { headers: { 'User-Agent': 'OSINTGlobe/1.0' } }, (res) => {
            if (res.statusCode !== 200) { clearTimeout(timeout); return reject(new Error(`HTTP ${res.statusCode}`)); }
            let raw = '';
            res.on('data', c => { raw += c; if (raw.length > 2_000_000) { res.destroy(); reject(new Error('Too large')); } });
            res.on('end', () => { clearTimeout(timeout); try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
            res.on('error', e => { clearTimeout(timeout); reject(e); });
        }).on('error', e => { clearTimeout(timeout); reject(e); });
    });
}

async function getEarthquakes() {
    const cached = cache.get(CACHE_KEY);
    if (cached) return cached;
    try {
        const data = await httpsGetJson(URL);
        if (!data || !data.features) return [];
        const events = data.features.map(f => ({
            id: f.id,
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            depth: f.geometry.coordinates[2],
            mag: f.properties.mag,
            place: f.properties.place,
            time: f.properties.time
        }));
        cache.set(CACHE_KEY, events, CACHE_TTL_MS);
        return events;
    } catch (err) {
        console.error('[EQ] Fetch failed:', err.message);
        return [];
    }
}

module.exports = { getEarthquakes };
