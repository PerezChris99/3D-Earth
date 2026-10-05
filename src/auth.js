/**
 * src/auth.js
 * Lightweight HMAC-SHA256 token auth using Node.js built-in crypto.
 * No jsonwebtoken dependency. Tokens are signed server-side and
 * verified without round-tripping to a DB for stateless access.
 *
 * Token format: base64(header).base64(payload).base64(signature)
 * Security: tokens expire, replay requires valid HMAC signature.
 */

const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'change-me-in-production-use-64-char-random-string';
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    throw new Error('JWT_SECRET must be configured with at least 32 random characters in production.');
}
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

function _b64url(str) {
    return Buffer.from(str).toString('base64url');
}

function _sign(data) {
    return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

/**
 * Issue a signed token for a user/role.
 * @param {string} userId
 * @param {string} role - 'viewer' | 'analyst' | 'admin'
 */
function issueToken(userId, role) {
    const payload = JSON.stringify({
        sub: String(userId).slice(0, 64),
        role: ['viewer', 'analyst', 'admin'].includes(role) ? role : 'viewer',
        iat: Date.now(),
        exp: Date.now() + TOKEN_TTL_MS
    });
    const header = _b64url('{"alg":"HS256","typ":"OST"}');
    const body = _b64url(payload);
    const sig = _sign(`${header}.${body}`);
    return `${header}.${body}.${sig}`;
}

/**
 * Verify a token. Returns decoded payload or null if invalid/expired.
 */
function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    // Constant-time comparison to prevent timing attacks
    const expected = _sign(`${header}.${body}`);
    const expectedBuf = Buffer.from(expected);
    const sigBuf = Buffer.from(sig);
    if (expectedBuf.length !== sigBuf.length) return null;
    if (!crypto.timingSafeEqual(expectedBuf, sigBuf)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
        if (Date.now() > payload.exp) return null; // expired
        return payload;
    } catch {
        return null;
    }
}

/**
 * Express middleware: require valid token on protected routes.
 * Attaches decoded payload to req.user.
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = payload;
    next();
}

/**
 * Express middleware: require a minimum role level.
 */
function requireRole(minRole) {
    const levels = { viewer: 0, analyst: 1, admin: 2 };
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        if ((levels[req.user.role] || 0) < (levels[minRole] || 0)) {
            return res.status(403).json({ error: 'Insufficient privileges' });
        }
        next();
    };
}

module.exports = { issueToken, verifyToken, requireAuth, requireRole };
