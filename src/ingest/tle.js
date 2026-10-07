/**
 * src/ingest/tle.js
 * Fetches and parses TLE data from CelesTrak.
 * Caches for 2 hours to stay within bandwidth and API courtesy limits.
 * Uses Node.js built-in https module — no external deps.
 */

const https = require('https');
const cache = require('../cache');

const TLE_CACHE_KEY = 'tle:active';
const TLE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const GROUPS = new Set(['stations','weather','gps-ops','science','starlink','active']);
const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php';

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('TLE fetch timeout')), 15000);
        https.get(url, { headers: { 'User-Agent': 'OSINTGlobe/1.0' } }, (res) => {
            if (res.statusCode !== 200) {
                clearTimeout(timeout);
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let raw = '';
            res.on('data', chunk => { raw += chunk; if (raw.length > 5_000_000) { res.destroy(); reject(new Error('Response too large')); } });
            res.on('end', () => { clearTimeout(timeout); resolve(raw); });
            res.on('error', err => { clearTimeout(timeout); reject(err); });
        }).on('error', err => { clearTimeout(timeout); reject(err); });
    });
}

function parseTLE(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const results = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
        const name = lines[i];
        const tle1 = lines[i + 1];
        const tle2 = lines[i + 2];
        if (!tle1.startsWith('1 ') || !tle2.startsWith('2 ')) continue;
        results.push({ name, tle1, tle2 });
    }
    return results;
}

async function getTLEs() {
    const cached = cache.get(TLE_CACHE_KEY);
    if (cached) return cached;
    try {
        const url = `${TLE_URL}?GROUP=${encodeURIComponent(group.toUpperCase())}&FORMAT=tle`;
        const raw = await httpsGet(url);
        const parsed = parseTLE(raw);
        if (parsed.length > 0) {
            cache.set(cacheKey, parsed, TLE_TTL_MS);
        }
        return parsed;
    } catch (err) {
        console.error('[TLE] Fetch failed:', err.message);
        return [];
    }
}

module.exports = { getTLEs };
