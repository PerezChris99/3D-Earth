const test = require('node:test');
const assert = require('node:assert/strict');
const { createDataEngine } = require('../src/core/data-engine');
const { createDefaultProviders } = require('../src/providers/earth-providers');

test('Phase 1 registers all current live data providers', () => {
    const engine = createDataEngine();
    const ids = engine.status().map(p => p.id);
    assert.deepEqual(ids, ['celestrak-tle', 'opensky', 'usgs-earthquakes', 'nasa-firms']);
});

test('Phase 1 provider adapters expose normalized Earth envelopes', async () => {
    for (const provider of createDefaultProviders()) {
        const envelope = await provider.fetch();
        assert.equal(envelope.schemaVersion, '1.0');
        assert.equal(envelope.provider, provider.id);
        assert.equal(envelope.domain, provider.domain);
        assert.ok(Array.isArray(envelope.records));
        assert.ok(envelope.provenance.retrievedAt);
        for (const record of envelope.records.slice(0, 10)) {
            assert.equal(record.source, provider.id);
            if (record.lat != null) assert.ok(record.lat >= -90 && record.lat <= 90);
            if (record.lon != null) assert.ok(record.lon >= -180 && record.lon <= 180);
        }
    }
});
