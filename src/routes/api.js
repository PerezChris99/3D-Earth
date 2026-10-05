/**
 * src/routes/api.js
 * All REST API route handlers.
 * Security: All inputs sanitized. All errors logged with structured logger.
 */

const express = require('express');
const crypto = require('crypto');
const router  = express.Router();
const logger  = require('../logger');

const { getTLEs }            = require('../ingest/tle');
const { getSatelliteCatalog } = require('../ingest/satcat');
const { getFlights }         = require('../ingest/flights');
const { getEarthquakes }     = require('../ingest/earthquakes');
const { getThermalHotspots } = require('../ingest/thermal');
const { issueToken }         = require('../auth');
const { sanitizeRequest }    = require('../middleware/sanitize');

router.use(sanitizeRequest);

// Health check — always public
router.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()), ts: Date.now() });
});

// Detailed status — memory, uptime, environment (no sensitive data)
router.get('/status', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        status:  'ok',
        uptime:  Math.floor(process.uptime()),
        env:     process.env.NODE_ENV || 'development',
        memory: {
            heapUsed:  Math.round(mem.heapUsed  / 1024 / 1024) + 'MB',
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
            rss:       Math.round(mem.rss       / 1024 / 1024) + 'MB',
        },
        ts: Date.now(),
    });
});

// --- Auth ---
// Issue a demo viewer token (production: add real credential verification here)
router.post('/auth/token', (req, res) => {
    const userId = String(req.body.userId || 'anonymous').slice(0, 64);
    const role = ['viewer', 'analyst', 'admin'].includes(req.body.role) ? req.body.role : 'viewer';
    const privilegedSecret = process.env.ANALYST_AUTH_SECRET;
    if (role !== 'viewer') {
        const supplied = Buffer.from(String(req.body.secret || ''));
        const expected = Buffer.from(String(privilegedSecret || ''));
        if (!privilegedSecret || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
            return res.status(403).json({ error: 'Privileged authentication required.' });
        }
    }
    const token = issueToken(userId, role);
    res.json({ token });
});

// --- Data endpoints ---
// Aggregate all live domains in one call (minimizes client HTTP roundtrips)
router.get('/positions', async (req, res) => {
    try {
        const [satellites, flights, earthquakes, thermal] = await Promise.allSettled([
            getTLEs(),
            getFlights(),
            getEarthquakes(),
            getThermalHotspots()
        ]);
        res.json({
            ts: Date.now(),
            satellites: satellites.status === 'fulfilled' ? satellites.value : [],
            flights:    flights.status    === 'fulfilled' ? flights.value    : [],
            earthquakes:earthquakes.status === 'fulfilled'? earthquakes.value: [],
            thermal:    thermal.status    === 'fulfilled' ? thermal.value    : []
        });
    } catch (err) {
        logger.error('API', '/positions error', { message: err.message, id: req.requestId });
        res.status(500).json({ error: 'Data gateway failure' });
    }
});

router.get('/satellites', async (req, res) => {
    try { res.json(await getTLEs()); }
    catch (err) { logger.error('API', '/satellites error', { message: err.message }); res.status(500).json({ error: 'Satellite data unavailable' }); }
});

router.get('/satellites/:norad', async (req, res) => {
    try {
        const norad = String(req.params.norad || '').replace(/\\D/g, '');
        if (!norad || norad.length > 9) return res.status(400).json({ error: 'Invalid satellite catalog number' });
        res.json(await getSatelliteCatalog(norad));
    } catch (err) {
        logger.error('API', '/satellites/:norad error', { message: err.message });
        res.status(404).json({ error: 'Satellite catalog record unavailable' });
    }
});

router.get('/flights', async (req, res) => {
    try { res.json(await getFlights()); }
    catch (err) { logger.error('API', '/flights error', { message: err.message }); res.status(500).json({ error: 'Flight data unavailable' }); }
});

router.get('/earthquakes', async (req, res) => {
    try { res.json(await getEarthquakes()); }
    catch (err) { logger.error('API', '/earthquakes error', { message: err.message }); res.status(500).json({ error: 'Seismic data unavailable' }); }
});

router.get('/thermal', async (req, res) => {
    try { res.json(await getThermalHotspots()); }
    catch (err) { logger.error('API', '/thermal error', { message: err.message }); res.status(500).json({ error: 'Thermal data unavailable' }); }
});

module.exports = router;
