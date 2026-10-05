const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DOMAINS,
    OBJECT_TYPES,
    validateCoordinate,
    validateEarthRecord,
} = require('../src/core/earth-schema');
const { createDataEnvelope, isDataEnvelope } = require('../src/core/data-envelope');
const { DataProvider } = require('../src/core/provider');
const { ProviderRegistry } = require('../src/core/provider-registry');

test('Earth schema enforces WGS84 coordinate bounds', () => {
    assert.equal(validateCoordinate(0, 0), true);
    assert.equal(validateCoordinate(90, 180), true);
    assert.equal(validateCoordinate(-90, -180), true);
    assert.equal(validateCoordinate(91, 0), false);
    assert.equal(validateCoordinate(0, 181), false);
});

test('Earth records use the shared domain vocabulary', () => {
    const valid = validateEarthRecord({
        id: 'usgs-1',
        type: 'event',
        domain: 'earthquake',
        lat: 0.3,
        lon: 32.5,
        alt: -1000,
    });
    assert.equal(valid.valid, true);

    const invalid = validateEarthRecord({
        id: 'bad',
        type: 'event',
        domain: 'unknown-domain',
        lat: 200,
        lon: 500,
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.length >= 2);
    assert.ok(DOMAINS.includes('satellite'));
    assert.ok(OBJECT_TYPES.includes('observation'));
});

test('data envelopes carry provenance and freshness metadata', () => {
    const envelope = createDataEnvelope({
        provider: 'test-provider',
        domain: 'earthquake',
        records: [{ id: 'eq-1' }],
        sourceUrl: 'https://example.test/feed',
        license: 'test',
        observedAt: new Date(Date.now() - 1000),
        updateCadenceMs: 60000,
        confidence: 0.75,
    });

    assert.equal(isDataEnvelope(envelope), true);
    assert.equal(envelope.provider, 'test-provider');
    assert.equal(envelope.provenance.license, 'test');
    assert.equal(envelope.confidence, 0.75);
    assert.ok(envelope.freshness.ageMs >= 0);
});

test('provider registry prevents duplicate providers', async () => {
    class TestProvider extends DataProvider {
        async fetch() {
            return this.envelope([{ id: 'one' }], { confidence: 1 });
        }
    }

    const registry = new ProviderRegistry();
    const provider = new TestProvider({
        id: 'test',
        domain: 'event',
        name: 'Test Provider',
        license: 'test',
    });

    registry.register(provider);
    assert.equal(registry.get('test'), provider);
    assert.equal(registry.has('test'), true);
    assert.equal((await provider.fetch()).records.length, 1);
    assert.throws(() => registry.register(provider), /already registered/);
});
