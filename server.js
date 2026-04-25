// server.js
// ----------------------------------------------------
// Palantir-Style Intelligence Platform — Secure Gateway
// Phase 1: Live multi-domain data ingest + WS streaming
// Security: Helmet, CORS, Rate-Limit, WS limiter, sanitize, HMAC auth
// ----------------------------------------------------

'use strict';

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const apiRoutes   = require('./src/routes/api');
const aoiRoutes   = require('./src/routes/aoi');
const notesRoutes = require('./src/routes/notes');
const { onConnect, onDisconnect, onMessage, attachIdleTimeout, getIp } = require('./src/middleware/rateLimitWS');
const { getFlights }        = require('./src/ingest/flights');
const { getEarthquakes }    = require('./src/ingest/earthquakes');
const { getThermalHotspots }= require('./src/ingest/thermal');
const { runChecks, drainQueue } = require('./src/alertEngine');
const { processBroadcastData } = require('./src/intelligence');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws/live' });

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ==========================================
// SECURITY HARDENING — Layer 1: HTTP Headers
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
            "img-src":       ["'self'", "data:", "blob:", "https://threejs.org", "https://raw.githubusercontent.com", "https://unpkg.com"],
            "connect-src":   ["'self'", "ws:", "wss:", "https://celestrak.org", "https://celestrak.com",
                              "https://opensky-network.org", "https://earthquake.usgs.gov",
                              "https://unpkg.com", "https://cdn.jsdelivr.net"],
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

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : IS_PROD ? false : '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    message: { error: 'Too many requests — throttled.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/health'
});
app.use('/api/', apiLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.disable('x-powered-by');

app.use(express.static(path.join(__dirname)));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);
app.use('/api/aoi', aoiRoutes);
app.use('/api/notes', notesRoutes);

app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api') && !req.path.includes('.')) {
        return res.sendFile(path.join(__dirname, 'index.html'));
    }
    next();
});

app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// ==========================================
// WEBSOCKET — Secure Live Intel Stream
// ==========================================
function safeSend(ws, payload) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(payload)); } catch { }
}

function broadcast(payload) {
    const msg = JSON.stringify(payload);
    wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(msg); } catch { }
        }
    });
}

wss.on('connection', (ws, req) => {
    const { allowed, ip, reason } = onConnect(req);
    if (!allowed) { ws.close(1008, reason || 'Policy violation'); return; }
    console.log(`[WS] Connected: ${ip}`);
    attachIdleTimeout(ws);
    ws.on('message', (raw) => {
        if (raw.length > 1024) { ws.close(1009, 'Message too large'); return; }
        if (!onMessage(ip)) { ws.close(1008, 'Rate limit exceeded'); return; }
    });
    ws.on('close', () => { onDisconnect(ip); console.log(`[WS] Disconnected: ${ip}`); });
    ws.on('error', (err) => { console.error(`[WS] Error ${ip}:`, err.message); });
    safeSend(ws, { type: 'connected', msg: 'OSINT stream active', ts: Date.now() });
});

// ==========================================
// LIVE DATA BROADCAST LOOP
// ==========================================
let broadcastInterval = null;

async function runBroadcastCycle() {
    try {
        const [flights, earthquakes, thermal] = await Promise.allSettled([
            getFlights(), getEarthquakes(), getThermalHotspots()
        ]);
        const f = flights.status === 'fulfilled'     ? flights.value     : [];
        const e = earthquakes.status === 'fulfilled' ? earthquakes.value : [];
        const t = thermal.status === 'fulfilled'     ? thermal.value     : [];
        const enriched = processBroadcastData({ flights: f, earthquakes: e, thermal: t });
        runChecks({ flights: enriched.flights, earthquakes: enriched.earthquakes, thermal: enriched.thermal });
        const pending = drainQueue();
        broadcast({
            type: 'delta_update',
            ts: Date.now(),
            flights:      enriched.flights,
            earthquakes:  enriched.earthquakes,
            thermal:      enriched.thermal,
            intelligence: enriched.intelligence,
            alerts: pending
        });
    } catch (err) { console.error('[Broadcast]', err.message); }
}

function startBroadcast() {
    if (broadcastInterval) return;
    broadcastInterval = setInterval(runBroadcastCycle, 5000);
    runBroadcastCycle();
}

server.listen(PORT, () => {
    console.log(`\n====================================`);
    console.log(` OSINT Intelligence Gateway v1.0`);
    console.log(` Port     : ${PORT}`);
    console.log(` Security : Helmet, CORS, RateLimit, WSGuard, HMAC Auth`);
    console.log(` Static   : index.html @ root`);
    console.log(`====================================\n`);
    startBroadcast();
});

process.on('SIGTERM', () => { clearInterval(broadcastInterval); wss.close(() => server.close(() => process.exit(0))); });
process.on('SIGINT',  () => { clearInterval(broadcastInterval); wss.close(() => server.close(() => process.exit(0))); });
