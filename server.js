// server.js
// ----------------------------------------------------
// Palantir-Style Intelligence Platform Backend Gateway
// Phase 0/1: Setup secure gateway, serve static files, 
// stream live positional data over WebSockets
// ----------------------------------------------------

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// ==========================================
// SECURITY AUDIT & HARDENING (Middleware)
// ==========================================

// 1. Helmet: Sets 15+ secure HTTP headers (XSS, Clickjacking, MIME-sniff protection)
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://threejs.org", "https://unpkg.com", "https://raw.githubusercontent.com"],
            "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            "img-src": ["'self'", "data:", "blob:", "https://threejs.org", "https://raw.githubusercontent.com"],
            "connect-src": ["'self'", "https://celestrak.com", "https://unpkg.com", "ws:", "wss:", "http:", "https:"],
            "worker-src": ["'self'", "blob:"],
        },
    },
    crossOriginEmbedderPolicy: false // Allows external imagery (like map tiles)
}));

// 2. CORS: Restrict cross-origin requests
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST']
}));

// 3. Rate Limiting: Prevent DDoS and Brute Force attacks
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per clock sync
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// 4. Data parsing & limits (Prevent payload abuse)
app.use(express.json({ limit: '10kb' })); // Restrict JSON body size

// Serve static frontend files (The 3D Earth)
app.use(express.static(path.join(__dirname, '/')));

// ==========================================
// API ROUTES (REST)
// ==========================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'secure', uptime: process.uptime() });
});

// Mock/Proxy endpoint for Positions (To be wired to OpenSky, AISHub, CelesTrak)
app.get('/api/positions', async (req, res) => {
    try {
        // Here we'd proxy out to APIs securely using backend keys
        // Returning a stub for Phase 0 demonstration
        res.json({
            satellites: [],
            flights: [],
            vessels: []
        });
    } catch (err) {
        res.status(500).json({ error: 'Data gateway failure' });
    }
});

// ==========================================
// WEBSOCKET (REAL-TIME STREAMING)
// ==========================================
wss.on('connection', (ws, req) => {
    // Validate origins if necessary
    const ip = req.socket.remoteAddress;
    console.log(`[SECURE WS] Client connected targeting live feeds from IP: ${ip}`);

    // Stream mocked delta updates every 5 seconds (Phase 0)
    const streamInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'delta_update',
                timestamp: Date.now(),
                data: {
                    domain: 'flight', 
                    updates: [] 
                }
            }));
        }
    }, 5000);

    ws.on('close', () => {
        clearInterval(streamInterval);
        console.log(`[SECURE WS] Client disconnected`);
    });
});

// START SERVER
server.listen(PORT, () => {
    console.log(`\n================================`);
    console.log(`🛡️ Intelligence Gateway Active 🛡️`);
    console.log(`================================`);
    console.log(`➔ Port: ${PORT}`);
    console.log(`➔ Security: Helmet, CORS, Rate-Limiting enabled.`);
});