/**
 * src/cache.js
 * Lightweight in-memory TTL cache using built-in Map.
 * No external dependencies. Safe against memory exhaustion:
 * - Max entry cap (LRU eviction)
 * - Automatic TTL expiry on read
 */

const MAX_ENTRIES = 500;

class TTLCache {
    constructor() {
        this._store = new Map();
    }

    set(key, value, ttlMs) {
        // Evict oldest entry if at capacity (basic LRU)
        if (this._store.size >= MAX_ENTRIES) {
            const oldest = this._store.keys().next().value;
            this._store.delete(oldest);
        }
        this._store.set(String(key).slice(0, 256), {
            value,
            expiresAt: Date.now() + ttlMs
        });
    }

    get(key) {
        const entry = this._store.get(String(key).slice(0, 256));
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this._store.delete(key);
            return null;
        }
        return entry.value;
    }

    has(key) {
        return this.get(key) !== null;
    }

    del(key) {
        this._store.delete(String(key).slice(0, 256));
    }

    size() {
        return this._store.size;
    }
}

module.exports = new TTLCache();
