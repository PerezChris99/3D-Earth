/**
 * src/middleware/sanitize.js
 * Input sanitization to prevent XSS, injection, and prototype pollution.
 * Applied to all incoming JSON bodies and query params.
 * Uses only built-in Node.js — no external deps.
 */

// Characters allowed in identifiers and names (strict allowlist)
const SAFE_ID_RE = /^[a-zA-Z0-9_\-\.@]{1,128}$/;

/**
 * Strip HTML/script tags and dangerous chars from a string.
 */
function sanitizeString(val) {
    if (typeof val !== 'string') return '';
    return val
        .slice(0, 1024)
        .replace(/[<>'"`;\\]/g, '')       // strip XSS chars
        .replace(/javascript:/gi, '')       // strip JS protocol
        .replace(/on\w+\s*=/gi, '')         // strip event handlers
        .trim();
}

/**
 * Deep-sanitize an object or array. Prevents prototype pollution by
 * blocking __proto__, constructor, and prototype keys.
 */
function sanitizeObject(obj, depth = 0) {
    if (depth > 5) return {};
    if (Array.isArray(obj)) {
        return obj.slice(0, 100).map(v => sanitizeObject(v, depth + 1));
    }
    if (obj !== null && typeof obj === 'object') {
        const clean = {};
        for (const key of Object.keys(obj)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
            const safeKey = sanitizeString(key).slice(0, 64);
            if (!safeKey) continue;
            clean[safeKey] = sanitizeObject(obj[key], depth + 1);
        }
        return clean;
    }
    if (typeof obj === 'string') return sanitizeString(obj);
    if (typeof obj === 'number') return isFinite(obj) ? obj : 0;
    if (typeof obj === 'boolean') return obj;
    return null;
}

/**
 * Express middleware: sanitize req.body and req.query in place.
 */
function sanitizeRequest(req, res, next) {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }
    if (req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query);
    }
    next();
}

module.exports = { sanitizeString, sanitizeObject, sanitizeRequest, SAFE_ID_RE };
