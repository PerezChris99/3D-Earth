/**
 * src/middleware/requestLogger.js
 * Express middleware: logs every HTTP request with method, path, status,
 * response time (ms), client IP, and user-agent for auditing and debugging.
 *
 * Attaches a unique correlation ID to req.requestId so it can be referenced
 * in downstream error logs.
 */
'use strict';

const logger = require('../logger');

/**
 * Express request logging middleware.
 * Logs on response 'finish' so the status code is available.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestLogger(req, res, next) {
    const id    = logger.nextRequestId();
    req.requestId = id;

    const start = process.hrtime.bigint();

    res.on('finish', () => {
        const ms    = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
        const level = res.statusCode >= 500 ? 'error'
                    : res.statusCode >= 400 ? 'warn'
                    : 'http';
        logger[level]('HTTP', `${req.method} ${req.path} ${res.statusCode}`, {
            id,
            ms,
            ip: req.ip || req.socket?.remoteAddress || 'unknown',
            ua: (req.headers['user-agent'] || '').slice(0, 100),
        });
    });

    next();
}

module.exports = requestLogger;
