/**
 * src/middleware/rateLimitWS.js
 * Per-IP WebSocket rate limiter and connection limiter.
 * Prevents:
 *  - WebSocket flood / amplification attacks
 *  - Single-IP exhaustion of server message processing
 *  - Slowloris-style WS keep-alive attacks (idle timeout)
 * No external deps — uses built-in Map and timers.
 */

const MAX_CONNS_PER_IP = 5;       // max concurrent WS connections per IP
const MAX_MSGS_PER_WINDOW = 30;   // max messages received per IP per window
const WINDOW_MS = 10_000;         // 10 second window
const IDLE_TIMEOUT_MS = 120_000;  // close idle connections after 2 minutes

// Map<ip, { count: number, windowStart: number }>
const msgTracker = new Map();

// Map<ip, number> — active connection count
const connTracker = new Map();

function getIp(req) {
    return (
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        'unknown'
    ).slice(0, 45); // clamp IPv6 length
}

/**
 * Call on every new WS connection.
 * Returns false if the connection should be rejected.
 */
function onConnect(req) {
    const ip = getIp(req);
    const current = connTracker.get(ip) || 0;
    if (current >= MAX_CONNS_PER_IP) {
        return { allowed: false, ip, reason: 'Too many connections from this IP' };
    }
    connTracker.set(ip, current + 1);
    return { allowed: true, ip };
}

/**
 * Call on WS close to decrement connection count.
 */
function onDisconnect(ip) {
    const current = connTracker.get(ip) || 1;
    const next = current - 1;
    if (next <= 0) connTracker.delete(ip);
    else connTracker.set(ip, next);
    msgTracker.delete(ip);
}

/**
 * Call on every incoming WS message.
 * Returns false if the sender should be rate-limited and connection closed.
 */
function onMessage(ip) {
    const now = Date.now();
    const entry = msgTracker.get(ip) || { count: 0, windowStart: now };
    if (now - entry.windowStart > WINDOW_MS) {
        // New window
        msgTracker.set(ip, { count: 1, windowStart: now });
        return true;
    }
    entry.count++;
    if (entry.count > MAX_MSGS_PER_WINDOW) {
        return false; // rate limit exceeded
    }
    msgTracker.set(ip, entry);
    return true;
}

/**
 * Attach idle timeout to a WS socket. Resets on each message.
 * Closes connection silently after IDLE_TIMEOUT_MS with no messages.
 */
function attachIdleTimeout(ws) {
    let timer = setTimeout(() => {
        if (ws.readyState === ws.OPEN) ws.terminate();
    }, IDLE_TIMEOUT_MS);

    const reset = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (ws.readyState === ws.OPEN) ws.terminate();
        }, IDLE_TIMEOUT_MS);
    };

    ws.on('message', reset);
    ws.on('close', () => clearTimeout(timer));
}

module.exports = { onConnect, onDisconnect, onMessage, attachIdleTimeout, getIp };
