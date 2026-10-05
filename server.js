// server.js
// ----------------------------------------------------
// Palantir-Style Intelligence Platform — Secure Gateway
// Production-hardened: structured logging, WS auth,
// per-client subscriptions, graceful shutdown, timeouts
// Security: Helmet, CORS, RateLimit, WSGuard, HMAC Auth
// ----------------------------------------------------

'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const WebSocket  = require('ws');
const path       = require('path');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const logger        = require('./src/logger');
const requestLogger = require('./src/middleware/requestLogger');

const apiRoutes   = require('./src/routes/api');
const geocodeRoutes = require('./src/routes/geocode');
const aoiRoutes   = require('./src/routes/aoi');
const notesRoutes = require('./src/routes/notes');
const { onConnect, onDisconnect, onMessage, attachIdleTimeout, getIp } = require('./src/middleware/rateLimitWS');
const { verifyToken } = require('./src/auth');
const { getFlights }          = require('./src/ingest/flights');
const { getEarthquakes }      = require('./src/ingest/earthquakes');
const { getThermalHotspots }  = require('./src/ingest/thermal');
const { runChecks, drainQueue }    = require('./src/alertEngine');
const { processBroadcastData }     = require('./src/intelligence');

// ==========================================
// PROCESS-LEVEL ERROR GUARDS
// ==========================================
process.on('uncaughtException', (err) => {
    logger.error('Process', 'Uncaught exception — shutting down', {
        message: err.message,
        stack: err.stack,
    });
    setTimeout(() => process.exit(1), 1000).unref();
});

process.on('unhandledRejection', (reason) => {
    logger.error('Process', 'Unhandled promise rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack:  reason instanceof Error ? reason.stack   : undefined,
    });
});

// ==========================================
// APP SETUP
// ==========================================
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, path: '/ws/live' });

const PORT    = process.env.PORT    || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ==========================================
// SECURITY HARDENING — HTTP Headers
// ==========================================
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "default-src":   ["'self'"],
            "script-src":    ["'self'", "'unsafe-inline'", "'unsafe-eval'",
                              "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net",
                              "https://threejs.org", "https://unpkg.com", "https://raw.githubusercontent.com"],
            "style-src":     ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            "img-src":       ["'self'", "data:", "blob:", "https://threejs.org", "https://raw.githubusercontent.com", "https://unpkg.com", "https://tile.openstreetmap.org"],
            "connect-src":   ["'self'", "ws:", "wss:", "https://celestrak.org", "https://celestrak.com",
                              "https://opensky-network.org", "https://earthquake.usgs.gov",
                              "https://unpkg.com", "https://cdn.jsdelivr.net", "https://tile.openstreetmap.org"],
            "worker-src":    ["'self'", "blob:"],
            "frame-src":     ["'none'"],
            "object-src":    ["'none'"],
            "base-uri":      ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
    hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : IS_PROD ? false : '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    message: { error: 'Too many requests — throttled.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/health',
});
app.use('/api/', apiLimiter);

// ==========================================
// BODY PARSING
// ==========================================
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ==========================================
// REQUEST LOGGING
// ==========================================
app.use(requestLogger);

// ==========================================
// REQUEST TIMEOUT (30 s safety net)
// ==========================================
app.use((req, res, next) => {
    res.setTimeout(30000, () => {
        logger.warn('HTTP', 'Request timed out', { path: req.path, id: req.requestId });
        if (!res.headersSent) res.status(503).json({ error: 'Request timeout' });
    });
    next();
});

// ==========================================
// STATIC FILES
// ==========================================
app.use(express.static(path.join(__dirname)));
app.use('/public', express.static(path.join(__dirname, 'public')));

// ==========================================
// API ROUTES
// ==========================================
app.use('/api/geocode', geocodeRoutes);
app.use('/api/aoi',   aoiRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api',       apiRoutes);

// SPA fallback
app.use((req, res, next) => {
    if (!req.path.startsWith('/api') && !req.path.includes('.')) {
        return res.sendFile(path.join(__dirname, 'index.html'));
    }
    next();
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
    const id = req.requestId || '?';
    logger.error('HTTP', 'Unhandled route error', {
        id,
        message: err.message,
        stack: IS_PROD ? undefined : err.stack,
        path: req.path,
    });
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Internal server error', ref: id });
});

// ==========================================
// WEBSOCKET — Secure Live Intel Stream
// ==========================================

/**
 * Send JSON to a single WS client, silently dropping if not OPEN.
 */
function safeSend(ws, payload) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(payload)); } catch (e) {
        logger.warn('WS', 'safeSend failed', { message: e.message });
    }
}

/**
 * Filter broadcast payload by per-client layer subscriptions and send.
 */
function sendToClient(ws, payload) {
    const layers = ws._clientState?.layers;
    if (!layers) { safeSend(ws, payload); return; }
    const filtered = {
        type:         payload.type,
        ts:           payload.ts,
        intelligence: payload.intelligence,
        alerts:       payload.alerts,
    };
    if (layers.flights)     filtered.flights     = payload.flights;
    if (layers.earthquakes) filtered.earthquakes = payload.earthquakes;
    if (layers.thermal)     filtered.thermal     = payload.thermal;
    safeSend(ws, filtered);
}

/**
 * Handle a structured command message received from a client.
 * Commands: set_layer, set_setting
 */
function handleClientCmd(ws, cmd) {
    if (!ws._clientState) return;
    if (cmd.action === 'set_layer') {
        const validLayers = ['satellites', 'flights', 'earthquakes', 'thermal'];
        if (!validLayers.includes(cmd.layer)) return;
        const enabled = Boolean(cmd.enabled);
        ws._clientState.layers[cmd.layer] = enabled;
        logger.debug('WS', `Layer toggle: ${cmd.layer}=${enabled}`, { user: ws._user?.sub });
        safeSend(ws, { type: 'cmd_ack', action: 'set_layer', layer: cmd.layer, enabled });
    } else if (cmd.action === 'set_setting') {
        const allowedSettings = ['atmo_exposure', 'fade_height', 'sun_distance', 'moon_distance'];
        if (!allowedSettings.includes(cmd.key)) return;
        ws._clientState.settings[cmd.key] = cmd.value;
        safeSend(ws, { type: 'cmd_ack', action: 'set_setting', key: cmd.key, value: cmd.value });
    }
}

wss.on('connection', (ws, req) => {
    // Rate-limit guard
    const { allowed, ip, reason } = onConnect(req);
    if (!allowed) {
        logger.warn('WS', `Connection rejected: ${reason}`, { ip });
        ws.close(1008, reason || 'Policy violation');
        return;
    }

    // Token authentication
    let user = null;
    try {
        const urlParams   = new URL(req.url, 'http://localhost').searchParams;
        const queryToken  = urlParams.get('token');
        const authHeader  = req.headers['authorization'] || '';
        const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        user = verifyToken(queryToken || headerToken);
    } catch { /* URL parse edge case */ }

    if (!user && IS_PROD) {
        logger.warn('WS', 'Rejected unauthenticated WS connection', { ip });
        ws.close(1008, 'Authentication required');
        return;
    }

    ws._user = user || { sub: 'anonymous', role: 'viewer' };
    ws._clientState = {
        layers:   { satellites: true, flights: true, earthquakes: true, thermal: false },
        settings: {},
    };

    logger.info('WS', `Client connected: ${ip}`, { user: ws._user.sub, role: ws._user.role });
    attachIdleTimeout(ws);

    ws.on('message', (raw) => {
        const rawStr = typeof raw === 'string' ? raw : raw.toString();
        if (rawStr.length > 2048) { ws.close(1009, 'Message too large'); return; }
        if (!onMessage(ip)) { ws.close(1008, 'Rate limit exceeded'); return; }
        let msg;
        try { msg = JSON.parse(rawStr); } catch { return; }
        if (msg && msg.type === 'cmd') handleClientCmd(ws, msg);
    });

    ws.on('close', () => {
        onDisconnect(ip);
        logger.info('WS', `Client disconnected: ${ip}`, { user: ws._user?.sub });
    });

    ws.on('error', (err) => {
        logger.error('WS', `Client error: ${ip}`, { message: err.message, user: ws._user?.sub });
    });

    safeSend(ws, {
        type:   'connected',
        msg:    'OSINT stream active',
        ts:     Date.now(),
        layers: ws._clientState.layers,
    });
});

// ==========================================
// LIVE DATA BROADCAST LOOP
// ==========================================
let broadcastInterval = null;

async function runBroadcastCycle() {
    try {
        const [flightsResult, earthquakesResult, thermalResult] = await Promise.allSettled([
            getFlights(), getEarthquakes(), getThermalHotspots(),
        ]);

        const f = flightsResult.status    === 'fulfilled' ? flightsResult.value    : [];
        const e = earthquakesResult.status === 'fulfilled' ? earthquakesResult.value : [];
        const t = thermalResult.status    === 'fulfilled' ? thermalResult.value    : [];

        if (flightsResult.status    !== 'fulfilled') logger.warn('Broadcast', 'Flights fetch failed',     { reason: String(flightsResult.reason) });
        if (earthquakesResult.status !== 'fulfilled') logger.warn('Broadcast', 'Earthquakes fetch failed', { reason: String(earthquakesResult.reason) });
        if (thermalResult.status    !== 'fulfilled') logger.warn('Broadcast', 'Thermal fetch failed',     { reason: String(thermalResult.reason) });

        const enriched = processBroadcastData({ flights: f, earthquakes: e, thermal: t });
        runChecks({ flights: enriched.flights, earthquakes: enriched.earthquakes, thermal: enriched.thermal });
        const pending = drainQueue();

        const payload = {
            type:         'delta_update',
            ts:           Date.now(),
            flights:      enriched.flights,
            earthquakes:  enriched.earthquakes,
            thermal:      enriched.thermal,
            intelligence: enriched.intelligence,
            alerts:       pending,
        };

        let sentCount = 0;
        wss.clients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) { sendToClient(ws, payload); sentCount++; }
        });

        logger.debug('Broadcast', `Cycle complete — ${sentCount} client(s)`, {
            flights: f.length, earthquakes: e.length, thermal: t.length, alerts: pending.length,
        });

    } catch (err) {
        logger.error('Broadcast', 'Broadcast cycle error', { message: err.message, stack: err.stack });
    }
}

function startBroadcast() {
    if (broadcastInterval) return;
    broadcastInterval = setInterval(runBroadcastCycle, 5000);
    runBroadcastCycle();
}

// ==========================================
// SERVER STARTUP
// ==========================================
server.listen(PORT, () => {
    logger.info('Server', '====================================');
    logger.info('Server', ' OSINT Intelligence Gateway v1.0');
    logger.info('Server', ` Port     : ${PORT}`);
    logger.info('Server', ` Mode     : ${IS_PROD ? 'production' : 'development'}`);
    logger.info('Server', ' Security : Helmet, CORS, RateLimit, WSGuard, HMAC Auth');
    logger.info('Server', ' Logging  : Structured (JSON in prod, colorized in dev)');
    logger.info('Server', ' WS Auth  : Token required in production');
    logger.info('Server', '====================================');
    startBroadcast();
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
function gracefulShutdown(signal) {
    logger.info('Server', `${signal} received — beginning graceful shutdown`);
    clearInterval(broadcastInterval);
    wss.clients.forEach(ws => ws.close(1001, 'Server shutting down'));
    wss.close(() => {
        server.close(() => {
            logger.info('Server', 'Server shut down cleanly');
            process.exit(0);
        });
    });
    setTimeout(() => { logger.warn('Server', 'Forced exit after timeout'); process.exit(1); }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
