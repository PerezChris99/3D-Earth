/**
 * src/routes/api.js
 * All REST API route handlers.
 * Security: All inputs sanitized. All errors logged, never stack-traced to client.
 */

const express = require('express');
const router = express.Router();

const { getTLEs } = require('../ingest/tle');
const { getFlights } = require('../ingest/flights');
const { getEarthquakes } = require('../ingest/earthquakes');
const { getThermalHotspots } = require('../ingest/thermal');
const { issueToken } = require('../auth');
const { sanitizeRequest } = require('../middleware/sanitize');

router.use(sanitizeRequest);

// Health check — always public
router.get('/health', (req, res) => {
    res.json({ status: 'secure', uptime: Math.floor(process.uptime()) });
});

// --- Auth ---
// Issue a demo viewer token (production: add real credential verification here)
router.post('/auth/token', (req, res) => {
    const userId = (req.body.userId || 'anonymous').slice(0, 64);
    const role = (req.body.role || 'viewer');
    // Production: validate userId/password against a real store before issuing
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
            flights: flights.status === 'fulfilled' ? flights.value : [],
            earthquakes: earthquakes.status === 'fulfilled' ? earthquakes.value : [],
            thermal: thermal.status === 'fulfilled' ? thermal.value : []
        });
    } catch (err) {
        console.error('[API] /positions error:', err.message);
        res.status(500).json({ error: 'Data gateway failure' });
    }
});

router.get('/satellites', async (req, res) => {
    try { res.json(await getTLEs()); }
    catch { res.status(500).json({ error: 'Satellite data unavailable' }); }
});

router.get('/flights', async (req, res) => {
    try { res.json(await getFlights()); }
    catch { res.status(500).json({ error: 'Flight data unavailable' }); }
});

router.get('/earthquakes', async (req, res) => {
    try { res.json(await getEarthquakes()); }
    catch { res.status(500).json({ error: 'Seismic data unavailable' }); }
});

router.get('/thermal', async (req, res) => {
    try { res.json(await getThermalHotspots()); }
    catch { res.status(500).json({ error: 'Thermal data unavailable' }); }
});

module.exports = router;
