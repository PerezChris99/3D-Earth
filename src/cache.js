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

    async getOrSet(key, producer, ttlMs) {
        const cached = this.get(key);
        if (cached !== null) return cached;
        const cacheKey = String(key).slice(0, 256);
        if (this._inflight?.has(cacheKey)) return this._inflight.get(cacheKey);
        if (!this._inflight) this._inflight = new Map();
        const promise = Promise.resolve().then(producer).then(value => {
            if (value !== null && value !== undefined) this.set(cacheKey, value, ttlMs);
            return value;
        }).finally(() => this._inflight.delete(cacheKey));
        this._inflight.set(cacheKey, promise);
        return promise;
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
