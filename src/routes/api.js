/**
 * src/routes/api.js
 * All REST API route handlers.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const logger = require('../logger');
const { query: supabaseQuery, isConfigured: supabaseConfigured } = require('../supabase');

const { getTLEs } = require('../ingest/tle');
const { getSatelliteCatalog } = require('../ingest/satcat');
const { getFlights } = require('../ingest/flights');
const { getEarthquakes } = require('../ingest/earthquakes');
const { getThermalHotspots } = require('../ingest/thermal');
const { issueToken } = require('../auth');
const { sanitizeRequest } = require('../middleware/sanitize');
const cache = require('../cache');

const RESPONSE_TTL_MS = 5_000;
function cacheable(res) { res.set('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=30'); }

router.use(sanitizeRequest);

router.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()), ts: Date.now() });
});

router.get('/status', (req, res) => {
    const mem = process.memoryUsage();
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()), env: process.env.NODE_ENV || 'development', memory: { heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB', heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB', rss: Math.round(mem.rss / 1024 / 1024) + 'MB' }, ts: Date.now(), database: supabaseConfigured() ? 'configured' : 'not-configured' });
});

router.post('/auth/token', (req, res) => {
    const userId = String(req.body.userId || 'anonymous').slice(0, 64);
    const role = ['viewer', 'analyst', 'admin'].includes(req.body.role) ? req.body.role : 'viewer';
    const privilegedSecret = process.env.ANALYST_AUTH_SECRET;
    if (role !== 'viewer') {
        const supplied = Buffer.from(String(req.body.secret || ''));
        const expected = Buffer.from(String(privilegedSecret || ''));
        if (!privilegedSecret || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return res.status(403).json({ error: 'Privileged authentication required.' });
    }
    res.json({ token: issueToken(userId, role) });
});

router.get('/positions', async (req, res) => {
    try {
        const payload = await cache.getOrSet('api:positions', async () => {
            const [satellites, flights, earthquakes, thermal] = await Promise.allSettled([getTLEs('stations'), getFlights(), getEarthquakes(), getThermalHotspots()]);
            return { ts: Date.now(), satellites: satellites.status === 'fulfilled' ? satellites.value : [], flights: flights.status === 'fulfilled' ? flights.value : [], earthquakes: earthquakes.status === 'fulfilled' ? earthquakes.value : [], thermal: thermal.status === 'fulfilled' ? thermal.value : [] };
        }, RESPONSE_TTL_MS);
        cacheable(res); res.json(payload);
    } catch (err) {
        logger.error('API', '/positions error', { message: err.message, id: req.requestId });
        res.status(500).json({ error: 'Data gateway failure' });
    }
});

router.get('/satellites', async (req, res) => {
    try { const requestedGroup = String(req.query.group || 'stations').toLowerCase(); const allowed = new Set(['stations','weather','gps-ops','science','starlink','active']); const group = allowed.has(requestedGroup) ? requestedGroup : 'stations'; const payload = await cache.getOrSet('api:satellites:'+group, async () => ({ ts: Date.now(), source: 'CelesTrak GP', group, items: await getTLEs(group) }), 15_000); cacheable(res); res.json(payload); }
    catch (err) { logger.error('API', '/satellites error', { message: err.message }); res.status(500).json({ error: 'Satellite data unavailable' }); }
});

router.get('/satellites/:norad', async (req, res) => {
    try { const norad = String(req.params.norad || '').replace(/\\D/g, ''); if (!norad || norad.length > 9) return res.status(400).json({ error: 'Invalid satellite catalog number' }); cacheable(res); res.json(await getSatelliteCatalog(norad)); }
    catch (err) { logger.error('API', '/satellites/:norad error', { message: err.message }); res.status(404).json({ error: 'Satellite catalog record unavailable' }); }
});

router.get('/flights', async (req, res) => { try { cacheable(res); res.json(await getFlights()); } catch (err) { logger.error('API', '/flights error', { message: err.message }); res.status(500).json({ error: 'Flight data unavailable' }); } });
router.get('/earthquakes', async (req, res) => { try { cacheable(res); res.json(await getEarthquakes()); } catch (err) { logger.error('API', '/earthquakes error', { message: err.message }); res.status(500).json({ error: 'Seismic data unavailable' }); } });
router.get('/thermal', async (req, res) => { try { cacheable(res); res.json(await getThermalHotspots()); } catch (err) { logger.error('API', '/thermal error', { message: err.message }); res.status(500).json({ error: 'Thermal data unavailable' }); } });

router.get('/observatory/summary', async (req, res) => {
    try {
        if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase server integration is not configured' });
        const [satellites, observations, samples, events, sources, sectorRows] = await Promise.all([
            supabaseQuery('satellites', 'select=id,norad_id,name,object_type,owner_country,operator&order=name.asc&limit=20'),
            supabaseQuery('satellite_observations', 'select=id,satellite_id,observed_at,latitude,longitude,altitude_km,speed_km_s&order=observed_at.desc&limit=20'),
            supabaseQuery('seed_telemetry_samples', 'select=sample_id,sampled_at,latitude,longitude,altitude_km,speed_km_s&order=sample_id.asc&limit=20'),
            supabaseQuery('earth_events', 'select=id,event_type,occurred_at,latitude,longitude,magnitude,title&order=occurred_at.desc&limit=20'),
            supabaseQuery('observatory_sources', 'select=id,slug,sector,name,provider,authority_level,expected_refresh_seconds,coverage,active&order=sector.asc'),
            supabaseQuery('observatory_sources', 'select=sector&active=is.true&order=sector.asc'),
        ]);
        const freshness = {};
        const sectors = [...new Set(sectorRows.map(row => row.sector).filter(Boolean))];
        const latestRows = (await Promise.all(sectors.map(sector =>
            supabaseQuery('observatory_observations', 'select=sector,observed_at,source_id,quality_status&id=not.is.null&sector=eq.' + encodeURIComponent(sector) + '&order=observed_at.desc,id.desc&limit=1')
        ))).flat();
        for (const row of latestRows) {
            if (!freshness[row.sector]) {
                const ageSeconds = Math.max(0, (Date.now() - new Date(row.observed_at).getTime()) / 1000);
                const source = sources.find(item => item.id === row.source_id) || null;
                freshness[row.sector] = { latest_observed_at: row.observed_at, age_seconds: Math.round(ageSeconds), status: source?.expected_refresh_seconds && ageSeconds <= source.expected_refresh_seconds ? 'LIVE' : ageSeconds < 86400 ? 'RECENT' : 'STALE', quality_status: row.quality_status };
            }
        }
        cacheable(res); res.json({ ts: Date.now(), source: 'Supabase', satellites, observations, samples, events, observatory: { sources, freshness } });
    } catch (err) {
        logger.error('API', '/observatory/summary error', { message: err.message });
        res.status(502).json({ error: 'Supabase observatory data unavailable' });
    }
});

router.get('/observatory/samples', async (req, res) => {
    try {
        if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase server integration is not configured' });
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
        const after = Math.max(Number(req.query.after) || 0, 0);
        const filter = after > 0 ? '&sample_id=gt.' + after : '';
        const samples = await supabaseQuery('seed_telemetry_samples', 'select=sample_id,sampled_at,latitude,longitude,altitude_km,speed_km_s,source&order=sample_id.asc&limit=' + limit + filter);
        const nextCursor = samples.length === limit ? samples[samples.length - 1].sample_id : null;
        res.json({ ts: Date.now(), source: 'Supabase synthetic development dataset', count: samples.length, next_cursor: nextCursor, samples });
    } catch (err) {
        logger.error('API', '/observatory/samples error', { message: err.message });
        res.status(502).json({ error: 'Supabase sample data unavailable' });
    }
});

module.exports = router;
