/**
 * src/logger.js
 * Structured in-process logger for the OSINT Intelligence Gateway.
 *
 * - Development: colorized, human-readable output to stdout
 * - Production:  JSON lines to stdout (compatible with Datadog, CloudWatch, Loki)
 *
 * Log levels (ascending severity): DEBUG → HTTP → INFO → WARN → ERROR
 * Set LOG_LEVEL env var to control minimum level (default: DEBUG in dev, INFO in prod).
 *
 * No external dependencies — uses only Node.js built-ins.
 */
'use strict';

const IS_PROD = process.env.NODE_ENV === 'production';

const LEVELS = { DEBUG: 0, HTTP: 1, INFO: 2, WARN: 3, ERROR: 4 };
const MIN_LEVEL_NAME = (process.env.LOG_LEVEL || (IS_PROD ? 'INFO' : 'DEBUG')).toUpperCase();
const MIN_LEVEL = LEVELS[MIN_LEVEL_NAME] ?? LEVELS.INFO;

// ANSI escape codes for colorized dev output
const COL = {
    DEBUG: '\x1b[36m', // cyan
    HTTP:  '\x1b[34m', // blue
    INFO:  '\x1b[32m', // green
    WARN:  '\x1b[33m', // yellow
    ERROR: '\x1b[31m', // red
    DIM:   '\x1b[2m',
    RESET: '\x1b[0m',
};

let _seq = 0;

/**
 * Generate a short request correlation ID.
 * @returns {string}  e.g. "r00001b"
 */
function nextRequestId() {
    return `r${(++_seq).toString(36).padStart(6, '0')}`;
}

/**
 * Core log writer.
 * @param {'DEBUG'|'HTTP'|'INFO'|'WARN'|'ERROR'} level
 * @param {string} component  - module/subsystem name shown in the log
 * @param {string} message
 * @param {object} [meta]     - additional key-value fields
 */
function log(level, component, message, meta) {
    if ((LEVELS[level] ?? 99) < MIN_LEVEL) return;

    const ts = new Date().toISOString();

    if (IS_PROD) {
        // Structured JSON — one object per line
        const entry = { ts, level, component, message };
        if (meta && typeof meta === 'object' && Object.keys(meta).length) {
            Object.assign(entry, meta);
        }
        process.stdout.write(JSON.stringify(entry) + '\n');
    } else {
        // Colorized human-readable output
        const c   = COL[level] || COL.INFO;
        const dim = COL.DIM;
        const rst = COL.RESET;
        const metaStr = (meta && typeof meta === 'object' && Object.keys(meta).length)
            ? ` ${dim}${JSON.stringify(meta)}${rst}`
            : '';
        process.stdout.write(
            `${dim}${ts}${rst} ${c}[${level.padEnd(5)}]${rst} ${dim}[${component}]${rst} ${message}${metaStr}\n`
        );
    }
}

const logger = {
    debug: (component, message, meta) => log('DEBUG', component, message, meta),
    http:  (component, message, meta) => log('HTTP',  component, message, meta),
    info:  (component, message, meta) => log('INFO',  component, message, meta),
    warn:  (component, message, meta) => log('WARN',  component, message, meta),
    error: (component, message, meta) => log('ERROR', component, message, meta),
    nextRequestId,
};

module.exports = logger;
