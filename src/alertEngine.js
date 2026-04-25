/**
 * src/alertEngine.js
 * Alert engine — watches broadcast data for AOI intersections + threshold triggers.
 * Fires to registered webhook(s) and queues for WS clients.
 *
 * Webhook delivery: plain Node.js `https` — no external dependencies.
 */
'use strict';

const https = require('https');
const url   = require('url');
const { testPoints } = require('./aoi');

/** In-memory alert queue for WS push (last 100). */
const alertQueue = [];
const MAX_QUEUE = 100;

/** Webhook targets: [{ url: string, secret: string }] */
const webhooks = [];

/**
 * Register a webhook target.
 * @param {string} webhookUrl  Full HTTPS URL to POST alerts to
 * @param {string} [secret]    Optional shared secret (sent in X-OSINT-Signature header, HMAC-SHA256)
 */
function registerWebhook(webhookUrl, secret) {
    // Basic validation — must be https in production
    try { new URL(webhookUrl); } catch { throw new Error('Invalid webhook URL'); }
    webhooks.push({ url: webhookUrl, secret: secret || '' });
}

/**
 * Run alert checks after each broadcast cycle.
 * @param {{ flights: any[], earthquakes: any[], thermal: any[] }} data
 * @returns {number} Number of new alerts triggered
 */
function runChecks(data) {
    const triggered = [];

    // AOI intersection checks
    if (Array.isArray(data.flights))     triggered.push(...testPoints(data.flights,     'flight'));
    if (Array.isArray(data.earthquakes)) triggered.push(...testPoints(data.earthquakes, 'earthquake'));
    if (Array.isArray(data.thermal))     triggered.push(...testPoints(data.thermal,     'thermal'));

    // Threshold: large earthquake
    if (Array.isArray(data.earthquakes)) {
        data.earthquakes.forEach(eq => {
            if (eq.mag >= 5.5) {
                triggered.push({
                    aoiId: 'threshold', aoiName: 'Global M5.5+', domain: 'earthquake',
                    item: eq
                });
            }
        });
    }

    // Threshold: emergency squawk codes
    if (Array.isArray(data.flights)) {
        data.flights.forEach(f => {
            if (f.squawk === '7700' || f.squawk === '7600' || f.squawk === '7500') {
                triggered.push({
                    aoiId: 'threshold', aoiName: `Squawk ${f.squawk}`, domain: 'flight',
                    item: f
                });
            }
        });
    }

    // Deduplicate by item id within last 60s
    const now = Date.now();
    const newAlerts = triggered.filter(t => {
        const itemId = t.item.id || `${t.item.lat}_${t.item.lon}`;
        const dup = alertQueue.some(a =>
            a.aoiId === t.aoiId &&
            (a.item.id || `${a.item.lat}_${a.item.lon}`) === itemId &&
            (now - a.ts) < 60_000
        );
        return !dup;
    });

    newAlerts.forEach(alert => {
        const record = { ...alert, ts: now };
        alertQueue.push(record);
        if (alertQueue.length > MAX_QUEUE) alertQueue.shift();
        deliverWebhook(record);
    });

    return newAlerts.length;
}

/** Drain the alert queue for WS broadcast. Clears queue after read. */
function drainQueue() {
    return alertQueue.splice(0);
}

/** Peek at current queue without clearing. */
function peekQueue() {
    return [...alertQueue];
}

/** Deliver alert to all registered webhooks (fire-and-forget). */
function deliverWebhook(alert) {
    if (webhooks.length === 0) return;
    const body = JSON.stringify(alert);
    webhooks.forEach(wh => {
        try {
            const parsed = new URL(wh.url);
            const options = {
                hostname: parsed.hostname,
                port:     parsed.port || 443,
                path:     parsed.pathname + parsed.search,
                method:   'POST',
                headers: {
                    'Content-Type':   'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'User-Agent':     'OSINT-Globe/1.0'
                }
            };
            if (wh.secret) {
                const crypto = require('crypto');
                const sig = crypto.createHmac('sha256', wh.secret).update(body).digest('hex');
                options.headers['X-OSINT-Signature'] = `sha256=${sig}`;
            }
            const req = https.request(options);
            req.on('error', () => {}); // silent on delivery failure
            req.setTimeout(5000, () => req.destroy());
            req.write(body);
            req.end();
        } catch (_) {}
    });
}

module.exports = { registerWebhook, runChecks, drainQueue, peekQueue };
