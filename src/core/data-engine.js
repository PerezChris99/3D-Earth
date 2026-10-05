const { ProviderRegistry } = require('./provider-registry');
const { createDefaultProviders } = require('../providers/earth-providers');

function createDataEngine() {
    const registry = new ProviderRegistry();
    for (const provider of createDefaultProviders()) registry.register(provider);

    return {
        registry,
        async fetch(providerId) {
            const provider = registry.get(providerId);
            if (!provider) throw new Error(`Unknown provider: ${providerId}`);
            return provider.fetch();
        },
        async fetchAll() {
            const providers = registry.list();
            const results = await Promise.allSettled(providers.map(p => this.fetch(p.id)));
            return results.map((result, index) => ({
                provider: providers[index].id,
                status: result.status,
                envelope: result.status === 'fulfilled' ? result.value : null,
                error: result.status === 'rejected' ? result.reason.message : null,
            }));
        },
        status() {
            return registry.list();
        },
    };
}

module.exports = { createDataEngine };
