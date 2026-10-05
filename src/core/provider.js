/**
 * src/core/provider.js
 * Provider contract for the Earth Data Engine.
 *
 * A provider is responsible for one external source/domain. It must not leak
 * provider-specific response shapes into the rest of the application.
 */

const { createDataEnvelope } = require('./data-envelope');

class DataProvider {
    constructor({ id, domain, name, license, updateCadenceMs = null }) {
        if (!id || !domain || !name) {
            throw new Error('Provider requires id, domain and name');
        }
        this.id = id;
        this.domain = domain;
        this.name = name;
        this.license = license || 'unspecified';
        this.updateCadenceMs = updateCadenceMs;
    }

    /**
     * Implementations return a normalized array of records.
     * @returns {Promise<import('./data-envelope').DataEnvelope>}
     */
    async fetch() {
        throw new Error(`Provider ${this.id} does not implement fetch()`);
    }

    envelope(records, metadata = {}) {
        return createDataEnvelope({
            provider: this.id,
            domain: this.domain,
            records,
            license: this.license,
            updateCadenceMs: this.updateCadenceMs,
            ...metadata,
        });
    }
}

function assertProvider(provider) {
    if (!(provider instanceof DataProvider)) {
        throw new TypeError('Expected a DataProvider instance');
    }
    return provider;
}

module.exports = { DataProvider, assertProvider };
