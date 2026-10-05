/**
 * src/core/provider-registry.js
 * Runtime registry for Earth Data Engine providers.
 */

const { assertProvider } = require('./provider');

class ProviderRegistry {
    constructor() {
        this._providers = new Map();
    }

    register(provider) {
        assertProvider(provider);
        if (this._providers.has(provider.id)) {
            throw new Error(`Provider already registered: ${provider.id}`);
        }
        this._providers.set(provider.id, provider);
        return provider;
    }

    get(id) {
        return this._providers.get(String(id)) || null;
    }

    list() {
        return [...this._providers.values()].map(provider => ({
            id: provider.id,
            domain: provider.domain,
            name: provider.name,
            license: provider.license,
            updateCadenceMs: provider.updateCadenceMs,
        }));
    }

    has(id) {
        return this._providers.has(String(id));
    }

    clear() {
        this._providers.clear();
    }
}

module.exports = { ProviderRegistry };
