/**
 * src/ingest/flights.js
 * Fetches live aircraft positions from OpenSky Network.
 * Returns an array of flight objects with lat/lon/alt/callsign.
 * Uses Node.js built-in https — no external deps.
 * Caches for 15 seconds (OpenSky free tier: 10s resolution).
 */

const https = require('https');
const cache = require('../cache');

const CACHE_KEY = 'flights:opensky';
const CACHE_TTL_MS = 15_000; // 15 seconds

function buildUrl() {
    const user = process.env.OPENSKY_USERNAME;
    const pass = process.env.OPENSKY_PASSWORD;
    if (user && pass) {
        return `https://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@opensky-network.org/api/states/all`;
    }
    return 'https://opensky-network.org/api/states/all';
}

function httpsGetJson(url) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Flights fetch timeout')), 12000);
        const req = https.get(url, { headers: { 'User-Agent': 'OSINTGlobe/1.0' } }, (res) => {
            if (res.statusCode === 429) { clearTimeout(timeout); return resolve(null); } // rate limited
            if (res.statusCode !== 200) { clearTimeout(timeout); return reject(new Error(`HTTP ${res.statusCode}`)); }
            let raw = '';
            res.on('data', c => { raw += c; if (raw.length > 8_000_000) { res.destroy(); reject(new Error('Too large')); } });
            res.on('end', () => { clearTimeout(timeout); try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
            res.on('error', e => { clearTimeout(timeout); reject(e); });
        });
        req.on('error', e => { clearTimeout(timeout); reject(e); });
    });
}

/**
 * OpenSky state vector fields:
 * [icao24, callsign, origin_country, time_position, last_contact,
 *  longitude, latitude, baro_altitude, on_ground, velocity,
 *  true_track, vertical_rate, sensors, geo_altitude, squawk, spi, position_source]
 */
function parseStates(data) {
    if (!data || !Array.isArray(data.states)) return [];
    return data.states
        .filter(s => s[6] !== null && s[5] !== null) // must have lat/lon
        .map(s => ({
            id: s[0],
            callsign: (s[1] || '').trim(),
            country: s[2] || '',
            lon: s[5],
            lat: s[6],
            alt: s[7] || 0,
            onGround: s[8],
            velocity: s[9] || 0,
            heading: s[10] || 0,
            squawk: s[14] || ''
        }));
}

async function getFlights() {
    const cached = cache.get(CACHE_KEY);
    if (cached) return cached;
    try {
        const data = await httpsGetJson(buildUrl());
        if (!data) return [];
        const flights = parseStates(data);
        cache.set(CACHE_KEY, flights, CACHE_TTL_MS);
        return flights;
    } catch (err) {
        console.error('[Flights] Fetch failed:', err.message);
        return [];
    }
}

module.exports = { getFlights };
